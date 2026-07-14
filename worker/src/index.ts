import { LanMatchSimulation } from "../../src/net/LanMatchSimulation";
import type { LanLobbyState, LanMatchPhase, LanRoomPlayer } from "../../src/net/LanProtocol";
import type { OnlineClientMessage, OnlineRoomSummary, OnlineServerMessage } from "../../src/net/OnlineProtocolTypes";
import type { MapDefinition } from "../../src/data/maps/MapDefinition";
import type { PlayerCommand } from "../../src/core/simulation/commands/PlayerCommand";
import { verifyFirebaseToken } from "./FirebaseTokenVerifier";

export interface Env {
  ROOM_DURABLE_OBJECT: DurableObjectNamespace;
  FIREBASE_PROJECT_ID?: string;
  ALLOW_GUESTS?: string;
}

interface ConnectedPlayer {
  id: string;
  displayName: string;
  kind: "firebase" | "guest";
  roomId: string | null;
}

interface OnlineRoom {
  id: string;
  name: string;
  phase: LanMatchPhase;
  map: MapDefinition;
  hostId: string;
  players: LanRoomPlayer[];
  simulation: LanMatchSimulation | null;
  lastSnapshotAt: number;
}

type TimerHandle = ReturnType<typeof setInterval>;

const SIMULATION_HZ = 30;
const SNAPSHOT_HZ = 15;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "webfps-online" });
    if (url.pathname !== "/multiplayer") return new Response("Not found", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });

    const id = env.ROOM_DURABLE_OBJECT.idFromName("online-room-registry");
    return env.ROOM_DURABLE_OBJECT.get(id).fetch(request);
  },
};

export class RoomDurableObject {
  private readonly env: Env;
  private readonly players = new Map<WebSocket, ConnectedPlayer>();
  private readonly rooms = new Map<string, OnlineRoom>();
  private simulationTimer: TimerHandle | null = null;
  private snapshotTimer: TimerHandle | null = null;

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    server.addEventListener("message", (event) => void this.handleMessage(server, String(event.data)));
    server.addEventListener("close", () => this.handleDisconnect(server));
    this.send(server, { type: "onlineRoomList", rooms: this.roomList() });
    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
    let message: OnlineClientMessage;
    try {
      message = JSON.parse(raw) as OnlineClientMessage;
    } catch {
      this.send(socket, { type: "error", message: "Invalid JSON message." });
      return;
    }

    switch (message.type) {
      case "authHello":
        await this.handleAuthHello(socket, message.token, message.displayName);
        break;
      case "guestHello":
        this.handleGuestHello(socket, message.guestId, message.displayName, message.accentColor);
        break;
      case "createOnlineRoom":
        this.createRoom(socket, message.roomName, message.playerName, message.map);
        break;
      case "joinOnlineRoom":
        this.joinRoom(socket, message.roomId, message.playerName);
        break;
      case "leaveOnlineRoom":
        this.leaveRoom(socket);
        break;
      case "setOnlineTeam":
        this.setTeam(socket, message.team);
        break;
      case "startOnlineMatch":
        this.startMatch(socket);
        break;
      case "onlineInput":
        this.applyInput(socket, message.command);
        break;
      case "voteOnlineRematch":
        this.voteRematch(socket);
        break;
      case "returnOnlineToLobby":
        this.returnToLobby(socket);
        break;
      case "matchStatDelta":
        this.send(socket, { type: "error", message: "Persistent stat writes are disabled until trusted server verification is implemented." });
        break;
    }
  }

  private async handleAuthHello(socket: WebSocket, token: string, displayName: string): Promise<void> {
    const verified = await verifyFirebaseToken(token, this.env);
    if (!verified) {
      this.send(socket, { type: "error", message: "Firebase token verification is not configured." });
      return;
    }
    this.players.set(socket, {
      id: verified.uid,
      displayName,
      kind: "firebase",
      roomId: null,
    });
    this.send(socket, {
      type: "profileSummary",
      profile: {
        uid: verified.uid,
        guestId: null,
        displayName,
        customization: { displayName, avatarUrl: verified.photoUrl, avatarDataUrl: null, accentColor: "#6bb8ff" },
        stats: null,
      },
    });
    this.send(socket, { type: "onlineRoomList", rooms: this.roomList() });
  }

  private handleGuestHello(socket: WebSocket, guestId: string, displayName: string, accentColor: string): void {
    if (this.env.ALLOW_GUESTS === "false") {
      this.send(socket, { type: "error", message: "Guest access is disabled." });
      return;
    }
    this.players.set(socket, {
      id: guestId,
      displayName,
      kind: "guest",
      roomId: null,
    });
    this.send(socket, {
      type: "profileSummary",
      profile: {
        uid: null,
        guestId,
        displayName,
        customization: { displayName, avatarUrl: null, avatarDataUrl: null, accentColor },
        stats: null,
      },
    });
    this.send(socket, { type: "onlineRoomList", rooms: this.roomList() });
  }

  private createRoom(socket: WebSocket, roomName: string, playerName: string, map: MapDefinition): void {
    const player = this.requirePlayer(socket);
    if (!player) return;
    this.leaveRoom(socket, false);

    const roomId = createRoomId();
    player.roomId = roomId;
    player.displayName = playerName || player.displayName;
    const room: OnlineRoom = {
      id: roomId,
      name: roomName || "Online Room",
      phase: "lobby",
      map,
      hostId: player.id,
      players: [{
        id: player.id,
        name: player.displayName,
        team: "A",
        isHost: true,
        connected: true,
      }],
      simulation: null,
      lastSnapshotAt: 0,
    };
    this.rooms.set(roomId, room);
    this.broadcastLobby(room);
    this.broadcastRoomList();
  }

  private joinRoom(socket: WebSocket, roomId: string, playerName: string): void {
    const player = this.requirePlayer(socket);
    if (!player) return;
    const room = this.rooms.get(roomId);
    if (!room) {
      this.send(socket, { type: "error", message: "Room no longer exists." });
      return;
    }
    this.leaveRoom(socket, false);
    player.roomId = roomId;
    player.displayName = playerName || player.displayName;
    let existing = room.players.find((entry) => entry.id === player.id);
    if (existing) {
      existing.connected = true;
      existing.name = player.displayName;
    } else {
      existing = {
        id: player.id,
        name: player.displayName,
        team: teamWithFewestPlayers(room.players),
        isHost: false,
        connected: true,
      };
      room.players.push(existing);
    }

    if (room.phase !== "lobby" && room.simulation) {
      room.simulation.addPlayer(existing);
      this.send(socket, { type: "onlineMatchStarted", roomId: room.id, map: room.map });
    } else {
      this.broadcastLobby(room);
    }
    this.broadcastRoomList();
  }

  private leaveRoom(socket: WebSocket, notify = true): void {
    const player = this.players.get(socket);
    if (!player?.roomId) return;
    const room = this.rooms.get(player.roomId);
    player.roomId = null;
    if (!room) return;

    const roomPlayer = room.players.find((entry) => entry.id === player.id);
    if (roomPlayer) roomPlayer.connected = false;
    if (room.phase === "lobby") {
      room.players = room.players.filter((entry) => entry.id !== player.id);
    }

    if (room.players.every((entry) => !entry.connected)) {
      this.rooms.delete(room.id);
    } else {
      this.reassignHost(room);
      if (notify) this.broadcastLobby(room);
    }
    this.broadcastRoomList();
    this.stopTimersIfIdle();
  }

  private setTeam(socket: WebSocket, team: "A" | "B"): void {
    const room = this.roomFor(socket);
    const player = this.players.get(socket);
    if (!room || !player || room.phase !== "lobby") return;
    const roomPlayer = room.players.find((entry) => entry.id === player.id);
    if (!roomPlayer) return;
    roomPlayer.team = team;
    this.broadcastLobby(room);
    this.broadcastRoomList();
  }

  private startMatch(socket: WebSocket): void {
    const room = this.roomFor(socket);
    const player = this.players.get(socket);
    if (!room || !player || room.hostId !== player.id || room.phase !== "lobby") return;
    room.simulation = new LanMatchSimulation(room.id, room.players.filter((entry) => entry.connected), room.map);
    room.phase = "warmup";
    room.lastSnapshotAt = nowSeconds();
    this.broadcastToRoom(room, { type: "onlineMatchStarted", roomId: room.id, map: room.map });
    this.startTimers();
    this.broadcastRoomList();
  }

  private applyInput(socket: WebSocket, command: PlayerCommand): void {
    const room = this.roomFor(socket);
    const player = this.players.get(socket);
    if (!room?.simulation || !player) return;
    room.simulation.setInput(player.id, command);
  }

  private voteRematch(socket: WebSocket): void {
    const room = this.roomFor(socket);
    const player = this.players.get(socket);
    if (!room?.simulation || !player) return;
    room.simulation.voteRematch(player.id);
  }

  private returnToLobby(socket: WebSocket): void {
    const room = this.roomFor(socket);
    const player = this.players.get(socket);
    if (!room || !player || room.hostId !== player.id) return;
    room.phase = "lobby";
    room.simulation = null;
    this.broadcastLobby(room);
    this.broadcastRoomList();
    this.stopTimersIfIdle();
  }

  private tickSimulation(): void {
    const now = nowSeconds();
    for (const room of this.rooms.values()) {
      if (!room.simulation) continue;
      room.simulation.update(1 / SIMULATION_HZ, now);
      if (room.simulation.shouldReturnToLobby(now)) {
        room.phase = "lobby";
        room.simulation = null;
        this.broadcastLobby(room);
      }
    }
    this.stopTimersIfIdle();
  }

  private broadcastSnapshots(): void {
    const now = nowSeconds();
    for (const room of this.rooms.values()) {
      if (!room.simulation) continue;
      const snapshot = room.simulation.snapshot(now);
      room.phase = snapshot.phase;
      room.lastSnapshotAt = now;
      this.broadcastToRoom(room, { type: "onlineSnapshot", roomId: room.id, serverTime: now, snapshot });
    }
  }

  private startTimers(): void {
    if (!this.simulationTimer) this.simulationTimer = setInterval(() => this.tickSimulation(), 1000 / SIMULATION_HZ);
    if (!this.snapshotTimer) this.snapshotTimer = setInterval(() => this.broadcastSnapshots(), 1000 / SNAPSHOT_HZ);
  }

  private stopTimersIfIdle(): void {
    if ([...this.rooms.values()].some((room) => room.simulation)) return;
    if (this.simulationTimer) clearInterval(this.simulationTimer);
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    this.simulationTimer = null;
    this.snapshotTimer = null;
  }

  private handleDisconnect(socket: WebSocket): void {
    this.leaveRoom(socket);
    this.players.delete(socket);
  }

  private requirePlayer(socket: WebSocket): ConnectedPlayer | null {
    const player = this.players.get(socket);
    if (player) return player;
    this.send(socket, { type: "error", message: "Sign in or continue as guest first." });
    return null;
  }

  private roomFor(socket: WebSocket): OnlineRoom | null {
    const player = this.players.get(socket);
    return player?.roomId ? this.rooms.get(player.roomId) ?? null : null;
  }

  private reassignHost(room: OnlineRoom): void {
    const connected = room.players.find((entry) => entry.connected);
    if (!connected) return;
    room.hostId = connected.id;
    for (const player of room.players) player.isHost = player.id === room.hostId;
  }

  private roomList(): OnlineRoomSummary[] {
    return [...this.rooms.values()].map((room) => ({
      id: room.id,
      name: room.name,
      playerCount: room.players.filter((player) => player.connected).length,
      phase: room.phase,
    }));
  }

  private lobbyState(room: OnlineRoom): LanLobbyState {
    return {
      id: room.id,
      name: room.name,
      phase: room.phase,
      players: room.players.filter((player) => player.connected),
    };
  }

  private broadcastLobby(room: OnlineRoom): void {
    this.broadcastToRoom(room, { type: "onlineLobby", lobby: this.lobbyState(room) });
  }

  private broadcastRoomList(): void {
    const message: OnlineServerMessage = { type: "onlineRoomList", rooms: this.roomList() };
    for (const socket of this.players.keys()) this.send(socket, message);
  }

  private broadcastToRoom(room: OnlineRoom, message: OnlineServerMessage): void {
    for (const [socket, player] of this.players) {
      if (player.roomId === room.id) this.send(socket, message);
    }
  }

  private send(socket: WebSocket, message: OnlineServerMessage): void {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.players.delete(socket);
    }
  }
}

function teamWithFewestPlayers(players: readonly LanRoomPlayer[]): "A" | "B" {
  const teamA = players.filter((player) => player.team === "A").length;
  const teamB = players.filter((player) => player.team === "B").length;
  return teamA <= teamB ? "A" : "B";
}

function createRoomId(): string {
  return `room-${crypto.randomUUID().slice(0, 8)}`;
}

function nowSeconds(): number {
  return performance.now() / 1000;
}
