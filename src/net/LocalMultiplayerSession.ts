import type { ScoreboardRow } from "../ui/hud/Scoreboard";

type LocalMessage =
  | { type: "hello"; peer: LocalPeer }
  | { type: "heartbeat"; peer: LocalPeer }
  | { type: "score"; peerId: string; row: ScoreboardRow }
  | { type: "leave"; peerId: string };

export interface LocalPeer {
  id: string;
  name: string;
  role: "host" | "client";
  joinedAt: number;
  lastSeen: number;
}

export interface LocalMultiplayerSnapshot {
  roomId: string;
  self: LocalPeer;
  peers: LocalPeer[];
}

const HEARTBEAT_MS = 1000;
const PEER_TIMEOUT_MS = 4000;

export class LocalMultiplayerSession {
  private readonly roomId: string;
  private readonly channel: BroadcastChannel;
  private readonly self: LocalPeer;
  private readonly peers = new Map<string, LocalPeer>();
  private readonly onChange: (snapshot: LocalMultiplayerSnapshot) => void;
  private readonly onScore: (row: ScoreboardRow) => void;
  private heartbeatId = 0;

  constructor(options: {
    roomId: string;
    role: "host" | "client";
    name: string;
    onChange: (snapshot: LocalMultiplayerSnapshot) => void;
    onScore: (row: ScoreboardRow) => void;
  }) {
    this.roomId = options.roomId || "webfps";
    this.channel = new BroadcastChannel(`webfps.local.${this.roomId}`);
    this.onChange = options.onChange;
    this.onScore = options.onScore;
    this.self = {
      id: crypto.randomUUID(),
      name: options.name,
      role: options.role,
      joinedAt: performance.now(),
      lastSeen: performance.now(),
    };

    this.channel.addEventListener("message", this.onMessage);
    this.broadcast({ type: "hello", peer: this.self });
    this.heartbeatId = window.setInterval(() => this.heartbeat(), HEARTBEAT_MS);
    this.emitChange();
  }

  updateScore(row: ScoreboardRow): void {
    this.broadcast({
      type: "score",
      peerId: this.self.id,
      row: {
        ...row,
        id: this.self.id,
        name: this.self.name,
        team: this.self.role === "host" ? "A" : "B",
      },
    });
  }

  dispose(): void {
    window.clearInterval(this.heartbeatId);
    this.broadcast({ type: "leave", peerId: this.self.id });
    this.channel.removeEventListener("message", this.onMessage);
    this.channel.close();
  }

  private heartbeat(): void {
    this.prunePeers();
    this.self.lastSeen = performance.now();
    this.broadcast({ type: "heartbeat", peer: this.self });
    this.emitChange();
  }

  private onMessage = (event: MessageEvent<LocalMessage>): void => {
    const message = event.data;
    if (!message || ("peer" in message && message.peer.id === this.self.id)) return;

    if (message.type === "hello" || message.type === "heartbeat") {
      this.peers.set(message.peer.id, { ...message.peer, lastSeen: performance.now() });
      if (message.type === "hello") this.broadcast({ type: "heartbeat", peer: this.self });
      this.emitChange();
    } else if (message.type === "score") {
      const peer = this.peers.get(message.peerId);
      if (peer) {
        peer.lastSeen = performance.now();
        this.peers.set(peer.id, peer);
      }
      this.onScore(message.row);
    } else if (message.type === "leave") {
      this.peers.delete(message.peerId);
      this.emitChange();
    }
  };

  private prunePeers(): void {
    const now = performance.now();
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > PEER_TIMEOUT_MS) this.peers.delete(id);
    }
  }

  private broadcast(message: LocalMessage): void {
    this.channel.postMessage(message);
  }

  private emitChange(): void {
    this.onChange({
      roomId: this.roomId,
      self: this.self,
      peers: [...this.peers.values()],
    });
  }
}
