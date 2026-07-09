import * as THREE from "three";
import type { Vec3 } from "../../core/entities/Entity";

const MAX_PARTICLES = 140;
const BLOOD_LIFETIME = 0.42;
const WALL_LIFETIME = 0.28;
const GRAVITY = -4;

interface ActiveParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  remaining: number;
  lifetime: number;
}

export class ImpactParticles {
  private readonly scene: THREE.Scene;
  private readonly pool: THREE.Mesh[] = [];
  private readonly active: ActiveParticle[] = [];
  private nextIndex = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawnBlood(point: Vec3): void {
    const origin = new THREE.Vector3(point.x, point.y, point.z);
    for (let i = 0; i < 12; i++) {
      const particle = this.acquire(0xb51520, 0.025 + Math.random() * 0.018);
      particle.position.copy(origin);
      const velocity = randomDirection(1.6 + Math.random() * 2.2);
      velocity.y = Math.abs(velocity.y) * 0.45 + 0.25;
      this.activate(particle, velocity, BLOOD_LIFETIME);
    }
  }

  spawnWall(point: Vec3, normal?: Vec3): void {
    const origin = new THREE.Vector3(point.x, point.y, point.z);
    const normalVec = normal
      ? new THREE.Vector3(normal.x, normal.y, normal.z).normalize()
      : new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 9; i++) {
      const particle = this.acquire(Math.random() > 0.45 ? 0xffd166 : 0x9c8f78, 0.014 + Math.random() * 0.014);
      particle.position.copy(origin).addScaledVector(normalVec, 0.035);
      const velocity = normalVec.clone().multiplyScalar(0.8 + Math.random() * 1.6).add(randomDirection(0.65));
      this.activate(particle, velocity, WALL_LIFETIME);
    }
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const particle = this.active[i];
      particle.remaining -= dt;
      if (particle.remaining <= 0) {
        particle.mesh.visible = false;
        this.active.splice(i, 1);
        continue;
      }

      particle.velocity.y += GRAVITY * dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      const alpha = particle.remaining / particle.lifetime;
      particle.mesh.scale.setScalar(alpha);
      (particle.mesh.material as THREE.MeshBasicMaterial).opacity = alpha;
    }
  }

  clear(): void {
    for (const active of this.active) active.mesh.visible = false;
    this.active.length = 0;
  }

  private acquire(color: number, radius: number): THREE.Mesh {
    let mesh: THREE.Mesh;
    if (this.pool.length < MAX_PARTICLES) {
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 5, 4),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 1,
          depthWrite: false,
        }),
      );
      mesh.visible = false;
      this.scene.add(mesh);
      this.pool.push(mesh);
    } else {
      mesh = this.pool[this.nextIndex];
      this.nextIndex = (this.nextIndex + 1) % MAX_PARTICLES;
    }

    const material = mesh.material as THREE.MeshBasicMaterial;
    material.color.setHex(color);
    material.opacity = 1;
    mesh.scale.setScalar(1);
    return mesh;
  }

  private activate(mesh: THREE.Mesh, velocity: THREE.Vector3, lifetime: number): void {
    mesh.visible = true;
    this.active.push({ mesh, velocity, remaining: lifetime, lifetime });
  }
}

function randomDirection(speed: number): THREE.Vector3 {
  const theta = Math.random() * Math.PI * 2;
  const y = Math.random() * 2 - 1;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  return new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius).multiplyScalar(speed);
}
