import * as THREE from "three";
import type { Vec3 } from "../../core/entities/Entity";

const MAX_TRACERS = 24;
const TRACER_LIFETIME = 0.06;
const TRACER_RADIUS = 0.012;
const MIN_VISIBLE_LENGTH = 0.05;
const UP = new THREE.Vector3(0, 1, 0);

interface ActiveTracer {
  mesh: THREE.Mesh;
  remaining: number;
}

/** Pooled fake bullet tracers: a thin fast-fading cylinder from origin to endpoint. */
export class Tracer {
  private readonly scene: THREE.Scene;
  private readonly pool: THREE.Mesh[] = [];
  private readonly active: ActiveTracer[] = [];
  private nextIndex = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(from: Vec3, to: Vec3): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < MIN_VISIBLE_LENGTH) return;

    const mesh = this.acquire();
    mesh.scale.set(1, length, 1);
    mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    mesh.quaternion.setFromUnitVectors(UP, new THREE.Vector3(dx, dy, dz).normalize());
    mesh.visible = true;
    (mesh.material as THREE.MeshBasicMaterial).opacity = 1;

    this.active.push({ mesh, remaining: TRACER_LIFETIME });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const tracer = this.active[i];
      tracer.remaining -= dt;
      if (tracer.remaining <= 0) {
        tracer.mesh.visible = false;
        this.active.splice(i, 1);
      } else {
        (tracer.mesh.material as THREE.MeshBasicMaterial).opacity = tracer.remaining / TRACER_LIFETIME;
      }
    }
  }

  private acquire(): THREE.Mesh {
    if (this.pool.length < MAX_TRACERS) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(TRACER_RADIUS, TRACER_RADIUS, 1, 5, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xfff2b0,
          transparent: true,
          opacity: 1,
          depthWrite: false,
        }),
      );
      mesh.visible = false;
      this.scene.add(mesh);
      this.pool.push(mesh);
      return mesh;
    }

    const mesh = this.pool[this.nextIndex];
    this.nextIndex = (this.nextIndex + 1) % MAX_TRACERS;
    return mesh;
  }
}
