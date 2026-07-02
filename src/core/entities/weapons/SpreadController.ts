import type { WeaponConfig } from "../../../data/weapons/weaponTypes";
import type { Weapon } from "./Weapon";

export function applySpreadPerShot(weapon: Weapon, config: WeaponConfig): void {
  weapon.currentSpread = Math.min(config.maxSpread, weapon.currentSpread + config.spreadPerShot);
}

export function decaySpread(weapon: Weapon, config: WeaponConfig, dt: number): void {
  weapon.currentSpread = Math.max(
    config.baseSpread,
    weapon.currentSpread - config.spreadRecoveryRate * dt,
  );
}
