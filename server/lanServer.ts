import { createServer as createHttpServer } from "node:http";
import os from "node:os";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, type WebSocket } from "ws";
import { LanMatchSimulation } from "../src/net/LanMatchSimulation";
import { LanRoomManager } from "../src/net/LanRoomManager";
import { P2PSignalingRegistry } from "../src/net/P2PSignalingRegistry";
import type { LanClientMessage, LanServerMessage } from "../src/net/LanProtocol";

const PORT = Number(process.env.PORT ?? 5173);
const HOST = "0.0.0.0";
const SIM_TICK_MS = 1000 / 30;
const SNAPSHOT_MS = 1000 / 20;
const IDLE_SHUTDOWN_MS = Number(process.env.LAN_IDLE_SHUTDOWN_MS ?? 5 * 60 * 1000);
const P2P_SIGNALING_ENABLED = process.env.P2P_SIGNALING_ENABLED !== "false";
const P2P_ROOM_TTL_MS = Number(process.env.P2P_ROOM_TTL_MS ?? 8000);

interface ClientSocket {
  id: string;
  name: string;
  socket: WebSocket;
}

interface ActiveMatch {
  simulation: LanMatchSimulation;
  lastSnapshotAt: number;
}

const vite = await createViteServer({
  server: { middlewareMode: true, host: HOST },
  appType: "spa",
});
const httpServer = createHttpServer(vite.middlewares);
const wss = new WebSocketServer({ server: httpServer, path: "/multiplayer" });
const rooms = new LanRoomManager();
const p2pRooms = new P2PSignalingRegistry(P2P_ROOM_TTL_MS);
const clients = new Map<string, ClientSocket>();
const matches = new Map<string, ActiveMatch>();
let hasHostedRoom = false;
let idleShutdownTimer: ReturnType<typeof setTimeout> | null = null;

wss.on("connection", (socket) => {
  const client: ClientSocket = {
    id: crypto.randomUUID(),
    name: "Player",
    socket,
  };
  clients.set(client.id, client);
  send(client, { type: "welcome", clientId: client.id });
  sendRoomList(client);
  sendP2PRoomList(client);

  socket.on("message", (data) => {
    try {
      handleMessage(client, JSON.parse(String(data)) as LanClientMessage);
    } catch (error) {
      send(client, { type: "error", message: error instanceof Error ? error.message : "Invalid message." });
    }
  });

  socket.on("close", () => {
    const previousRoom = rooms.leaveRoom(client.id);
    p2pRooms.removeHost(client.id);
    clients.delete(client.id);
    if (previousRoom) broadcastLobby(previousRoom.id);
    broadcastRoomList();
    broadcastP2PRoomList();
    scheduleIdleShutdownIfNeeded();
  });
});

function handleMessage(client: ClientSocket, message: LanClientMessage): void {
  switch (message.type) {
    case "hello":
      client.name = sanitizeName(message.playerName);
      sendRoomList(client);
      break;
    case "createRoom": {
      client.name = sanitizeName(message.playerName);
      const room = rooms.createRoom(client, message.roomName, message.map);
      hasHostedRoom = true;
      cancelIdleShutdown();
      matches.delete(room.id);
      send(client, { type: "lobby", lobby: rooms.toLobby(room) });
      broadcastRoomList();
      break;
    }
    case "joinRoom": {
      client.name = sanitizeName(message.playerName);
      const room = rooms.joinRoom(client, message.roomId);
      if (!room) {
        send(client, { type: "error", message: "Room not found." });
        return;
      }
      broadcastLobby(room.id);
      broadcastRoomList();
      cancelIdleShutdown();
      if (room.phase !== "lobby") {
        const joinedPlayer = room.players.find((player) => player.id === client.id);
        if (joinedPlayer) matches.get(room.id)?.simulation.addPlayer(joinedPlayer);
        send(client, { type: "matchStarted", roomId: room.id, map: room.map });
      }
      break;
    }
    case "leaveRoom": {
      const room = rooms.leaveRoom(client.id);
      if (room) broadcastLobby(room.id);
      broadcastRoomList();
      scheduleIdleShutdownIfNeeded();
      break;
    }
    case "setTeam": {
      const room = rooms.setTeam(client.id, message.team);
      if (room) {
        broadcastLobby(room.id);
        broadcastRoomList();
      }
      break;
    }
    case "startMatch": {
      const room = rooms.startMatch(client.id);
      if (!room) {
        send(client, { type: "error", message: "Only the host can start the match." });
        return;
      }
      matches.set(room.id, {
        simulation: new LanMatchSimulation(room.id, room.players, room.map),
        lastSnapshotAt: 0,
      });
      broadcastToRoom(room.id, { type: "matchStarted", roomId: room.id, map: room.map });
      broadcastLobby(room.id);
      broadcastRoomList();
      break;
    }
    case "voteRematch": {
      const roomId = rooms.getClientRoomId(client.id);
      const match = roomId ? matches.get(roomId) : null;
      match?.simulation.voteRematch(client.id);
      break;
    }
    case "returnToLobby": {
      const roomId = rooms.getClientRoomId(client.id);
      if (!roomId) return;
      matches.delete(roomId);
      rooms.setRoomPhase(roomId, "lobby");
      broadcastLobby(roomId);
      broadcastRoomList();
      break;
    }
    case "ready":
      break;
    case "input": {
      const roomId = rooms.getClientRoomId(client.id);
      const match = roomId ? matches.get(roomId) : null;
      match?.simulation.setInput(client.id, message.command);
      break;
    }
    case "ping":
      send(client, { type: "pong", clientTime: message.clientTime, serverTime: Date.now() });
      break;
    case "registerP2PRoom":
      if (!P2P_SIGNALING_ENABLED) {
        send(client, { type: "error", message: "P2P signaling is disabled on this server." });
        return;
      }
      p2pRooms.register(client.id, message.room);
      broadcastP2PRoomList();
      break;
    case "p2pHostHeartbeat":
      p2pRooms.heartbeat(client.id, message.roomId);
      break;
    case "unregisterP2PRoom":
      p2pRooms.unregister(client.id, message.roomId);
      broadcastP2PRoomList();
      break;
    case "joinP2PRoom": {
      const room = p2pRooms.get(message.roomId);
      if (!room) {
        send(client, { type: "error", message: "P2P room not found." });
        return;
      }
      sendToClient(room.hostClientId, {
        type: "p2pJoinRequested",
        roomId: message.roomId,
        peerClientId: client.id,
        playerName: sanitizeName(message.playerName),
      });
      break;
    }
    case "webrtcOffer":
      sendToClient(message.toClientId, {
        type: "webrtcOffer",
        fromClientId: client.id,
        roomId: message.roomId,
        description: message.description,
      });
      break;
    case "webrtcAnswer":
      sendToClient(message.toClientId, {
        type: "webrtcAnswer",
        fromClientId: client.id,
        roomId: message.roomId,
        description: message.description,
      });
      break;
    case "webrtcIceCandidate":
      sendToClient(message.toClientId, {
        type: "webrtcIceCandidate",
        fromClientId: client.id,
        roomId: message.roomId,
        candidate: message.candidate,
      });
      break;
  }
}

function scheduleIdleShutdownIfNeeded(): void {
  if (!hasHostedRoom || rooms.listRooms().length > 0 || idleShutdownTimer) return;
  console.log(`No active LAN rooms. Server will stop in ${Math.round(IDLE_SHUTDOWN_MS / 1000)}s unless a new room starts.`);
  idleShutdownTimer = setTimeout(() => {
    idleShutdownTimer = null;
    if (rooms.listRooms().length > 0) return;
    console.log("Stopping WebFPS LAN server after idle timeout.");
    for (const client of clients.values()) {
      client.socket.close(1001, "LAN server idle timeout.");
    }
    wss.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  }, IDLE_SHUTDOWN_MS);
}

function cancelIdleShutdown(): void {
  if (!idleShutdownTimer) return;
  clearTimeout(idleShutdownTimer);
  idleShutdownTimer = null;
}

setInterval(() => {
  const nowSeconds = performance.now() / 1000;
  const nowMs = performance.now();
  for (const [roomId, match] of matches) {
    const room = rooms.getRoom(roomId);
    if (!room || room.phase === "lobby") {
      matches.delete(roomId);
      continue;
    }

    match.simulation.update(SIM_TICK_MS / 1000, nowSeconds);
    if (match.simulation.shouldReturnToLobby(nowSeconds)) {
      matches.delete(roomId);
      rooms.setRoomPhase(roomId, "lobby");
      broadcastLobby(roomId);
      broadcastRoomList();
      continue;
    }
    if (nowMs - match.lastSnapshotAt >= SNAPSHOT_MS) {
      match.lastSnapshotAt = nowMs;
      const snapshot = match.simulation.snapshot(nowSeconds);
      rooms.setRoomPhase(roomId, snapshot.phase);
      broadcastToRoom(roomId, { type: "snapshot", snapshot });
    }
  }
}, SIM_TICK_MS);

setInterval(() => {
  if (p2pRooms.prune() > 0) broadcastP2PRoomList();
}, 2000);

function broadcastLobby(roomId: string): void {
  const room = rooms.getRoom(roomId);
  if (!room) return;
  broadcastToRoom(roomId, { type: "lobby", lobby: rooms.toLobby(room) });
}

function sendRoomList(client: ClientSocket): void {
  send(client, { type: "roomList", rooms: rooms.listRooms() });
}

function sendP2PRoomList(client: ClientSocket): void {
  send(client, { type: "p2pRoomList", rooms: P2P_SIGNALING_ENABLED ? p2pRooms.list() : [] });
}

function broadcastRoomList(): void {
  const message: LanServerMessage = { type: "roomList", rooms: rooms.listRooms() };
  for (const client of clients.values()) send(client, message);
}

function broadcastP2PRoomList(): void {
  const message: LanServerMessage = { type: "p2pRoomList", rooms: P2P_SIGNALING_ENABLED ? p2pRooms.list() : [] };
  for (const client of clients.values()) send(client, message);
}

function broadcastToRoom(roomId: string, message: LanServerMessage): void {
  const room = rooms.getRoom(roomId);
  if (!room) return;
  const ids = new Set(room.players.map((player) => player.id));
  for (const client of clients.values()) {
    if (ids.has(client.id)) send(client, message);
  }
}

function send(client: ClientSocket, message: LanServerMessage): void {
  if (client.socket.readyState !== client.socket.OPEN) return;
  client.socket.send(JSON.stringify(message));
}

function sendToClient(clientId: string, message: LanServerMessage): void {
  const client = clients.get(clientId);
  if (client) send(client, message);
}

function sanitizeName(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 24) : "Player";
}

httpServer.listen(PORT, HOST, () => {
  const urls = lanUrls(PORT);
  console.log(`WebFPS LAN server running on port ${PORT}`);
  console.log(`  P2P signaling: ${P2P_SIGNALING_ENABLED ? "enabled" : "disabled"}`);
  for (const url of urls) console.log(`  ${url}`);
});

function lanUrls(port: number): string[] {
  const urls = [`http://localhost:${port}`];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const entry of interfaces ?? []) {
      if (entry.family === "IPv4" && !entry.internal) urls.push(`http://${entry.address}:${port}`);
    }
  }
  return urls;
}
