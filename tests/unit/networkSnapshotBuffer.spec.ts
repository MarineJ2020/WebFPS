import { describe, expect, it } from "vitest";
import { NetworkSnapshotBuffer } from "../../src/net/NetworkSnapshotBuffer";
import type { LanCharacterSnapshot, LanMatchSnapshot } from "../../src/net/LanProtocol";

function character(id: string, x: number): LanCharacterSnapshot {
  return {
    id,
    name: id,
    team: "A",
    position: { x, y: 0.1, z: 0 },
    yaw: 0,
    pitch: 0,
    health: 100,
    maxHealth: 100,
    dead: false,
    respawnRemaining: 0,
    kills: 0,
    deaths: 0,
    weapon: {
      configId: "assault_rifle_01",
      ammoInMag: 30,
      ammoReserve: 90,
      reloadTimer: 0,
      fireModeKind: "auto",
    },
    kind: "player",
  };
}

function snapshot(serverTime: number, x: number): LanMatchSnapshot {
  return {
    roomId: "room",
    serverTime,
    phase: "live",
    phaseRemaining: 100,
    scoreLimit: 25,
    timeLimit: 600,
    winner: null,
    rematchVotes: 0,
    rematchNeeded: 1,
    players: [character("p1", x)],
    bots: [],
    pickups: [],
    shots: [],
    kills: [],
  };
}

describe("NetworkSnapshotBuffer", () => {
  it("interpolates remote snapshot positions", () => {
    const buffer = new NetworkSnapshotBuffer();
    buffer.push(snapshot(1, 0), 1000);
    buffer.push(snapshot(1.2, 2), 1200);

    const sampled = buffer.sample(1200, 0.1);

    expect(sampled?.players[0].position.x).toBeCloseTo(1);
  });

  it("snaps instead of interpolating teleport-sized moves", () => {
    const buffer = new NetworkSnapshotBuffer();
    buffer.push(snapshot(1, 0), 1000);
    buffer.push(snapshot(1.2, 10), 1200);

    const sampled = buffer.sample(1200, 0.05);

    expect(sampled?.players[0].position.x).toBe(10);
  });
});
