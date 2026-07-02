import type { WeaponConfig } from "../../../data/weapons/weaponTypes";
import type { Weapon } from "./Weapon";

export interface FireModeUpdateInput {
  dt: number;
  triggerHeld: boolean;
  triggerPressedEdge: boolean;
}

export interface FireModeUpdateResult {
  firedShots: number;
}

const NO_SHOT: FireModeUpdateResult = { firedShots: 0 };

/** Pure state-machine step: decides how many shots (0 or 1 per tick) the current fire mode fires. */
export function updateFireMode(
  weapon: Weapon,
  config: WeaponConfig,
  input: FireModeUpdateInput,
): FireModeUpdateResult {
  const mode = config.fireModes[weapon.currentFireModeIndex];
  weapon.cooldownTimer = Math.max(0, weapon.cooldownTimer - input.dt);

  const canFire = weapon.ammoInMag > 0 && weapon.reloadTimer <= 0;
  const shotInterval = 1 / mode.fireRate;

  switch (mode.kind) {
    case "semi": {
      if (canFire && input.triggerPressedEdge && weapon.cooldownTimer <= 0) {
        weapon.cooldownTimer = shotInterval;
        weapon.ammoInMag -= 1;
        return { firedShots: 1 };
      }
      return NO_SHOT;
    }

    case "auto": {
      if (canFire && input.triggerHeld && weapon.cooldownTimer <= 0) {
        weapon.cooldownTimer = shotInterval;
        weapon.ammoInMag -= 1;
        return { firedShots: 1 };
      }
      return NO_SHOT;
    }

    case "burst": {
      if (weapon.burstState === null) {
        if (canFire && input.triggerPressedEdge && weapon.cooldownTimer <= 0) {
          weapon.burstState = { shotsRemaining: mode.burstCount ?? 3, intervalTimer: 0 };
        } else {
          return NO_SHOT;
        }
      }

      const burst = weapon.burstState;
      if (!canFire) {
        weapon.burstState = null;
        weapon.cooldownTimer = shotInterval;
        return NO_SHOT;
      }

      burst.intervalTimer -= input.dt;
      if (burst.intervalTimer > 0) {
        return NO_SHOT;
      }

      weapon.ammoInMag -= 1;
      burst.shotsRemaining -= 1;
      burst.intervalTimer = mode.burstInterval ?? shotInterval;
      if (burst.shotsRemaining <= 0) {
        weapon.burstState = null;
        weapon.cooldownTimer = shotInterval;
      }
      return { firedShots: 1 };
    }
  }
}

export function cycleFireMode(weapon: Weapon, config: WeaponConfig): void {
  weapon.currentFireModeIndex = (weapon.currentFireModeIndex + 1) % config.fireModes.length;
  weapon.burstState = null;
  weapon.cooldownTimer = 0;
}

export function startReload(weapon: Weapon, config: WeaponConfig): boolean {
  if (weapon.reloadTimer > 0) return false;
  if (weapon.ammoInMag >= config.magazineSize || weapon.ammoReserve <= 0) return false;
  // An empty magazine needs a round chambered too, so it uses the (longer) empty-reload
  // duration when the weapon defines one - matches the "reloadB" animation being longer
  // than "reloadA" for a still-loaded weapon.
  weapon.reloadTimer = weapon.ammoInMag <= 0 ? (config.reloadTimeEmpty ?? config.reloadTime) : config.reloadTime;
  weapon.burstState = null;
  return true;
}

export function updateReload(weapon: Weapon, config: WeaponConfig, dt: number): void {
  if (weapon.reloadTimer <= 0) return;

  weapon.reloadTimer -= dt;
  if (weapon.reloadTimer <= 0) {
    const needed = config.magazineSize - weapon.ammoInMag;
    const transferred = Math.min(needed, weapon.ammoReserve);
    weapon.ammoInMag += transferred;
    weapon.ammoReserve -= transferred;
    weapon.reloadTimer = 0;
  }
}
