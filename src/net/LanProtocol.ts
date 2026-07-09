import type { PlayerCommand } from "../core/simulation/commands/PlayerCommand";
import type { Vec3 } from "../core/entities/Entity";
import type { MapDefinition } from "../data/maps/MapDefinition";

export type LocalTeam = "A" | "B";
export type LanMatchPhase = "lobby" | "warmup" | "countdown" | "live" | "roundEnd" | "rematch";
export type LanRoomPhase = LanMatchPhase;
export type LanPickupKind = "ammo_box" | "health_pack";

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
  impactKind?: "world" | "character";
}

export interface LanKillEvent {
  killerId: string;
  victimId: string;
  killerName: string;
  victimName: string;
}

export interface LanPickupSnapshot {
  id: string;
  kind: LanPickupKind;
  position: Vec3;
  amount: number;
  expiresAt: number;
}

export interface LanMatchSnapshot {
  roomId: string;
  serverTime: number;
  phase: LanMatchPhase;
  phaseRemaining: number;
  scoreLimit: number;
  timeLimit: number;
  winner: string | null;
  rematchVotes: number;
  rematchNeeded: number;
  players: LanCharacterSnapshot[];
  bots: LanCharacterSnapshot[];
  pickups: LanPickupSnapshot[];
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
  | { type: "voteRematch" }
  | { type: "returnToLobby" }
  | { type: "ready" }
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
