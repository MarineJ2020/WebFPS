import { ASSET_MANIFEST, getManifestWeapon } from "../manifests/AssetManifest";

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

export const WEAPON_CONFIGS: Record<string, WeaponConfig> = ASSET_MANIFEST.weapons;
export const ASSAULT_RIFLE_01: WeaponConfig = getManifestWeapon("assault_rifle_01");
export const BOT_RIFLE_01: WeaponConfig = getManifestWeapon("bot_rifle_01");

export function getWeaponConfig(configId: string): WeaponConfig {
  return getManifestWeapon(configId);
}
