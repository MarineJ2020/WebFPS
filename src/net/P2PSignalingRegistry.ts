import type { P2PRoomSummary } from "./LanProtocol";

export interface RegisteredP2PRoom {
  room: P2PRoomSummary;
  hostClientId: string;
  lastSeen: number;
}

export class P2PSignalingRegistry {
  private readonly rooms = new Map<string, RegisteredP2PRoom>();
  private readonly ttlMs: number;

  constructor(ttlMs = 8000) {
    this.ttlMs = ttlMs;
  }

  register(hostClientId: string, room: P2PRoomSummary, now = performance.now()): void {
    this.prune(now);
    const existing = this.rooms.get(room.id);
    if (existing && existing.hostClientId !== hostClientId) return;
    this.rooms.set(room.id, { hostClientId, room, lastSeen: now });
  }

  heartbeat(hostClientId: string, roomId: string, now = performance.now()): void {
    const existing = this.rooms.get(roomId);
    if (!existing || existing.hostClientId !== hostClientId) return;
    existing.lastSeen = now;
  }

  unregister(hostClientId: string, roomId: string): void {
    const existing = this.rooms.get(roomId);
    if (existing?.hostClientId === hostClientId) this.rooms.delete(roomId);
  }

  removeHost(hostClientId: string): void {
    for (const [roomId, room] of this.rooms) {
      if (room.hostClientId === hostClientId) this.rooms.delete(roomId);
    }
  }

  get(roomId: string, now = performance.now()): RegisteredP2PRoom | null {
    this.prune(now);
    return this.rooms.get(roomId) ?? null;
  }

  list(now = performance.now()): P2PRoomSummary[] {
    this.prune(now);
    return [...this.rooms.values()].map((entry) => entry.room);
  }

  prune(now = performance.now()): number {
    let removed = 0;
    for (const [roomId, room] of this.rooms) {
      if (now - room.lastSeen > this.ttlMs) {
        this.rooms.delete(roomId);
        removed += 1;
      }
    }
    return removed;
  }
}
