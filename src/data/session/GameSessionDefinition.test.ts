import { describe, expect, it } from "vitest";
import { BLOCKOUT_MAP_01 } from "../maps/blockoutMap01";
import { ASSAULT_RIFLE_01, BOT_RIFLE_01 } from "../weapons/weaponTypes";
import { createDefaultSessionDefinition } from "./GameSessionDefinition";

describe("createDefaultSessionDefinition", () => {
  it("keeps the built-in blockout map playable through the session contract", () => {
    const session = createDefaultSessionDefinition();

    expect(session.map).toBe(BLOCKOUT_MAP_01);
    expect(session.player.weaponConfigIds).toEqual([ASSAULT_RIFLE_01.id]);
    expect(session.bots).toHaveLength(BLOCKOUT_MAP_01.spawnPoints.ai.length);
    expect(session.bots.every((bot) => bot.weaponConfigIds[0] === BOT_RIFLE_01.id)).toBe(true);
  });
});
