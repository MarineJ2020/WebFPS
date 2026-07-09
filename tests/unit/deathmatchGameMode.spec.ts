import { describe, expect, it } from "vitest";
import { Player } from "../../src/core/entities/Player";
import { createWeapon } from "../../src/core/entities/weapons/Weapon";
import { DeathmatchGameMode } from "../../src/core/gamemode/DeathmatchGameMode";
import { getWeaponConfig } from "../../src/data/weapons/weaponTypes";

function advanceToLive(mode: DeathmatchGameMode): void {
  mode.update(15, ["p1"]);
  mode.update(20, ["p1"]);
}

function recordKill(mode: DeathmatchGameMode, now: number): void {
  mode.recordKill({
    killerId: "p1",
    killerName: "Alice",
    killerTeam: "A",
    victimId: "bot-1",
    victimName: "Bot",
    victimTeam: "B",
    victimPosition: { x: 1, y: 0.1, z: 2 },
    now,
  });
}

describe("DeathmatchGameMode", () => {
  it("ends on score limit", () => {
    const mode = new DeathmatchGameMode({ now: 0, rng: () => 1 });
    advanceToLive(mode);

    for (let i = 0; i < mode.scoreLimit; i++) recordKill(mode, 21 + i);

    const phase = mode.getPhaseState(50, ["p1"]);
    expect(phase.phase).toBe("roundEnd");
    expect(phase.winner).toBe("Alice");
  });

  it("ends on time limit", () => {
    const mode = new DeathmatchGameMode({ now: 0, rng: () => 1 });
    advanceToLive(mode);

    mode.update(621, ["p1"]);

    expect(mode.getPhaseState(621, ["p1"]).phase).toBe("roundEnd");
  });

  it("creates ammo drops every kill and health drops when chance passes", () => {
    const mode = new DeathmatchGameMode({ now: 0, rng: () => 0 });
    advanceToLive(mode);

    recordKill(mode, 21);

    expect(mode.pickups.some((pickup) => pickup.kind === "ammo_box")).toBe(true);
    expect(mode.pickups.some((pickup) => pickup.kind === "health_pack")).toBe(true);
  });

  it("collects pickups and expires old pickups", () => {
    const mode = new DeathmatchGameMode({ now: 0, rng: () => 0 });
    advanceToLive(mode);
    recordKill(mode, 21);
    const weapon = createWeapon(getWeaponConfig("assault_rifle_01"));
    const player = new Player("p1", { x: 1, y: 0.1, z: 2 }, [weapon]);
    player.health = 50;
    weapon.ammoReserve = 0;

    mode.collectPickups(player, 22);

    expect(player.health).toBe(85);
    expect(weapon.ammoReserve).toBe(getWeaponConfig("assault_rifle_01").reserveAmmoMax);
    expect(mode.pickups).toHaveLength(0);

    recordKill(mode, 23);
    mode.update(44, ["p1"]);
    expect(mode.pickups).toHaveLength(0);
  });

  it("moves through rematch and resets scores", () => {
    const mode = new DeathmatchGameMode({ now: 0, rng: () => 1 });
    advanceToLive(mode);
    for (let i = 0; i < mode.scoreLimit; i++) recordKill(mode, 21 + i);
    mode.update(60, ["p1"]);

    expect(mode.getPhaseState(60, ["p1"]).phase).toBe("rematch");

    mode.voteRematch("p1");
    mode.update(61, ["p1"]);

    expect(mode.getPhaseState(61, ["p1"]).phase).toBe("countdown");
    expect(mode.getScore("p1")).toEqual({ kills: 0, deaths: 0 });
  });
});
