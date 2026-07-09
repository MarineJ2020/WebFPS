import type { LanCharacterSnapshot, LanMatchSnapshot } from "./LanProtocol";

const DEFAULT_INTERPOLATION_DELAY_SECONDS = 0.1;
const TELEPORT_SNAP_DISTANCE = 4;
const MAX_BUFFERED_SNAPSHOTS = 24;

export class NetworkSnapshotBuffer {
  private readonly snapshots: LanMatchSnapshot[] = [];
  private latestReceivedAtMs = 0;

  push(snapshot: LanMatchSnapshot, receivedAtMs = performance.now()): void {
    this.latestReceivedAtMs = receivedAtMs;
    this.snapshots.push({ ...snapshot, shots: [], kills: [] });
    this.snapshots.sort((a, b) => a.serverTime - b.serverTime);
    while (this.snapshots.length > MAX_BUFFERED_SNAPSHOTS) this.snapshots.shift();
  }

  sample(nowMs = performance.now(), interpolationDelaySeconds = DEFAULT_INTERPOLATION_DELAY_SECONDS): LanMatchSnapshot | null {
    const latest = this.snapshots.at(-1);
    if (!latest) return null;

    const estimatedServerTime = latest.serverTime + Math.max(0, nowMs - this.latestReceivedAtMs) / 1000;
    const renderTime = estimatedServerTime - interpolationDelaySeconds;
    let before = this.snapshots[0];
    let after = latest;

    for (let i = 0; i < this.snapshots.length; i++) {
      const candidate = this.snapshots[i];
      if (candidate.serverTime <= renderTime) before = candidate;
      if (candidate.serverTime >= renderTime) {
        after = candidate;
        break;
      }
    }

    if (!before || !after || before === after) return latest;
    const span = after.serverTime - before.serverTime;
    const t = span > 0 ? clamp01((renderTime - before.serverTime) / span) : 1;

    return {
      ...latest,
      players: interpolateCharacters(before.players, after.players, t),
      bots: interpolateCharacters(before.bots, after.bots, t),
      shots: [],
      kills: [],
    };
  }

  clear(): void {
    this.snapshots.length = 0;
    this.latestReceivedAtMs = 0;
  }
}

function interpolateCharacters(
  before: readonly LanCharacterSnapshot[],
  after: readonly LanCharacterSnapshot[],
  t: number,
): LanCharacterSnapshot[] {
  return after.map((next) => {
    const prev = before.find((candidate) => candidate.id === next.id);
    if (!prev || prev.dead !== next.dead || distance(prev.position, next.position) > TELEPORT_SNAP_DISTANCE) return next;
    return {
      ...next,
      position: {
        x: lerp(prev.position.x, next.position.x, t),
        y: lerp(prev.position.y, next.position.y, t),
        z: lerp(prev.position.z, next.position.z, t),
      },
      yaw: lerpAngle(prev.yaw, next.yaw, t),
      pitch: lerp(prev.pitch, next.pitch, t),
    };
  });
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
