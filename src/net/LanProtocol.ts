import type { PlayerCommand } from "../core/simulation/commands/PlayerCommand";
import type { Vec3 } from "../core/entities/Entity";
import type { MapDefinition } from "../data/maps/MapDefinition";

export type LocalTeam = "A" | "B";
export type LanRoomPhase = "lobby" | "playing";

export interface LanRoomPlayer {
  id: string;
  name: string;
  team: LocalTeam;
  isHost: boolean;
  connected: boolean;
}

export interface LanRoomSummary {
  id: string;
  name: string;
  phase: LanRoomPhase;
  hostName: string;
  playerCount: number;
  teamCounts: Record<LocalTeam, number>;
}

export interface LanLobbyState {
  id: string;
  name: string;
  phase: LanRoomPhase;
  players: LanRoomPlayer[];
}

export interface LanWeaponSnapshot {
  configId: string;
  ammoInMag: number;
  ammoReserve: number;
  reloadTimer: number;
  fireModeKind: string;
}

export interface LanCharacterSnapshot {
  id: string;
  name: string;
  team: LocalTeam;
  position: Vec3;
  yaw: number;
  pitch: number;
  health: number;
  maxHealth: number;
  dead: boolean;
  respawnRemaining: number;
  kills: number;
  deaths: number;
  weapon: LanWeaponSnapshot;
  kind: "player" | "bot";
}

export interface LanShotEvent {
  shooterId: string;
  from: Vec3;
  to: Vec3;
}

export interface LanKillEvent {
  killerId: string;
  victimId: string;
  killerName: string;
  victimName: string;
}

export interface LanMatchSnapshot {
  roomId: string;
  serverTime: number;
  players: LanCharacterSnapshot[];
  bots: LanCharacterSnapshot[];
  shots: LanShotEvent[];
  kills: LanKillEvent[];
}

export type LanClientMessage =
  | { type: "hello"; playerName: string }
  | { type: "createRoom"; roomName: string; playerName: string }
  | { type: "joinRoom"; roomId: string; playerName: string }
  | { type: "leaveRoom" }
  | { type: "setTeam"; team: LocalTeam }
  | { type: "startMatch" }
  | { type: "input"; sequence: number; command: PlayerCommand }
  | { type: "ping"; clientTime: number };

export type LanServerMessage =
  | { type: "welcome"; clientId: string }
  | { type: "roomList"; rooms: LanRoomSummary[] }
  | { type: "lobby"; lobby: LanLobbyState }
  | { type: "matchStarted"; roomId: string; map: MapDefinition }
  | { type: "snapshot"; snapshot: LanMatchSnapshot }
  | { type: "error"; message: string }
  | { type: "pong"; clientTime: number; serverTime: number };
