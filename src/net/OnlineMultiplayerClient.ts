import type { AuthSession, GuestSession } from "../profile/ProfileTypes";
import { onlineServerUrl } from "./OnlineProtocol";
import type { PlayerCommand } from "../core/simulation/commands/PlayerCommand";
import type { MapDefinition } from "../data/maps/MapDefinition";
import type { LocalTeam } from "./LanProtocol";
import type { OnlineClientMessage, OnlineProfileSummary, OnlineServerMessage } from "./OnlineProtocolTypes";

export interface OnlineMultiplayerClientEvents {
  onStatus: (message: string, connected: boolean) => void;
  onMessage?: (message: OnlineServerMessage) => void;
}

export class OnlineMultiplayerClient {
  private readonly events: OnlineMultiplayerClientEvents;
  private socket: WebSocket | null = null;
  private profile: OnlineProfileSummary | null = null;
  private inputSequence = 0;

  constructor(events: OnlineMultiplayerClientEvents) {
    this.events = events;
  }

  async connect(session: AuthSession | GuestSession): Promise<void> {
    const url = onlineServerUrl();
    if (!url) {
      this.events.onStatus("Cloudflare server URL is not configured.", false);
      return;
    }

    this.disconnect();
    const socket = new WebSocket(url);
    this.socket = socket;
    this.events.onStatus("Connecting to online server...", false);

    socket.addEventListener("open", async () => {
      this.events.onStatus("Connected to online server.", true);
      this.send(await createOnlineHelloMessage(session));
    });
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as OnlineServerMessage;
      if (message.type === "profileSummary") this.profile = message.profile;
      this.events.onMessage?.(message);
    });
    socket.addEventListener("close", () => {
      if (this.socket === socket) this.events.onStatus("Online server disconnected.", false);
    });
    socket.addEventListener("error", () => this.events.onStatus("Online server connection failed.", false));
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.profile = null;
    this.inputSequence = 0;
  }

  get selfId(): string {
    return this.profile?.uid ?? this.profile?.guestId ?? "";
  }

  createRoom(roomName: string, playerName: string, map: MapDefinition): void {
    this.send({ type: "createOnlineRoom", roomName, playerName, map });
  }

  joinRoom(roomId: string, playerName: string): void {
    this.send({ type: "joinOnlineRoom", roomId, playerName });
  }

  leaveRoom(): void {
    this.send({ type: "leaveOnlineRoom" });
  }

  setTeam(team: LocalTeam): void {
    this.send({ type: "setOnlineTeam", team });
  }

  startMatch(): void {
    this.send({ type: "startOnlineMatch" });
  }

  sendInput(command: PlayerCommand): void {
    this.send({ type: "onlineInput", sequence: ++this.inputSequence, command });
  }

  voteRematch(): void {
    this.send({ type: "voteOnlineRematch" });
  }

  returnToLobby(): void {
    this.send({ type: "returnOnlineToLobby" });
  }

  private send(message: OnlineClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
}

export async function createOnlineHelloMessage(session: AuthSession | GuestSession): Promise<OnlineClientMessage> {
  if (session.kind === "firebase") {
    return {
      type: "authHello",
      token: await session.getIdToken(),
      displayName: session.displayName,
    };
  }
  return {
    type: "guestHello",
    guestId: session.guestId,
    displayName: session.displayName,
    accentColor: session.accentColor,
  };
}
