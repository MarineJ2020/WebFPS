export interface RecoilPattern {
  verticalKickMin: number;
  verticalKickMax: number;
  horizontalKickRange: number;
  recoverySpeed: number;
  patternCurve?: number[];
}

export interface FireModeDefinition {
  kind: "semi" | "auto" | "burst";
  /** Shots per second while this mode is actively firing. */
  fireRate: number;
  burstCount?: number;
  /** Seconds between shots within a burst. */
  burstInterval?: number;
}

export interface WeaponConfig {
  id: string;
  displayName: string;
  damage: number;
  range: number;
  headshotMultiplier?: number;
  fireModes: FireModeDefinition[];
  defaultFireModeIndex: number;
  recoil: RecoilPattern;
  baseSpread: number;
  spreadPerShot: number;
  maxSpread: number;
  spreadRecoveryRate: number;
  magazineSize: number;
  reserveAmmoMax: number;
  /** Reload duration when some ammo remains in the magazine (tactical reload). */
  reloadTime: number;
  /** Reload duration when the magazine is fully empty, if different (defaults to reloadTime). */
  reloadTimeEmpty?: number;
  equipTime: number;
  /** Fallback primitive gun shown when no firstPersonModelUrl is set. */
  viewmodel?: {
    primitiveShape: "box" | "cylinder";
    scale: [number, number, number];
    color: string;
  };
  /** Animated first-person model (arms + gun), shown to the local player. */
  firstPersonModelUrl?: string;
  /** Static third-person model, shown on other characters (bots) holding this weapon. */
  thirdPersonModelUrl?: string;
}

export const ASSAULT_RIFLE_01: WeaponConfig = {
  id: "assault_rifle_01",
  displayName: "Assault Rifle",
  damage: 20,
  range: 100,
  headshotMultiplier: 2,
  fireModes: [
    { kind: "semi", fireRate: 6 },
    { kind: "burst", fireRate: 12, burstCount: 3, burstInterval: 0.08 },
    { kind: "auto", fireRate: 10 },
  ],
  defaultFireModeIndex: 2,
  recoil: {
    verticalKickMin: 0.006,
    verticalKickMax: 0.012,
    horizontalKickRange: 0.006,
    recoverySpeed: 6,
    // Scripted per-shot multiplier: climbs sharply over the first ~8 rounds, then plateaus -
    // recovery only kicks in once the trigger is released (see RecoilController).
    patternCurve: [1, 1.15, 1.3, 1.45, 1.6, 1.7, 1.8, 1.85, 1.9],
  },
  baseSpread: 0.002,
  spreadPerShot: 0.003,
  maxSpread: 0.03,
  spreadRecoveryRate: 0.05,
  magazineSize: 30,
  reserveAmmoMax: 90,
  // Matches the AutoRifle.glb "reloadA"/"reloadB" clip lengths (58 and 82 frames at 30fps) so
  // the reload timer and the reload animation finish together.
  reloadTime: 58 / 30,
  reloadTimeEmpty: 82 / 30,
  equipTime: 0.4,
  viewmodel: { primitiveShape: "box", scale: [0.08, 0.08, 0.5], color: "#333333" },
  firstPersonModelUrl: "/3D/weapon/AutoRifle/AutoRifle.glb",
  thirdPersonModelUrl: "/3D/weapon/AutoRifle/W_AutoRifle.glb",
};

// Deliberately weaker/less accurate than the player's rifle - bots shouldn't feel like they're
// wielding an identical, perfectly-controlled copy of the player's own gun.
export const BOT_RIFLE_01: WeaponConfig = {
  id: "bot_rifle_01",
  displayName: "Bot Rifle",
  damage: 6,
  range: 100,
  fireModes: [{ kind: "auto", fireRate: 3.5 }],
  defaultFireModeIndex: 0,
  recoil: {
    verticalKickMin: 0.006,
    verticalKickMax: 0.012,
    horizontalKickRange: 0.006,
    recoverySpeed: 6,
  },
  baseSpread: 0.02,
  spreadPerShot: 0.006,
  maxSpread: 0.08,
  spreadRecoveryRate: 0.05,
  magazineSize: 18,
  reserveAmmoMax: 54,
  reloadTime: 1.8,
  equipTime: 0.4,
  // Bots don't render a first-person viewmodel, but they hold the same visible gun model.
  thirdPersonModelUrl: "/3D/weapon/AutoRifle/W_AutoRifle.glb",
};

export const WEAPON_CONFIGS: Record<string, WeaponConfig> = {
  [ASSAULT_RIFLE_01.id]: ASSAULT_RIFLE_01,
  [BOT_RIFLE_01.id]: BOT_RIFLE_01,
};

export function getWeaponConfig(configId: string): WeaponConfig {
  const config = WEAPON_CONFIGS[configId];
  if (!config) throw new Error(`Unknown weapon config id: ${configId}`);
  return config;
}
