import { describe, expect, it } from "vitest";
import { BLOCKOUT_MAP_01 } from "../data/maps/blockoutMap01";
import { editableFromMap, mapFromEditable } from "./EditableMapDocument";

describe("editable map document conversion", () => {
  it("preserves runtime map geometry, spawns, patrols, and navmesh regions", () => {
    const editable = editableFromMap(BLOCKOUT_MAP_01, "Test Map", "test-map");
    const runtime = mapFromEditable(editable);

    expect(runtime.volumes).toHaveLength(BLOCKOUT_MAP_01.volumes.length);
    expect(runtime.spawnPoints.player).toEqual(BLOCKOUT_MAP_01.spawnPoints.player);
    expect(runtime.spawnPoints.ai).toHaveLength(BLOCKOUT_MAP_01.spawnPoints.ai.length);
    expect(runtime.spawnPoints.ai[0].patrolPoints).toEqual(BLOCKOUT_MAP_01.spawnPoints.ai[0].patrolPoints);
    expect(runtime.navMeshRegions).toHaveLength(BLOCKOUT_MAP_01.navMeshRegions.length);
    expect(runtime.navMeshRegions[0]).toHaveLength(BLOCKOUT_MAP_01.navMeshRegions[0].length);
  });

  it("uses the bot spawn as a fallback patrol point when none are authored", () => {
    const editable = editableFromMap(BLOCKOUT_MAP_01);
    const botSpawn = editable.spawnPoints.points.find((point) => point.kind === "bot")!;
    botSpawn.patrolPoints = [];

    const runtime = mapFromEditable(editable);

    expect(runtime.spawnPoints.ai[0].patrolPoints).toEqual([botSpawn.position]);
  });
});
