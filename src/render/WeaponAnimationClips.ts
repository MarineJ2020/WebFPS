import * as THREE from "three";

/**
 * AutoRifle.glb ships one combined "allanims" track; these are the named frame ranges within
 * it (confirmed at 30fps against the source file's accessor time ranges). Adjust here if a
 * different weapon model uses different ranges/fps.
 */
export const WEAPON_ANIMATION_FPS = 30;

export type WeaponClipName = "fire" | "reloadA" | "firelast" | "reloadB" | "hide" | "ready" | "ambient";

const FRAME_RANGES: Record<WeaponClipName, [number, number]> = {
  fire: [0, 8],
  reloadA: [9, 67],
  firelast: [68, 76],
  reloadB: [77, 159],
  hide: [160, 170],
  ready: [171, 209],
  ambient: [210, 232],
};

export function clipDurationSeconds(name: WeaponClipName): number {
  const [start, end] = FRAME_RANGES[name];
  return (end - start) / WEAPON_ANIMATION_FPS;
}

/** Splits a single combined clip into the named sub-clips above. */
export function buildWeaponClips(
  sourceClip: THREE.AnimationClip,
): Record<WeaponClipName, THREE.AnimationClip> {
  const entries = Object.entries(FRAME_RANGES) as [WeaponClipName, [number, number]][];
  const clips = {} as Record<WeaponClipName, THREE.AnimationClip>;
  for (const [name, [start, end]] of entries) {
    clips[name] = THREE.AnimationUtils.subclip(sourceClip, name, start, end, WEAPON_ANIMATION_FPS);
  }
  return clips;
}
