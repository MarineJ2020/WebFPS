import { describe, expect, it } from "vitest";
import { createWeapon } from "../../src/core/entities/weapons/Weapon";
import {
  cycleFireMode,
  startReload,
  updateFireMode,
  updateReload,
} from "../../src/core/entities/weapons/FireModeController";
import type { WeaponConfig } from "../../src/data/weapons/weaponTypes";

const TEST_CONFIG: WeaponConfig = {
  id: "test_gun",
  displayName: "Test Gun",
  damage: 10,
  range: 50,
  fireModes: [
    { kind: "semi", fireRate: 5 }, // one shot every 0.2s
    { kind: "burst", fireRate: 10, burstCount: 3, burstInterval: 0.05 },
    { kind: "auto", fireRate: 10 }, // one shot every 0.1s
  ],
  defaultFireModeIndex: 0,
  recoil: { verticalKickMin: 0, verticalKickMax: 0, horizontalKickRange: 0, recoverySpeed: 1 },
  baseSpread: 0,
  spreadPerShot: 0,
  maxSpread: 0,
  spreadRecoveryRate: 0,
  magazineSize: 6,
  reserveAmmoMax: 12,
  reloadTime: 1,
  equipTime: 0,
};

function held(dt: number) {
  return { dt, triggerHeld: true, triggerPressedEdge: false };
}

function pressed(dt: number) {
  return { dt, triggerHeld: true, triggerPressedEdge: true };
}

function released(dt: number) {
  return { dt, triggerHeld: false, triggerPressedEdge: false };
}

describe("semi fire mode", () => {
  it("fires exactly once per press, ignoring repeated presses faster than fire rate", () => {
    const weapon = createWeapon(TEST_CONFIG);
    let shots = 0;

    shots += updateFireMode(weapon, TEST_CONFIG, pressed(0)).firedShots;
    // Rapid repeated "press" edges before cooldown elapses must not fire again.
    shots += updateFireMode(weapon, TEST_CONFIG, pressed(0.01)).firedShots;
    shots += updateFireMode(weapon, TEST_CONFIG, pressed(0.01)).firedShots;

    expect(shots).toBe(1);
    expect(weapon.ammoInMag).toBe(5);
  });

  it("fires again once the fire-rate cooldown has elapsed", () => {
    const weapon = createWeapon(TEST_CONFIG);
    updateFireMode(weapon, TEST_CONFIG, pressed(0));
    updateFireMode(weapon, TEST_CONFIG, released(0.25)); // past 0.2s cooldown

    const result = updateFireMode(weapon, TEST_CONFIG, pressed(0));
    expect(result.firedShots).toBe(1);
    expect(weapon.ammoInMag).toBe(4);
  });

  it("does not fire while merely held without a new press edge", () => {
    const weapon = createWeapon(TEST_CONFIG);
    updateFireMode(weapon, TEST_CONFIG, pressed(0));
    const result = updateFireMode(weapon, TEST_CONFIG, held(1));
    expect(result.firedShots).toBe(0);
  });
});

describe("auto fire mode", () => {
  function autoWeapon() {
    const weapon = createWeapon(TEST_CONFIG);
    weapon.currentFireModeIndex = 2;
    return weapon;
  }

  it("fires continuously at the configured cadence while held", () => {
    const weapon = autoWeapon();
    let shots = 0;

    shots += updateFireMode(weapon, TEST_CONFIG, pressed(0)).firedShots;
    shots += updateFireMode(weapon, TEST_CONFIG, held(0.1)).firedShots;
    shots += updateFireMode(weapon, TEST_CONFIG, held(0.1)).firedShots;

    expect(shots).toBe(3);
    expect(weapon.ammoInMag).toBe(3);
  });

  it("stops firing as soon as the trigger is released", () => {
    const weapon = autoWeapon();
    updateFireMode(weapon, TEST_CONFIG, pressed(0));
    const result = updateFireMode(weapon, TEST_CONFIG, released(0.1));
    expect(result.firedShots).toBe(0);
  });

  it("stops firing when out of ammo", () => {
    const weapon = autoWeapon();
    weapon.ammoInMag = 1;
    updateFireMode(weapon, TEST_CONFIG, pressed(0));
    expect(weapon.ammoInMag).toBe(0);
    const result = updateFireMode(weapon, TEST_CONFIG, held(0.1));
    expect(result.firedShots).toBe(0);
  });
});

describe("burst fire mode", () => {
  function burstWeapon() {
    const weapon = createWeapon(TEST_CONFIG);
    weapon.currentFireModeIndex = 1;
    return weapon;
  }

  it("fires exactly burstCount shots per trigger press, spaced by burstInterval", () => {
    const weapon = burstWeapon();
    let shots = 0;

    shots += updateFireMode(weapon, TEST_CONFIG, pressed(0)).firedShots; // shot 1, immediate
    shots += updateFireMode(weapon, TEST_CONFIG, held(0.02)).firedShots; // still within interval
    shots += updateFireMode(weapon, TEST_CONFIG, held(0.05)).firedShots; // shot 2
    shots += updateFireMode(weapon, TEST_CONFIG, held(0.05)).firedShots; // shot 3
    shots += updateFireMode(weapon, TEST_CONFIG, held(0.05)).firedShots; // burst over, no 4th shot

    expect(shots).toBe(3);
    expect(weapon.ammoInMag).toBe(3);
  });

  it("ignores further presses until the burst and its cooldown complete", () => {
    const weapon = burstWeapon();
    updateFireMode(weapon, TEST_CONFIG, pressed(0));
    updateFireMode(weapon, TEST_CONFIG, held(0.05));
    updateFireMode(weapon, TEST_CONFIG, held(0.05));
    expect(weapon.ammoInMag).toBe(3);

    // A new press immediately after the burst completes should be blocked by the mode's cooldown.
    const result = updateFireMode(weapon, TEST_CONFIG, pressed(0));
    expect(result.firedShots).toBe(0);
    expect(weapon.ammoInMag).toBe(3);
  });
});

describe("mode switching", () => {
  it("cycles through fire modes and cancels an in-progress burst", () => {
    const weapon = createWeapon(TEST_CONFIG);
    weapon.currentFireModeIndex = 1;
    updateFireMode(weapon, TEST_CONFIG, pressed(0));
    expect(weapon.burstState).not.toBeNull();

    cycleFireMode(weapon, TEST_CONFIG);

    expect(weapon.currentFireModeIndex).toBe(2);
    expect(weapon.burstState).toBeNull();
  });

  it("wraps back to the first fire mode", () => {
    const weapon = createWeapon(TEST_CONFIG);
    weapon.currentFireModeIndex = 2;
    cycleFireMode(weapon, TEST_CONFIG);
    expect(weapon.currentFireModeIndex).toBe(0);
  });
});

describe("reload", () => {
  it("blocks firing while in progress and refills the magazine from reserve on completion", () => {
    const weapon = createWeapon(TEST_CONFIG);
    weapon.ammoInMag = 2;
    weapon.ammoReserve = 10;

    expect(startReload(weapon, TEST_CONFIG)).toBe(true);

    const midReload = updateFireMode(weapon, TEST_CONFIG, pressed(0.5));
    expect(midReload.firedShots).toBe(0);

    updateReload(weapon, TEST_CONFIG, 1); // reloadTime elapses
    expect(weapon.ammoInMag).toBe(TEST_CONFIG.magazineSize); // 2 + 4 transferred = 6
    expect(weapon.ammoReserve).toBe(6); // 10 - 4 transferred
  });

  it("refuses to start when the magazine is already full or reserve is empty", () => {
    const weapon = createWeapon(TEST_CONFIG);
    expect(startReload(weapon, TEST_CONFIG)).toBe(false);

    weapon.ammoInMag = 1;
    weapon.ammoReserve = 0;
    expect(startReload(weapon, TEST_CONFIG)).toBe(false);
  });
});
