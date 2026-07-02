import type { Vec3 } from "../entities/Entity";
import { distance, normalize, subtract } from "../math/vec3";
import type { IHitscanQuery } from "../physics/raycast/IHitscanQuery";

export interface PerceptionConfig {
  viewRange: number;
  fovHalfAngleRadians: number;
  eyeHeight: number;
}

/**
 * Distance + FOV cone + unobstructed line-of-sight check. `selfId` is excluded from the
 * LOS raycast's character targets so a bot never sees "through" its own hitbox.
 */
export function canSeeTarget(
  selfEyePosition: Vec3,
  selfYaw: number,
  targetPosition: Vec3,
  targetEyeHeight: number,
  config: PerceptionConfig,
  hitscan: IHitscanQuery,
): boolean {
  const targetEye: Vec3 = { x: targetPosition.x, y: targetPosition.y + targetEyeHeight, z: targetPosition.z };
  const toTarget = subtract(targetEye, selfEyePosition);
  const dist = distance(selfEyePosition, targetEye);
  if (dist > config.viewRange || dist === 0) return false;

  const direction = normalize(toTarget);
  const forwardX = -Math.sin(selfYaw);
  const forwardZ = -Math.cos(selfYaw);
  const dot = direction.x * forwardX + direction.z * forwardZ;
  const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
  if (angle > config.fovHalfAngleRadians) return false;

  const hit = hitscan.castRay(selfEyePosition, direction, dist);
  // Unobstructed if nothing was hit before reaching the target (small epsilon for float slack).
  return hit === null || hit.distance >= dist - 0.15;
}
