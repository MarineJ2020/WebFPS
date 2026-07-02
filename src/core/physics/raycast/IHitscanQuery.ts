import type { Vec3 } from "../../entities/Entity";

export interface HitResult {
  point: Vec3;
  distance: number;
  normal?: Vec3;
  hitEntityId?: string;
}

export interface IHitscanQuery {
  castRay(origin: Vec3, direction: Vec3, maxDistance: number): HitResult | null;
}
