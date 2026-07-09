import { describe, expect, it } from "vitest";
import { ASSET_MANIFEST, getManifestGameMode, getManifestMap, getManifestSession } from "../../src/data/manifests/AssetManifest";
import { createDefaultSessionDefinition } from "../../src/data/session/GameSessionDefinition";
import { getWeaponConfig } from "../../src/data/weapons/weaponTypes";

describe("asset manifests", () => {
  it("loads the current weapon, map, game mode, and session defaults", () => {
    expect(getWeaponConfig("assault_rifle_01").magazineSize).toBe(30);
    expect(getManifestMap("blockout_map_01").definition.spawnPoints.ai.length).toBeGreaterThan(0);
    expect(getManifestGameMode("deathmatch").scoreLimit).toBe(25);
    expect(getManifestSession("default-blockout").mapId).toBe("blockout_map_01");
  });

  it("creates the default session from manifest ids", () => {
    const session = createDefaultSessionDefinition();

    expect(session.id).toBe("default-blockout");
    expect(session.player.weaponConfigIds).toEqual(["assault_rifle_01"]);
    expect(session.bots.every((bot) => bot.weaponConfigIds[0] === "bot_rifle_01")).toBe(true);
    expect(Object.keys(ASSET_MANIFEST.weapons)).toContain("assault_rifle_01");
  });
});
