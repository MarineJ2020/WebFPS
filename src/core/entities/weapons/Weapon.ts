import type { WeaponConfig } from "../../../data/weapons/weaponTypes";

export interface BurstState {
  shotsRemaining: number;
  intervalTimer: number;
}

/** Plain, serializable runtime state — deliberately shaped to mirror a future networked schema. */
export interface Weapon {
  configId: string;
  ammoInMag: number;
  ammoReserve: number;
  currentFireModeIndex: number;
  currentSpread: number;
  cooldownTimer: number;
  reloadTimer: number;
  burstState: BurstState | null;
}

export function createWeapon(config: WeaponConfig): Weapon {
  return {
    configId: config.id,
    ammoInMag: config.magazineSize,
    ammoReserve: config.reserveAmmoMax,
    currentFireModeIndex: config.defaultFireModeIndex,
    currentSpread: config.baseSpread,
    cooldownTimer: 0,
    reloadTimer: 0,
    burstState: null,
  };
}
