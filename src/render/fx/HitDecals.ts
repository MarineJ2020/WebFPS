import * as THREE from "three";
import type { Vec3 } from "../../core/entities/Entity";

const MAX_DECALS = 48;
const DECAL_RADIUS = 0.06;
const SURFACE_OFFSET = 0.01;
const UP = new THREE.Vector3(0, 0, 1);

/** Pooled bullet-hole decals on environment geometry, capped so they don't grow unbounded. */
export class HitDecals {
  private readonly scene: THREE.Scene;
  private readonly pool: THREE.Mesh[] = [];
  private nextIndex = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(point: Vec3, normal: Vec3): void {
    const mesh = this.acquire();
    const normalVec = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();

    mesh.position.set(
      point.x + normalVec.x * SURFACE_OFFSET,
      point.y + normalVec.y * SURFACE_OFFSET,
      point.z + normalVec.z * SURFACE_OFFSET,
    );
    mesh.quaternion.setFromUnitVectors(UP, normalVec);
    mesh.rotateZ(Math.random() * Math.PI * 2);
    mesh.visible = true;
  }

  private acquire(): THREE.Mesh {
    if (this.pool.length < MAX_DECALS) {
      const mesh = new THREE.Mesh(
        new THREE.CircleGeometry(DECAL_RADIUS, 10),
        new THREE.MeshBasicMaterial({
          color: 0x1a1a1a,
          transparent: true,
          opacity: 0.75,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      mesh.visible = false;
      this.scene.add(mesh);
      this.pool.push(mesh);
      return mesh;
    }

    const mesh = this.pool[this.nextIndex];
    this.nextIndex = (this.nextIndex + 1) % MAX_DECALS;
    return mesh;
  }
}
