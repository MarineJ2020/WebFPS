import { createServer as createHttpServer } from "node:http";
import os from "node:os";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, type WebSocket } from "ws";
import { LanMatchSimulation } from "../src/net/LanMatchSimulation";
import { LanRoomManager } from "../src/net/LanRoomManager";
import type { LanClientMessage, LanServerMessage } from "../src/net/LanProtocol";

const PORT = Number(process.env.PORT ?? 5173);
const HOST = "0.0.0.0";
const SIM_TICK_MS = 1000 / 30;
const SNAPSHOT_MS = 1000 / 20;
const IDLE_SHUTDOWN_MS = Number(process.env.LAN_IDLE_SHUTDOWN_MS ?? 5 * 60 * 1000);

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

  socket.on("message", (data) => {
    try {
      handleMessage(client, JSON.parse(String(data)) as LanClientMessage);
    } catch (error) {
      send(client, { type: "error", message: error instanceof Error ? error.message : "Invalid message." });
    }
  });

  socket.on("close", () => {
    const previousRoom = rooms.leaveRoom(client.id);
    clients.delete(client.id);
    if (previousRoom) broadcastLobby(previousRoom.id);
    broadcastRoomList();
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
      const room = rooms.createRoom(client, message.roomName);
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
      if (room.phase === "playing") send(client, { type: "matchStarted", roomId: room.id, map: room.map });
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
    case "input": {
      const roomId = rooms.getClientRoomId(client.id);
      const match = roomId ? matches.get(roomId) : null;
      match?.simulation.setInput(client.id, message.command);
      break;
    }
    case "ping":
      send(client, { type: "pong", clientTime: message.clientTime, serverTime: Date.now() });
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
    if (!room || room.phase !== "playing") {
      matches.delete(roomId);
      continue;
    }

    match.simulation.update(SIM_TICK_MS / 1000, nowSeconds);
    if (nowMs - match.lastSnapshotAt >= SNAPSHOT_MS) {
      match.lastSnapshotAt = nowMs;
      broadcastToRoom(roomId, { type: "snapshot", snapshot: match.simulation.snapshot(nowSeconds) });
    }
  }
}, SIM_TICK_MS);

function broadcastLobby(roomId: string): void {
  const room = rooms.getRoom(roomId);
  if (!room) return;
  broadcastToRoom(roomId, { type: "lobby", lobby: rooms.toLobby(room) });
}

function sendRoomList(client: ClientSocket): void {
  send(client, { type: "roomList", rooms: rooms.listRooms() });
}

function broadcastRoomList(): void {
  const message: LanServerMessage = { type: "roomList", rooms: rooms.listRooms() };
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

function sanitizeName(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 24) : "Player";
}

httpServer.listen(PORT, HOST, () => {
  const urls = lanUrls(PORT);
  console.log(`WebFPS LAN server running on port ${PORT}`);
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
