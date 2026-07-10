import { describe, expect, it } from "vitest";
import { P2PSignalingRegistry } from "../../src/net/P2PSignalingRegistry";
import type { P2PRoomSummary } from "../../src/net/LanProtocol";

function room(id: string): P2PRoomSummary {
  return {
    id,
    name: `Room ${id}`,
    phase: "lobby",
    hostName: "Host",
    playerCount: 1,
    teamCounts: { A: 1, B: 0 },
    mode: "p2p-host",
    endpointType: "p2p",
  };
}

describe("P2PSignalingRegistry", () => {
  it("registers and lists P2P rooms", () => {
    const registry = new P2PSignalingRegistry(1000);

    registry.register("host-1", room("room-1"), 100);

    expect(registry.list(200)).toEqual([room("room-1")]);
    expect(registry.get("room-1", 200)?.hostClientId).toBe("host-1");
  });

  it("expires rooms unless the host heartbeats", () => {
    const registry = new P2PSignalingRegistry(1000);

    registry.register("host-1", room("room-1"), 100);
    registry.heartbeat("host-1", "room-1", 900);

    expect(registry.list(1800)).toHaveLength(1);
    expect(registry.list(2001)).toEqual([]);
  });

  it("only lets the owning host unregister or heartbeat a room", () => {
    const registry = new P2PSignalingRegistry(1000);

    registry.register("host-1", room("room-1"), 100);
    registry.heartbeat("host-2", "room-1", 900);
    registry.unregister("host-2", "room-1");

    expect(registry.list(1001)).toHaveLength(1);
    expect(registry.list(1101)).toEqual([]);
  });

  it("removes all rooms owned by a disconnected host", () => {
    const registry = new P2PSignalingRegistry(1000);

    registry.register("host-1", room("room-1"), 100);
    registry.register("host-1", room("room-2"), 100);
    registry.register("host-2", room("room-3"), 100);
    registry.removeHost("host-1");

    expect(registry.list(200).map((entry) => entry.id)).toEqual(["room-3"]);
  });

  it("does not let another host overwrite an active room id", () => {
    const registry = new P2PSignalingRegistry(1000);

    registry.register("host-1", room("room-1"), 100);
    registry.register("host-2", { ...room("room-1"), hostName: "Other Host" }, 200);

    expect(registry.get("room-1", 300)?.hostClientId).toBe("host-1");
    expect(registry.list(300)[0]?.hostName).toBe("Host");
  });
});
