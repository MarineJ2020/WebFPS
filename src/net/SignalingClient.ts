import type {
  LanClientMessage,
  LanServerMessage,
  P2PRoomSummary,
  WebRTCIceCandidateLike,
  WebRTCSessionDescriptionLike,
} from "./LanProtocol";

export interface SignalingClientEvents {
  onConnectionChange?: (status: string, connected: boolean) => void;
  onWelcome?: (clientId: string) => void;
  onRoomList?: (rooms: P2PRoomSummary[]) => void;
  onJoinRequested?: (roomId: string, peerClientId: string, playerName: string) => void;
  onOffer?: (fromClientId: string, roomId: string, description: WebRTCSessionDescriptionLike) => void;
  onAnswer?: (fromClientId: string, roomId: string, description: WebRTCSessionDescriptionLike) => void;
  onIceCandidate?: (fromClientId: string, roomId: string, candidate: WebRTCIceCandidateLike) => void;
  onError?: (message: string) => void;
}

export class SignalingClient {
  private readonly events: SignalingClientEvents;
  private socket: WebSocket | null = null;
  private reconnectTimer = 0;
  private playerName = "Player";
  private clientId = "";

  constructor(events: SignalingClientEvents, playerName = "Player") {
    this.events = events;
    this.playerName = normalizeName(playerName);
    this.connect();
  }

  get id(): string {
    return this.clientId;
  }

  setPlayerName(playerName: string): void {
    this.playerName = normalizeName(playerName);
    this.send({ type: "hello", playerName: this.playerName });
  }

  registerRoom(room: P2PRoomSummary): void {
    this.send({ type: "registerP2PRoom", room });
  }

  heartbeat(roomId: string): void {
    this.send({ type: "p2pHostHeartbeat", roomId });
  }

  unregisterRoom(roomId: string): void {
    this.send({ type: "unregisterP2PRoom", roomId });
  }

  joinRoom(roomId: string, playerName: string): void {
    this.playerName = normalizeName(playerName);
    this.send({ type: "joinP2PRoom", roomId, playerName: this.playerName });
  }

  sendOffer(toClientId: string, roomId: string, description: WebRTCSessionDescriptionLike): void {
    this.send({ type: "webrtcOffer", toClientId, roomId, description });
  }

  sendAnswer(toClientId: string, roomId: string, description: WebRTCSessionDescriptionLike): void {
    this.send({ type: "webrtcAnswer", toClientId, roomId, description });
  }

  sendIceCandidate(toClientId: string, roomId: string, candidate: WebRTCIceCandidateLike): void {
    this.send({ type: "webrtcIceCandidate", toClientId, roomId, candidate });
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
    this.events.onConnectionChange?.("Connecting to P2P signaling...", false);

    socket.addEventListener("open", () => {
      this.events.onConnectionChange?.("Connected to P2P signaling.", true);
      this.send({ type: "hello", playerName: this.playerName });
    });

    socket.addEventListener("message", (event) => this.handleMessage(JSON.parse(String(event.data)) as LanServerMessage));

    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.events.onConnectionChange?.("P2P signaling offline.", false);
      this.reconnectTimer = window.setTimeout(() => this.connect(), 2000);
    });

    socket.addEventListener("error", () => this.events.onConnectionChange?.("P2P signaling failed.", false));
  }

  private handleMessage(message: LanServerMessage): void {
    switch (message.type) {
      case "welcome":
        this.clientId = message.clientId;
        this.events.onWelcome?.(message.clientId);
        break;
      case "p2pRoomList":
        this.events.onRoomList?.(message.rooms);
        break;
      case "p2pJoinRequested":
        this.events.onJoinRequested?.(message.roomId, message.peerClientId, message.playerName);
        break;
      case "webrtcOffer":
        this.events.onOffer?.(message.fromClientId, message.roomId, message.description);
        break;
      case "webrtcAnswer":
        this.events.onAnswer?.(message.fromClientId, message.roomId, message.description);
        break;
      case "webrtcIceCandidate":
        this.events.onIceCandidate?.(message.fromClientId, message.roomId, message.candidate);
        break;
      case "error":
        this.events.onError?.(message.message);
        break;
      case "roomList":
      case "lobby":
      case "matchStarted":
      case "snapshot":
      case "pong":
        break;
    }
  }

  private send(message: LanClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.events.onError?.("P2P signaling is not connected.");
      return;
    }
    this.socket.send(JSON.stringify(message));
  }
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 24) : "Player";
}
