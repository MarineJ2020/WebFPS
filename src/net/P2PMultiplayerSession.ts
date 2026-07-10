import { createDefaultSessionDefinition } from "../data/session/GameSessionDefinition";
import type { MapDefinition } from "../data/maps/MapDefinition";
import type { PlayerCommand } from "../core/simulation/commands/PlayerCommand";
import { LanMatchSimulation } from "./LanMatchSimulation";
import type {
  LanClientMessage,
  LanLobbyState,
  LanRoomPlayer,
  LanServerMessage,
  LocalTeam,
  WebRTCIceCandidateLike,
  WebRTCSessionDescriptionLike,
} from "./LanProtocol";
import type { MultiplayerSession, MultiplayerSessionEvents } from "./MultiplayerSession";
import { SignalingClient } from "./SignalingClient";

const SIM_TICK_MS = 1000 / 30;
const SNAPSHOT_MS = 1000 / 20;
const HEARTBEAT_MS = 2500;

interface PeerConnection {
  id: string;
  name: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
}

export class P2PHostSession implements MultiplayerSession {
  readonly mode = "p2p-host" as const;
  private readonly events: MultiplayerSessionEvents;
  private readonly signaling: SignalingClient;
  private readonly peers = new Map<string, PeerConnection>();
  private selfId = "";
  private playerName = "Player";
  private lobby: LanLobbyState | null = null;
  private map: MapDefinition = createDefaultSessionDefinition().map;
  private simulation: LanMatchSimulation | null = null;
  private simTimer = 0;
  private snapshotTimer = 0;
  private heartbeatTimer = 0;
  private pendingRoomName: string | null = null;

  constructor(events: MultiplayerSessionEvents) {
    this.events = events;
    this.signaling = new SignalingClient({
      onConnectionChange: events.onConnectionChange,
      onWelcome: (clientId) => {
        this.selfId = clientId;
        this.events.onWelcome(clientId);
        if (this.pendingRoomName) {
          const name = this.pendingRoomName;
          this.pendingRoomName = null;
          this.createRoom(name, this.playerName);
        }
      },
      onRoomList: (rooms) => events.onRoomList(rooms),
      onJoinRequested: (roomId, peerClientId, playerName) => void this.onJoinRequested(roomId, peerClientId, playerName),
      onAnswer: (fromClientId, roomId, description) => void this.onAnswer(fromClientId, roomId, description),
      onIceCandidate: (fromClientId, roomId, candidate) => void this.onIceCandidate(fromClientId, roomId, candidate),
      onError: events.onError,
    });
  }

  setMap(map: MapDefinition): void {
    this.map = map;
  }

  createRoom(roomName: string, playerName: string): void {
    this.playerName = normalizeName(playerName);
    this.signaling.setPlayerName(this.playerName);
    if (!this.selfId) {
      this.pendingRoomName = roomName;
      return;
    }

    this.disposeRoomOnly();
    const roomId = createP2PRoomId(roomName);
    this.lobby = {
      id: roomId,
      name: roomName.trim() || `${this.playerName}'s P2P Room`,
      phase: "lobby",
      players: [{
        id: this.selfId,
        name: this.playerName,
        team: "A",
        isHost: true,
        connected: true,
      }],
    };
    this.events.onLobby(this.lobby);
    this.registerRoom();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.lobby) this.signaling.heartbeat(this.lobby.id);
    }, HEARTBEAT_MS);
  }

  joinRoom(_roomId: string, _playerName: string): void {
    this.events.onError("This browser is already hosting a P2P room.");
  }

  leaveRoom(): void {
    this.disposeRoomOnly();
    this.events.onConnectionChange("P2P host stopped.", true);
  }

  setTeam(team: LocalTeam): void {
    const player = this.lobby?.players.find((candidate) => candidate.id === this.selfId);
    if (!player || !this.lobby || this.lobby.phase !== "lobby") return;
    player.team = team;
    this.broadcastLobby();
  }

  startMatch(): void {
    if (!this.lobby || this.lobby.phase !== "lobby") return;
    this.lobby.phase = "warmup";
    this.simulation = new LanMatchSimulation(this.lobby.id, this.lobby.players, this.map);
    const started: LanServerMessage = { type: "matchStarted", roomId: this.lobby.id, map: this.map };
    this.events.onMatchStarted(this.lobby.id, this.map);
    this.broadcast(started);
    this.broadcastLobby();
    this.simTimer = window.setInterval(() => this.tickSimulation(), SIM_TICK_MS);
    this.snapshotTimer = window.setInterval(() => this.broadcastSnapshot(), SNAPSHOT_MS);
  }

  voteRematch(): void {
    this.simulation?.voteRematch(this.selfId);
  }

  returnToLobby(): void {
    if (!this.lobby) return;
    this.stopMatch();
    this.lobby.phase = "lobby";
    this.broadcastLobby();
  }

  sendInput(command: PlayerCommand): void {
    this.simulation?.setInput(this.selfId, command);
  }

  dispose(): void {
    this.disposeRoomOnly();
    this.signaling.dispose();
  }

  private async onJoinRequested(roomId: string, peerClientId: string, playerName: string): Promise<void> {
    if (!this.lobby || this.lobby.id !== roomId) return;
    const pc = createPeerConnection();
    const channel = pc.createDataChannel("webfps-game", { ordered: false, maxRetransmits: 0 });
    const peer: PeerConnection = { id: peerClientId, name: normalizeName(playerName), pc, channel };
    this.peers.set(peerClientId, peer);
    this.configureHostPeer(peer);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (pc.localDescription) this.signaling.sendOffer(peerClientId, roomId, serializeSessionDescription(pc.localDescription));
  }

  private async onAnswer(fromClientId: string, roomId: string, description: WebRTCSessionDescriptionLike): Promise<void> {
    if (this.lobby?.id !== roomId) return;
    const peer = this.peers.get(fromClientId);
    if (!peer) return;
    await peer.pc.setRemoteDescription(description as RTCSessionDescriptionInit);
  }

  private async onIceCandidate(fromClientId: string, roomId: string, candidate: WebRTCIceCandidateLike): Promise<void> {
    if (this.lobby?.id !== roomId) return;
    const peer = this.peers.get(fromClientId);
    if (!peer || !candidate.candidate) return;
    await peer.pc.addIceCandidate(candidate as RTCIceCandidateInit);
  }

  private configureHostPeer(peer: PeerConnection): void {
    peer.pc.addEventListener("icecandidate", (event) => {
      if (event.candidate && this.lobby) {
        this.signaling.sendIceCandidate(peer.id, this.lobby.id, serializeIceCandidate(event.candidate));
      }
    });
    peer.pc.addEventListener("connectionstatechange", () => {
      if (peer.pc.connectionState === "failed" || peer.pc.connectionState === "closed" || peer.pc.connectionState === "disconnected") {
        this.removePeer(peer.id);
      }
    });
    this.configureHostChannel(peer, peer.channel);
  }

  private configureHostChannel(peer: PeerConnection, channel: RTCDataChannel | null): void {
    if (!channel) return;
    channel.addEventListener("open", () => {
      if (!this.lobby) return;
      if (!this.lobby.players.some((player) => player.id === peer.id)) {
        this.lobby.players.push({
          id: peer.id,
          name: peer.name,
          team: pickBalancedTeam(this.lobby.players),
          isHost: false,
          connected: true,
        });
      }
      this.broadcastLobby();
      if (this.lobby.phase !== "lobby") {
        this.sendToPeer(peer, { type: "matchStarted", roomId: this.lobby.id, map: this.map });
      }
    });
    channel.addEventListener("message", (event) => this.handlePeerMessage(peer.id, JSON.parse(String(event.data)) as LanClientMessage));
    channel.addEventListener("close", () => this.removePeer(peer.id));
  }

  private handlePeerMessage(peerId: string, message: LanClientMessage): void {
    switch (message.type) {
      case "setTeam": {
        const player = this.lobby?.players.find((candidate) => candidate.id === peerId);
        if (player && this.lobby?.phase === "lobby") {
          player.team = message.team;
          this.broadcastLobby();
        }
        break;
      }
      case "input":
        this.simulation?.setInput(peerId, message.command);
        break;
      case "voteRematch":
        this.simulation?.voteRematch(peerId);
        break;
      case "returnToLobby":
        this.returnToLobby();
        break;
      case "leaveRoom":
        this.removePeer(peerId);
        break;
      case "startMatch":
      case "hello":
      case "createRoom":
      case "joinRoom":
      case "ready":
      case "ping":
      case "registerP2PRoom":
      case "p2pHostHeartbeat":
      case "unregisterP2PRoom":
      case "joinP2PRoom":
      case "webrtcOffer":
      case "webrtcAnswer":
      case "webrtcIceCandidate":
        break;
    }
  }

  private tickSimulation(): void {
    const now = performance.now() / 1000;
    this.simulation?.update(SIM_TICK_MS / 1000, now);
    if (this.simulation?.shouldReturnToLobby(now)) this.returnToLobby();
  }

  private broadcastSnapshot(): void {
    if (!this.simulation || !this.lobby) return;
    const snapshot = this.simulation.snapshot(performance.now() / 1000);
    this.lobby.phase = snapshot.phase;
    this.events.onSnapshot(snapshot);
    this.broadcast({ type: "snapshot", snapshot });
    this.registerRoom();
  }

  private broadcastLobby(): void {
    if (!this.lobby) return;
    this.events.onLobby({ ...this.lobby, players: this.lobby.players.map((player) => ({ ...player })) });
    this.broadcast({ type: "lobby", lobby: this.lobby });
    this.registerRoom();
  }

  private registerRoom(): void {
    if (!this.lobby) return;
    this.signaling.registerRoom({
      id: this.lobby.id,
      name: this.lobby.name,
      phase: this.lobby.phase,
      hostName: this.playerName,
      playerCount: this.lobby.players.length,
      teamCounts: {
        A: this.lobby.players.filter((player) => player.team === "A").length,
        B: this.lobby.players.filter((player) => player.team === "B").length,
      },
      mode: "p2p-host",
      endpointType: "p2p",
    });
  }

  private broadcast(message: LanServerMessage): void {
    for (const peer of this.peers.values()) this.sendToPeer(peer, message);
  }

  private sendToPeer(peer: PeerConnection, message: LanServerMessage): void {
    if (peer.channel?.readyState === "open") peer.channel.send(JSON.stringify(message));
  }

  private removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    peer?.pc.close();
    this.peers.delete(peerId);
    if (this.lobby) {
      this.lobby.players = this.lobby.players.filter((player) => player.id !== peerId);
      this.broadcastLobby();
    }
  }

  private stopMatch(): void {
    window.clearInterval(this.simTimer);
    window.clearInterval(this.snapshotTimer);
    this.simTimer = 0;
    this.snapshotTimer = 0;
    this.simulation = null;
  }

  private disposeRoomOnly(): void {
    if (this.lobby) this.signaling.unregisterRoom(this.lobby.id);
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = 0;
    this.stopMatch();
    for (const peer of this.peers.values()) peer.pc.close();
    this.peers.clear();
    this.lobby = null;
  }
}

export class P2PPeerSession implements MultiplayerSession {
  readonly mode = "p2p-peer" as const;
  private readonly events: MultiplayerSessionEvents;
  private readonly signaling: SignalingClient;
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private roomId = "";
  private hostClientId = "";
  private inputSequence = 0;

  constructor(events: MultiplayerSessionEvents) {
    this.events = events;
    this.signaling = new SignalingClient({
      onConnectionChange: events.onConnectionChange,
      onWelcome: events.onWelcome,
      onRoomList: events.onRoomList,
      onOffer: (fromClientId, roomId, description) => void this.onOffer(fromClientId, roomId, description),
      onIceCandidate: (fromClientId, roomId, candidate) => void this.onIceCandidate(fromClientId, roomId, candidate),
      onError: events.onError,
    });
  }

  setMap(_map: MapDefinition): void {
    // Peers receive the authoritative map from the host after joining.
  }

  createRoom(_roomName: string, _playerName: string): void {
    this.events.onError("Use Host P2P Game to create a P2P room.");
  }

  joinRoom(roomId: string, playerName: string): void {
    this.roomId = roomId;
    this.signaling.setPlayerName(playerName);
    this.signaling.joinRoom(roomId, playerName);
  }

  leaveRoom(): void {
    this.send({ type: "leaveRoom" });
    this.pc?.close();
    this.pc = null;
    this.channel = null;
  }

  setTeam(team: LocalTeam): void {
    this.send({ type: "setTeam", team });
  }

  startMatch(): void {
    this.events.onError("Only the P2P host can start the match.");
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
    this.leaveRoom();
    this.signaling.dispose();
  }

  private async onOffer(fromClientId: string, roomId: string, description: WebRTCSessionDescriptionLike): Promise<void> {
    if (this.roomId && roomId !== this.roomId) return;
    this.roomId = roomId;
    this.hostClientId = fromClientId;
    this.pc = createPeerConnection();
    this.pc.addEventListener("datachannel", (event) => this.configurePeerChannel(event.channel));
    this.pc.addEventListener("icecandidate", (event) => {
      if (event.candidate) this.signaling.sendIceCandidate(fromClientId, roomId, serializeIceCandidate(event.candidate));
    });
    this.pc.addEventListener("connectionstatechange", () => {
      if (this.pc?.connectionState === "failed" || this.pc?.connectionState === "closed" || this.pc?.connectionState === "disconnected") {
        this.events.onError("P2P host disconnected.");
      }
    });
    await this.pc.setRemoteDescription(description as RTCSessionDescriptionInit);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    if (this.pc.localDescription) this.signaling.sendAnswer(fromClientId, roomId, serializeSessionDescription(this.pc.localDescription));
  }

  private async onIceCandidate(fromClientId: string, roomId: string, candidate: WebRTCIceCandidateLike): Promise<void> {
    if (fromClientId !== this.hostClientId || roomId !== this.roomId || !this.pc || !candidate.candidate) return;
    await this.pc.addIceCandidate(candidate as RTCIceCandidateInit);
  }

  private configurePeerChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.addEventListener("open", () => this.events.onConnectionChange("Connected to P2P host.", true));
    channel.addEventListener("message", (event) => this.handleHostMessage(JSON.parse(String(event.data)) as LanServerMessage));
    channel.addEventListener("close", () => this.events.onError("P2P host closed the connection."));
  }

  private handleHostMessage(message: LanServerMessage): void {
    switch (message.type) {
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
      case "welcome":
      case "roomList":
      case "p2pRoomList":
      case "p2pJoinRequested":
      case "webrtcOffer":
      case "webrtcAnswer":
      case "webrtcIceCandidate":
      case "pong":
        break;
    }
  }

  private send(message: LanClientMessage): void {
    if (this.channel?.readyState !== "open") {
      if (message.type !== "input") this.events.onError("P2P host is not connected yet.");
      return;
    }
    this.channel.send(JSON.stringify(message));
  }
}

function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: [] });
}

function serializeSessionDescription(description: RTCSessionDescription): WebRTCSessionDescriptionLike {
  return { type: description.type, sdp: description.sdp };
}

function serializeIceCandidate(candidate: RTCIceCandidate): WebRTCIceCandidateLike {
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment,
  };
}

function createP2PRoomId(roomName: string): string {
  const slug = roomName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `p2p-${slug || "room"}-${Math.random().toString(36).slice(2, 6)}`;
}

function pickBalancedTeam(players: readonly LanRoomPlayer[]): LocalTeam {
  const a = players.filter((player) => player.team === "A").length;
  const b = players.filter((player) => player.team === "B").length;
  return a <= b ? "A" : "B";
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 24) : "Player";
}
