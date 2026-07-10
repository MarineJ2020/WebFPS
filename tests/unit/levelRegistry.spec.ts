import { describe, expect, it } from "vitest";
import { createImportedLevel, getSelectableLevels } from "../../src/data/levels/LevelRegistry";
import type { MapDefinition } from "../../src/data/maps/MapDefinition";

const TEST_MAP: MapDefinition = {
  volumes: [],
  navMeshRegions: [],
  spawnPoints: {
    player: { x: 0, y: 0.1, z: 0 },
    ai: [],
  },
};

describe("LevelRegistry", () => {
  it("includes built-in manifest maps", () => {
    expect(getSelectableLevels().some((level) => level.id === "blockout_map_01")).toBe(true);
  });

  it("creates imported levels from runtime map JSON", () => {
    const level = createImportedLevel(JSON.stringify(TEST_MAP), "test-arena.json");

    expect(level).toMatchObject({
      id: "test-arena",
      name: "Test Arena",
      source: "import",
      map: TEST_MAP,
    });
  });

  it("creates imported levels from map manifest JSON", () => {
    const level = createImportedLevel(JSON.stringify({
      id: "arena_manifest",
      displayName: "Arena Manifest",
      definition: TEST_MAP,
    }), "ignored.json");

    expect(level).toMatchObject({
      id: "arena_manifest",
      name: "Arena Manifest",
      source: "import",
      map: TEST_MAP,
    });
  });
});
