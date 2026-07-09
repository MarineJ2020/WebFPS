import * as THREE from "three";
import type { AICharacter } from "../core/entities/AICharacter";
import type { Vec3 } from "../core/entities/Entity";
import { getWeaponConfig } from "../data/weapons/weaponTypes";
import type { LanPickupSnapshot, LocalTeam } from "../net/LanProtocol";
import { loadModelInstance } from "./GLTFModelCache";

const CAPSULE_RADIUS = 0.35;
const CAPSULE_HEIGHT = 1.7;
const BOT_COLOR = new THREE.Color(0xd6455c);
const BOT_DEAD_COLOR = new THREE.Color(0x555555);
const TEAM_A_COLOR = new THREE.Color(0x55ff88);
const TEAM_B_COLOR = new THREE.Color(0x55aaff);

export interface RenderableNetworkCharacter {
  id: string;
  name: string;
  team: LocalTeam;
  position: Vec3;
  yaw: number;
  dead: boolean;
  weaponConfigId: string;
}

// --- Tunables for attaching the third-person gun model to a bot's "hand". The first-person
// AutoRifle.glb (same asset family) turned out to need scale 1, not the originally-guessed
// 0.01 - matching that here, since a 0.01 scale rendered the gun as a barely-visible speck.
// Nudge further if the gun floats away from the capsule or looks mis-scaled/rotated. Roughly:
// forward and to the right of center, chest-height. ---
const GUN_SCALE = 1;
const GUN_ROTATION_EULER = new THREE.Euler(0, Math.PI * 0.75, 0);
const GUN_LOCAL_OFFSET = new THREE.Vector3(0.25, 0.1, 0.15);

/** Renders each AI bot as a primitive capsule (holding its weapon's third-person model), synced to its simulation position each frame. */
export class EntityRenderer {
  private readonly scene: THREE.Scene;
  private readonly meshesById = new Map<string, THREE.Mesh>();
  private readonly labelsById = new Map<string, THREE.Sprite>();
  private readonly pickupMeshesById = new Map<string, THREE.Mesh>();
  private readonly gunLoadStarted = new Set<string>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  sync(bots: readonly AICharacter[]): void {
    for (const bot of bots) {
      let mesh = this.meshesById.get(bot.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HEIGHT - CAPSULE_RADIUS * 2, 4, 8),
          new THREE.MeshStandardMaterial({ color: BOT_COLOR }),
        );
        this.scene.add(mesh);
        this.meshesById.set(bot.id, mesh);
        this.attachGunModel(bot.id, bot.currentWeapon.configId, mesh);
      }

      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.copy(bot.isDead ? BOT_DEAD_COLOR : BOT_COLOR);
      mesh.position.set(bot.position.x, bot.position.y + CAPSULE_HEIGHT / 2, bot.position.z);
      mesh.rotation.y = bot.yaw;
    }
  }

  syncNetwork(characters: readonly RenderableNetworkCharacter[]): void {
    const activeIds = new Set(characters.map((character) => character.id));
    for (const [id, mesh] of this.meshesById) {
      if (activeIds.has(id)) continue;
      this.scene.remove(mesh);
      disposeObject3D(mesh);
      this.meshesById.delete(id);
      const label = this.labelsById.get(id);
      if (label) {
        this.scene.remove(label);
        this.labelsById.delete(id);
      }
    }

    for (const character of characters) {
      let mesh = this.meshesById.get(character.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HEIGHT - CAPSULE_RADIUS * 2, 4, 8),
          new THREE.MeshStandardMaterial({ color: character.team === "A" ? TEAM_A_COLOR : TEAM_B_COLOR }),
        );
        this.scene.add(mesh);
        this.meshesById.set(character.id, mesh);
        this.attachGunModel(character.id, character.weaponConfigId, mesh);
      }

      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.copy(character.dead ? BOT_DEAD_COLOR : character.team === "A" ? TEAM_A_COLOR : TEAM_B_COLOR);
      mesh.position.set(character.position.x, character.position.y + CAPSULE_HEIGHT / 2, character.position.z);
      mesh.rotation.y = character.yaw;

      let label = this.labelsById.get(character.id);
      if (!label) {
        label = createNameLabel(character.name);
        this.scene.add(label);
        this.labelsById.set(character.id, label);
      }
      label.position.set(character.position.x, character.position.y + CAPSULE_HEIGHT + 0.45, character.position.z);
    }
  }

  syncPickups(pickups: readonly LanPickupSnapshot[]): void {
    const activeIds = new Set(pickups.map((pickup) => pickup.id));
    for (const [id, mesh] of this.pickupMeshesById) {
      if (activeIds.has(id)) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
      this.pickupMeshesById.delete(id);
    }

    for (const pickup of pickups) {
      let mesh = this.pickupMeshesById.get(pickup.id);
      if (!mesh) {
        mesh = createPickupMesh(pickup.kind);
        this.scene.add(mesh);
        this.pickupMeshesById.set(pickup.id, mesh);
      }
      mesh.position.set(pickup.position.x, pickup.position.y + 0.35, pickup.position.z);
      mesh.rotation.y += 0.035;
    }
  }

  clear(): void {
    for (const mesh of this.meshesById.values()) {
      this.scene.remove(mesh);
      disposeObject3D(mesh);
    }
    this.meshesById.clear();
    for (const mesh of this.pickupMeshesById.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
    this.pickupMeshesById.clear();
    for (const label of this.labelsById.values()) {
      this.scene.remove(label);
    }
    this.labelsById.clear();
    this.gunLoadStarted.clear();
  }

  private attachGunModel(id: string, weaponConfigId: string, mesh: THREE.Mesh): void {
    if (this.gunLoadStarted.has(id)) return;
    this.gunLoadStarted.add(id);

    const modelUrl = getWeaponConfig(weaponConfigId).thirdPersonModelUrl;
    if (!modelUrl) return;

    loadModelInstance(modelUrl).then(({ scene }) => {
      const gunRoot = new THREE.Group();
      gunRoot.scale.setScalar(GUN_SCALE);
      gunRoot.rotation.copy(GUN_ROTATION_EULER);
      gunRoot.position.copy(GUN_LOCAL_OFFSET);
      gunRoot.add(scene);
      mesh.add(gunRoot);
    });
  }
}

function createPickupMesh(kind: LanPickupSnapshot["kind"]): THREE.Mesh {
  const geometry = kind === "ammo_box"
    ? new THREE.BoxGeometry(0.55, 0.28, 0.35)
    : new THREE.IcosahedronGeometry(0.28, 1);
  const material = new THREE.MeshStandardMaterial({
    color: kind === "ammo_box" ? 0xffd166 : 0x62f28f,
    emissive: kind === "ammo_box" ? 0x4a3300 : 0x063f1b,
  });
  return new THREE.Mesh(geometry, material);
}

function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
  });
}

function createNameLabel(name: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = "28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.5, 0.375, 1);
  return sprite;
}
