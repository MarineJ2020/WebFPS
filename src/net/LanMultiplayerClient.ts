import type { PlayerCommand } from "../core/simulation/commands/PlayerCommand";
import type { MapDefinition } from "../data/maps/MapDefinition";
import type {
  LanClientMessage,
  LanLobbyState,
  LanMatchSnapshot,
  LanRoomSummary,
  LanServerMessage,
  LocalTeam,
} from "./LanProtocol";

export interface LanMultiplayerClientEvents {
  onConnectionChange: (status: string, connected: boolean) => void;
  onWelcome: (clientId: string) => void;
  onRoomList: (rooms: LanRoomSummary[]) => void;
  onLobby: (lobby: LanLobbyState) => void;
  onMatchStarted: (roomId: string, map: MapDefinition) => void;
  onSnapshot: (snapshot: LanMatchSnapshot) => void;
  onError: (message: string) => void;
}

export class LanMultiplayerClient {
  private readonly events: LanMultiplayerClientEvents;
  private socket: WebSocket | null = null;
  private reconnectTimer = 0;
  private inputSequence = 0;
  private playerName = "Player";

  constructor(events: LanMultiplayerClientEvents) {
    this.events = events;
    this.connect();
  }

  createRoom(roomName: string, playerName: string): void {
    this.playerName = normalizeName(playerName);
    this.send({ type: "createRoom", roomName, playerName: this.playerName });
  }

  joinRoom(roomId: string, playerName: string): void {
    this.playerName = normalizeName(playerName);
    this.send({ type: "joinRoom", roomId, playerName: this.playerName });
  }

  leaveRoom(): void {
    this.send({ type: "leaveRoom" });
  }

  setTeam(team: LocalTeam): void {
    this.send({ type: "setTeam", team });
  }

  startMatch(): void {
    this.send({ type: "startMatch" });
  }

  voteRematch(): void {
    this.send({ type: "voteRematch" });
  }

  returnToLobby(): void {
    this.send({ type: "returnToLobby" });
  }

  sendInput(command: PlayerCommand): void {
    this.send({ type: "input", sequence: this.inputSequence++, command });
  }

  dispose(): void {
    window.clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = null;
  }

  private connect(): void {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/multiplayer`);
    this.socket = socket;
    this.events.onConnectionChange("Connecting to LAN server...", false);

    socket.addEventListener("open", () => {
      this.events.onConnectionChange("Connected to LAN server.", true);
      this.send({ type: "hello", playerName: this.playerName });
    });

    socket.addEventListener("message", (event) => {
      this.handleMessage(JSON.parse(String(event.data)) as LanServerMessage);
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.events.onConnectionChange("LAN server offline. Start npm run dev:lan for multiplayer.", false);
      this.reconnectTimer = window.setTimeout(() => this.connect(), 2000);
    });

    socket.addEventListener("error", () => {
      this.events.onConnectionChange("LAN server connection failed.", false);
    });
  }

  private handleMessage(message: LanServerMessage): void {
    switch (message.type) {
      case "welcome":
        this.events.onWelcome(message.clientId);
        break;
      case "roomList":
        this.events.onRoomList(message.rooms);
        break;
      case "lobby":
        this.events.onLobby(message.lobby);
        break;
      case "matchStarted":
        this.events.onMatchStarted(message.roomId, message.map);
        break;
      case "snapshot":
        this.events.onSnapshot(message.snapshot);
        break;
      case "error":
        this.events.onError(message.message);
        break;
      case "pong":
        break;
    }
  }

  private send(message: LanClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.events.onError("LAN server is not connected.");
      return;
    }
    this.socket.send(JSON.stringify(message));
  }
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 24) : "Player";
}
