import type { PlayerStats, ProfileCustomization } from "../profile/ProfileTypes";
import type { PlayerCommand } from "../core/simulation/commands/PlayerCommand";
import type { MapDefinition } from "../data/maps/MapDefinition";
import type { LanLobbyState, LanMatchSnapshot, LocalTeam } from "./LanProtocol";

export interface OnlineRoomSummary {
  id: string;
  name: string;
  playerCount: number;
  phase: "lobby" | "warmup" | "countdown" | "live" | "roundEnd" | "rematch";
}

export interface OnlineProfileSummary {
  uid: string | null;
  guestId: string | null;
  displayName: string;
  customization: ProfileCustomization;
  stats: PlayerStats | null;
}

export type OnlineClientMessage =
  | { type: "authHello"; token: string; displayName: string }
  | { type: "guestHello"; guestId: string; displayName: string; accentColor: string }
  | { type: "createOnlineRoom"; roomName: string; playerName: string; map: MapDefinition }
  | { type: "joinOnlineRoom"; roomId: string; playerName: string }
  | { type: "leaveOnlineRoom" }
  | { type: "setOnlineTeam"; team: LocalTeam }
  | { type: "startOnlineMatch" }
  | { type: "onlineInput"; sequence: number; command: PlayerCommand }
  | { type: "voteOnlineRematch" }
  | { type: "returnOnlineToLobby" }
  | { type: "matchStatDelta"; roomId: string; uid: string; kills: number; deaths: number; assists: number; won: boolean };

export type OnlineServerMessage =
  | { type: "profileSummary"; profile: OnlineProfileSummary }
  | { type: "onlineRoomList"; rooms: OnlineRoomSummary[] }
  | { type: "onlineLobby"; lobby: LanLobbyState }
  | { type: "onlineMatchStarted"; roomId: string; map: MapDefinition }
  | { type: "onlineSnapshot"; roomId: string; serverTime: number; snapshot: LanMatchSnapshot }
  | { type: "error"; message: string };
