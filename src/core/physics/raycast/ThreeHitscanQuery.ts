import * as THREE from "three";
import type { IHitscanQuery, HitResult } from "./IHitscanQuery";
import type { Vec3 } from "../../entities/Entity";

/**
 * Hitscan/LOS implementation backed by THREE.Raycaster against render meshes.
 * Isolated behind IHitscanQuery so a Rapier-based implementation can replace it
 * later (e.g. once dynamic colliders like doors exist) without touching weapon/AI code.
 */
export class ThreeHitscanQuery implements IHitscanQuery {
  private readonly raycaster = new THREE.Raycaster();
  private targets: THREE.Object3D[] = [];

  setTargets(targets: THREE.Object3D[]): void {
    this.targets = targets;
  }

  castRay(origin: Vec3, direction: Vec3, maxDistance: number): HitResult | null {
    this.raycaster.set(
      new THREE.Vector3(origin.x, origin.y, origin.z),
      new THREE.Vector3(direction.x, direction.y, direction.z).normalize(),
    );
    this.raycaster.far = maxDistance;

    const hits = this.raycaster.intersectObjects(this.targets, false);
    if (hits.length === 0) return null;

    const hit = hits[0];
    return {
      point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      distance: hit.distance,
      normal: hit.face
        ? { x: hit.face.normal.x, y: hit.face.normal.y, z: hit.face.normal.z }
        : undefined,
    };
  }
}
