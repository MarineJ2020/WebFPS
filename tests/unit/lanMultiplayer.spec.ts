import { describe, expect, it } from "vitest";
import { LanMatchSimulation } from "../../src/net/LanMatchSimulation";
import { LanRoomManager } from "../../src/net/LanRoomManager";
import type { MapDefinition } from "../../src/data/maps/MapDefinition";
import { emptyPlayerCommand } from "../../src/core/simulation/commands/PlayerCommand";

const TEST_MAP: MapDefinition = {
  volumes: [],
  navMeshRegions: [],
  spawnPoints: {
    player: { x: 0, y: 0.1, z: 0 },
    ai: [],
    points: [
      { kind: "player", team: "A", position: { x: 10, y: 0.1, z: 0 } },
      { kind: "player", team: "B", position: { x: -10, y: 0.1, z: 0 } },
    ],
  },
};

describe("LanRoomManager", () => {
  it("creates rooms, joins players, and balances default teams", () => {
    const manager = new LanRoomManager();
    const room = manager.createRoom({ id: "p1", name: "Alice" }, "Arena", TEST_MAP);

    expect(room.players[0]).toMatchObject({ id: "p1", team: "A", isHost: true });

    const joined = manager.joinRoom({ id: "p2", name: "Bea" }, room.id);
    expect(joined?.players.find((player) => player.id === "p2")).toMatchObject({ team: "B", isHost: false });

    const summary = manager.listRooms()[0];
    expect(summary.teamCounts).toEqual({ A: 1, B: 1 });
    expect(summary.playerCount).toBe(2);
  });

  it("updates teams and reassigns host when the host leaves", () => {
    const manager = new LanRoomManager();
    const room = manager.createRoom({ id: "p1", name: "Alice" }, "Arena", TEST_MAP);
    manager.joinRoom({ id: "p2", name: "Bea" }, room.id);

    manager.setTeam("p2", "A");
    expect(manager.getRoom(room.id)?.players.find((player) => player.id === "p2")?.team).toBe("A");

    manager.leaveRoom("p1");
    expect(manager.getRoom(room.id)?.players[0]).toMatchObject({ id: "p2", isHost: true });
  });

  it("removes empty rooms", () => {
    const manager = new LanRoomManager();
    const room = manager.createRoom({ id: "p1", name: "Alice" }, "Arena", TEST_MAP);

    manager.leaveRoom("p1");

    expect(manager.getRoom(room.id)).toBeUndefined();
    expect(manager.listRooms()).toEqual([]);
  });
});

describe("LanMatchSimulation", () => {
  it("uses team player spawns in the first authoritative snapshot", () => {
    const simulation = new LanMatchSimulation("room-1", [
      { id: "p1", name: "Alice", team: "A", isHost: true, connected: true },
      { id: "p2", name: "Bea", team: "B", isHost: false, connected: true },
    ], TEST_MAP);

    const snapshot = simulation.snapshot(1);

    expect(snapshot.players.find((player) => player.id === "p1")?.position).toEqual({ x: 10, y: 0.1, z: 0 });
    expect(snapshot.players.find((player) => player.id === "p2")?.position).toEqual({ x: -10, y: 0.1, z: 0 });
  });

  it("adds players who join after a match has started", () => {
    const simulation = new LanMatchSimulation("room-1", [
      { id: "p1", name: "Alice", team: "A", isHost: true, connected: true },
    ], TEST_MAP);

    simulation.addPlayer({ id: "p2", name: "Bea", team: "B", isHost: false, connected: true });

    const snapshot = simulation.snapshot(1);
    expect(snapshot.players.map((player) => player.id)).toEqual(["p1", "p2"]);
    expect(snapshot.players.find((player) => player.id === "p2")?.position).toEqual({ x: -10, y: 0.1, z: 0 });
  });

  it("keeps networked players from walking through solid map volumes", () => {
    const map: MapDefinition = {
      volumes: [
        { kind: "wall", halfExtents: { x: 2, y: 2, z: 0.1 }, position: { x: 0, y: 1, z: -1 } },
      ],
      navMeshRegions: [],
      spawnPoints: {
        player: { x: 0, y: 0.1, z: 0 },
        ai: [],
        points: [
          { kind: "player", team: "A", position: { x: 0, y: 0.1, z: 0 } },
        ],
      },
    };
    const simulation = new LanMatchSimulation("room-1", [
      { id: "p1", name: "Alice", team: "A", isHost: true, connected: true },
    ], map);

    simulation.setInput("p1", { ...emptyPlayerCommand(), moveZ: 1 });
    simulation.update(1, 1);

    const player = simulation.snapshot(1).players[0];
    expect(player.position.z).toBeGreaterThanOrEqual(-0.75);
  });
});
