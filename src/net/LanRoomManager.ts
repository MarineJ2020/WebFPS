import type { MapDefinition } from "../data/maps/MapDefinition";
import { createDefaultSessionDefinition } from "../data/session/GameSessionDefinition";
import type {
  LanLobbyState,
  LanRoomPlayer,
  LanRoomPhase,
  LanRoomSummary,
  LocalTeam,
} from "./LanProtocol";

export interface LanClientRecord {
  id: string;
  name: string;
}

export interface LanRoomRecord {
  id: string;
  name: string;
  phase: LanRoomPhase;
  map: MapDefinition;
  players: LanRoomPlayer[];
}

export class LanRoomManager {
  private readonly rooms = new Map<string, LanRoomRecord>();
  private readonly clientRooms = new Map<string, string>();

  getRoom(roomId: string): LanRoomRecord | undefined {
    return this.rooms.get(roomId);
  }

  getClientRoomId(clientId: string): string | undefined {
    return this.clientRooms.get(clientId);
  }

  createRoom(client: LanClientRecord, roomName: string, map = createDefaultSessionDefinition().map): LanRoomRecord {
    this.leaveRoom(client.id);
    const room: LanRoomRecord = {
      id: createRoomId(roomName),
      name: roomName.trim() || `${client.name}'s Room`,
      phase: "lobby",
      map,
      players: [{
        id: client.id,
        name: client.name,
        team: "A",
        isHost: true,
        connected: true,
      }],
    };
    this.rooms.set(room.id, room);
    this.clientRooms.set(client.id, room.id);
    return room;
  }

  joinRoom(client: LanClientRecord, roomId: string): LanRoomRecord | null {
    this.leaveRoom(client.id);
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const existing = room.players.find((player) => player.id === client.id);
    if (existing) {
      existing.connected = true;
      existing.name = client.name;
    } else {
      room.players.push({
        id: client.id,
        name: client.name,
        team: pickBalancedTeam(room.players),
        isHost: room.players.length === 0,
        connected: true,
      });
    }

    ensureHost(room);
    this.clientRooms.set(client.id, room.id);
    return room;
  }

  leaveRoom(clientId: string): LanRoomRecord | null {
    const roomId = this.clientRooms.get(clientId);
    if (!roomId) return null;
    const room = this.rooms.get(roomId);
    this.clientRooms.delete(clientId);
    if (!room) return null;

    room.players = room.players.filter((player) => player.id !== clientId);
    if (room.players.length === 0) {
      this.rooms.delete(room.id);
      return room;
    }

    ensureHost(room);
    return room;
  }

  setTeam(clientId: string, team: LocalTeam): LanRoomRecord | null {
    const room = this.getClientRoom(clientId);
    const player = room?.players.find((candidate) => candidate.id === clientId);
    if (!room || !player) return null;
    player.team = team;
    return room;
  }

  startMatch(clientId: string): LanRoomRecord | null {
    const room = this.getClientRoom(clientId);
    const player = room?.players.find((candidate) => candidate.id === clientId);
    if (!room || !player?.isHost) return null;
    room.phase = "warmup";
    return room;
  }

  setRoomPhase(roomId: string, phase: LanRoomRecord["phase"]): LanRoomRecord | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.phase = phase;
    return room;
  }

  listRooms(): LanRoomSummary[] {
    return [...this.rooms.values()].map((room) => {
      const host = room.players.find((player) => player.isHost);
      return {
        id: room.id,
        name: room.name,
        phase: room.phase,
        hostName: host?.name ?? "Host",
        playerCount: room.players.length,
        teamCounts: {
          A: room.players.filter((player) => player.team === "A").length,
          B: room.players.filter((player) => player.team === "B").length,
        },
      };
    });
  }

  toLobby(room: LanRoomRecord): LanLobbyState {
    return {
      id: room.id,
      name: room.name,
      phase: room.phase,
      players: room.players.map((player) => ({ ...player })),
    };
  }

  private getClientRoom(clientId: string): LanRoomRecord | undefined {
    const roomId = this.clientRooms.get(clientId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }
}

function pickBalancedTeam(players: readonly LanRoomPlayer[]): LocalTeam {
  const a = players.filter((player) => player.team === "A").length;
  const b = players.filter((player) => player.team === "B").length;
  return a <= b ? "A" : "B";
}

function ensureHost(room: LanRoomRecord): void {
  if (room.players.some((player) => player.isHost)) return;
  const nextHost = room.players[0];
  if (nextHost) nextHost.isHost = true;
}

function createRoomId(roomName: string): string {
  const slug = roomName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug || "room"}-${suffix}`;
}
