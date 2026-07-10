import type { PlayerCommand } from "../core/simulation/commands/PlayerCommand";
import type { Vec3 } from "../core/entities/Entity";
import type { MapDefinition } from "../data/maps/MapDefinition";

export type LocalTeam = "A" | "B";
export type LanMatchPhase = "lobby" | "warmup" | "countdown" | "live" | "roundEnd" | "rematch";
export type LanRoomPhase = LanMatchPhase;
export type LanPickupKind = "ammo_box" | "health_pack";
export type MultiplayerMode = "dedicated" | "p2p-host" | "p2p-peer";
export type ServerBrowserEndpointType = "dedicated" | "p2p";
export interface WebRTCSessionDescriptionLike {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp?: string;
}

export interface WebRTCIceCandidateLike {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

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
  mode?: MultiplayerMode;
  endpointType?: ServerBrowserEndpointType;
}

export interface ServerBrowserEntry extends LanRoomSummary {
  mode: MultiplayerMode;
  endpointType: ServerBrowserEndpointType;
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

export interface P2PRoomSummary extends ServerBrowserEntry {
  mode: "p2p-host";
  endpointType: "p2p";
}

export type LanClientMessage =
  | { type: "hello"; playerName: string }
  | { type: "createRoom"; roomName: string; playerName: string; map?: MapDefinition }
  | { type: "joinRoom"; roomId: string; playerName: string }
  | { type: "leaveRoom" }
  | { type: "setTeam"; team: LocalTeam }
  | { type: "startMatch" }
  | { type: "voteRematch" }
  | { type: "returnToLobby" }
  | { type: "ready" }
  | { type: "input"; sequence: number; command: PlayerCommand }
  | { type: "ping"; clientTime: number }
  | { type: "registerP2PRoom"; room: P2PRoomSummary }
  | { type: "p2pHostHeartbeat"; roomId: string }
  | { type: "unregisterP2PRoom"; roomId: string }
  | { type: "joinP2PRoom"; roomId: string; playerName: string }
  | { type: "webrtcOffer"; toClientId: string; roomId: string; description: WebRTCSessionDescriptionLike }
  | { type: "webrtcAnswer"; toClientId: string; roomId: string; description: WebRTCSessionDescriptionLike }
  | { type: "webrtcIceCandidate"; toClientId: string; roomId: string; candidate: WebRTCIceCandidateLike };

export type LanServerMessage =
  | { type: "welcome"; clientId: string }
  | { type: "roomList"; rooms: LanRoomSummary[] }
  | { type: "p2pRoomList"; rooms: P2PRoomSummary[] }
  | { type: "p2pJoinRequested"; roomId: string; peerClientId: string; playerName: string }
  | { type: "webrtcOffer"; fromClientId: string; roomId: string; description: WebRTCSessionDescriptionLike }
  | { type: "webrtcAnswer"; fromClientId: string; roomId: string; description: WebRTCSessionDescriptionLike }
  | { type: "webrtcIceCandidate"; fromClientId: string; roomId: string; candidate: WebRTCIceCandidateLike }
  | { type: "lobby"; lobby: LanLobbyState }
  | { type: "matchStarted"; roomId: string; map: MapDefinition }
  | { type: "snapshot"; snapshot: LanMatchSnapshot }
  | { type: "error"; message: string }
  | { type: "pong"; clientTime: number; serverTime: number };
