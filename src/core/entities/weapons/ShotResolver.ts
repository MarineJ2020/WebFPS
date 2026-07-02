import type { Vec3 } from "../Entity";
import { add, cross, forwardVectorFromYawPitch, normalize, scale } from "../../math/vec3";
import type { IHitscanQuery } from "../../physics/raycast/IHitscanQuery";
import type { EventBus } from "../../EventBus";
import type { WeaponConfig } from "../../../data/weapons/weaponTypes";
import type { Weapon } from "./Weapon";
import { GUNSHOT_NOISE_RADIUS } from "../../../config/constants";

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };

export interface ResolveShotOptions {
  shooterId: string;
  origin: Vec3;
  yaw: number;
  pitch: number;
  weapon: Weapon;
  config: WeaponConfig;
  hitscan: IHitscanQuery;
  events: EventBus;
  rng: () => number;
}

/** Fires one shot: jitters the aim direction within the weapon's current spread cone, raycasts, and emits events. */
export function resolveShot(options: ResolveShotOptions): void {
  const { shooterId, origin, yaw, pitch, weapon, config, hitscan, events, rng } = options;

  const forward = forwardVectorFromYawPitch(yaw, pitch);
  const right = normalize(cross(forward, WORLD_UP));
  const up = cross(right, forward);

  const spreadRadius = weapon.currentSpread * Math.sqrt(rng());
  const theta = rng() * Math.PI * 2;
  const jitteredDirection = normalize(
    add(
      forward,
      add(scale(right, spreadRadius * Math.cos(theta)), scale(up, spreadRadius * Math.sin(theta))),
    ),
  );

  events.emit("weaponFired", {
    entityId: shooterId,
    weaponConfigId: config.id,
    origin,
    direction: jitteredDirection,
    range: config.range,
  });
  events.emit("noiseEvent", { sourceId: shooterId, position: origin, radius: GUNSHOT_NOISE_RADIUS });

  const hit = hitscan.castRay(origin, jitteredDirection, config.range);
  if (hit) {
    events.emit("weaponHit", {
      shooterId,
      point: hit.point,
      distance: hit.distance,
      damage: config.damage,
      hitEntityId: hit.hitEntityId,
      normal: hit.normal,
    });
  }
}
