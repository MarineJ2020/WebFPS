import type { PlayerCommand } from "../core/simulation/commands/PlayerCommand";
import type { MapDefinition } from "../data/maps/MapDefinition";
import type {
  LanLobbyState,
  LanMatchSnapshot,
  LocalTeam,
  MultiplayerMode,
  ServerBrowserEntry,
} from "./LanProtocol";

export interface MultiplayerSessionEvents {
  onConnectionChange: (status: string, connected: boolean) => void;
  onWelcome: (clientId: string) => void;
  onRoomList: (rooms: ServerBrowserEntry[]) => void;
  onLobby: (lobby: LanLobbyState) => void;
  onMatchStarted: (roomId: string, map: MapDefinition) => void;
  onSnapshot: (snapshot: LanMatchSnapshot) => void;
  onError: (message: string) => void;
}

export interface MultiplayerSession {
  readonly mode: MultiplayerMode;
  setMap(map: MapDefinition): void;
  createRoom(roomName: string, playerName: string): void;
  joinRoom(roomId: string, playerName: string): void;
  leaveRoom(): void;
  setTeam(team: LocalTeam): void;
  startMatch(): void;
  voteRematch(): void;
  returnToLobby(): void;
  sendInput(command: PlayerCommand): void;
  dispose(): void;
}
