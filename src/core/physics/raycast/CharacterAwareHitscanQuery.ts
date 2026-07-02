import type { IHitscanQuery, HitResult } from "./IHitscanQuery";
import type { Vec3 } from "../../entities/Entity";

export interface CharacterHitboxTarget {
  entityId: string;
  center: Vec3;
  radius: number;
}

/**
 * Decorates a base IHitscanQuery (map/mesh geometry) with analytic ray-vs-sphere checks
 * against character hitboxes, so hitEntityId can be populated without needing a per-entity
 * render mesh (the local player has no body mesh, only a camera).
 */
export class CharacterAwareHitscanQuery implements IHitscanQuery {
  private readonly base: IHitscanQuery;
  private characters: CharacterHitboxTarget[] = [];

  constructor(base: IHitscanQuery) {
    this.base = base;
  }

  setCharacters(characters: CharacterHitboxTarget[]): void {
    this.characters = characters;
  }

  castRay(origin: Vec3, direction: Vec3, maxDistance: number): HitResult | null {
    const baseHit = this.base.castRay(origin, direction, maxDistance);
    let closest = baseHit;
    let closestDistance = baseHit?.distance ?? maxDistance;

    for (const character of this.characters) {
      const hitDistance = raySphereIntersectDistance(origin, direction, character.center, character.radius);
      if (hitDistance !== null && hitDistance < closestDistance) {
        closestDistance = hitDistance;
        closest = {
          point: {
            x: origin.x + direction.x * hitDistance,
            y: origin.y + direction.y * hitDistance,
            z: origin.z + direction.z * hitDistance,
          },
          distance: hitDistance,
          hitEntityId: character.entityId,
        };
      }
    }

    return closest;
  }
}

/** Assumes `direction` is normalized. Returns the nearest positive intersection distance, or null. */
function raySphereIntersectDistance(origin: Vec3, direction: Vec3, center: Vec3, radius: number): number | null {
  const ocX = origin.x - center.x;
  const ocY = origin.y - center.y;
  const ocZ = origin.z - center.z;

  const b = ocX * direction.x + ocY * direction.y + ocZ * direction.z;
  const c = ocX * ocX + ocY * ocY + ocZ * ocZ - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const nearRoot = -b - sqrtDiscriminant;
  const farRoot = -b + sqrtDiscriminant;
  if (nearRoot >= 0) return nearRoot;
  if (farRoot >= 0) return farRoot;
  return null;
}
