import type { RecoilPattern } from "../../../data/weapons/weaponTypes";

/**
 * Purely cosmetic camera-punch state — never fed back into a Character's authoritative
 * yaw/pitch, and never held on the networked Weapon state. Owned by whatever renders
 * the local camera (see CameraRig), driven by the weaponFired event.
 */
export interface RecoilOffset {
  pitch: number;
  yaw: number;
  pitchVelocity: number;
  yawVelocity: number;
  /** Shots fired since the last full recovery, indexing into the pattern curve for muzzle climb. */
  shotIndex: number;
}

export function createRecoilOffset(): RecoilOffset {
  return { pitch: 0, yaw: 0, pitchVelocity: 0, yawVelocity: 0, shotIndex: 0 };
}

export function applyRecoilKick(
  offset: RecoilOffset,
  pattern: RecoilPattern,
  rng: () => number,
): void {
  const curve = pattern.patternCurve;
  const climbMultiplier = curve && curve.length > 0 ? curve[Math.min(offset.shotIndex, curve.length - 1)] : 1;

  const baseVertical =
    pattern.verticalKickMin + rng() * (pattern.verticalKickMax - pattern.verticalKickMin);
  const horizontal = (rng() * 2 - 1) * pattern.horizontalKickRange;

  offset.pitch += baseVertical * climbMultiplier;
  offset.yaw += horizontal;
  offset.shotIndex += 1;
}

/**
 * Advances the recovery spring. While `isFiring` is true the climb is held steady (no decay)
 * so consecutive shots stack into a real rising pattern instead of settling between shots;
 * recovery only proceeds once the trigger is released, and the shot index (and thus the
 * pattern curve) resets once the offset has fully settled back to zero.
 */
export function updateRecoilRecovery(
  offset: RecoilOffset,
  pattern: RecoilPattern,
  dt: number,
  isFiring: boolean,
): void {
  if (isFiring) return;

  const [pitch, pitchVelocity] = springToZero(
    offset.pitch,
    offset.pitchVelocity,
    pattern.recoverySpeed,
    dt,
  );
  const [yaw, yawVelocity] = springToZero(offset.yaw, offset.yawVelocity, pattern.recoverySpeed, dt);
  offset.pitch = pitch;
  offset.pitchVelocity = pitchVelocity;
  offset.yaw = yaw;
  offset.yawVelocity = yawVelocity;

  if (Math.abs(offset.pitch) < 1e-4 && Math.abs(offset.yaw) < 1e-4) {
    offset.shotIndex = 0;
  }
}

/** Critically damped spring pulling (value, velocity) back toward zero. */
function springToZero(
  value: number,
  velocity: number,
  stiffness: number,
  dt: number,
): [number, number] {
  const decay = Math.exp(-stiffness * dt);
  const term = velocity + stiffness * value;
  const newValue = (value + term * dt) * decay;
  const newVelocity = (velocity - term * stiffness * dt) * decay;
  return [newValue, newVelocity];
}
