import type { Vec3 } from "../../core/entities/Entity";

export type VolumeKind = "floor" | "wall" | "ramp" | "cover";

export interface MapVolume {
  kind: VolumeKind;
  halfExtents: Vec3;
  position: Vec3;
  rotation?: { x: number; y: number; z: number; w: number };
}

export interface AISpawnDefinition {
  position: Vec3;
  patrolPoints: Vec3[];
}

export interface MapDefinition {
  volumes: MapVolume[];
  /** Hand-authored convex regions (CCW winding, viewed from above) covering the walkable floor. */
  navMeshRegions: Vec3[][];
  spawnPoints: {
    player: Vec3;
    ai: AISpawnDefinition[];
  };
}

export const VOLUME_COLOR: Record<VolumeKind, number> = {
  floor: 0x808080,
  wall: 0xc2a878,
  cover: 0xd98c3d,
  ramp: 0x4a7fc2,
};
