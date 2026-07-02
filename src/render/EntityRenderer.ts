import * as THREE from "three";
import type { AICharacter } from "../core/entities/AICharacter";
import { getWeaponConfig } from "../data/weapons/weaponTypes";
import { loadModelInstance } from "./GLTFModelCache";

const CAPSULE_RADIUS = 0.35;
const CAPSULE_HEIGHT = 1.7;
const BOT_COLOR = new THREE.Color(0xd6455c);
const BOT_DEAD_COLOR = new THREE.Color(0x555555);

// --- Tunables for attaching the third-person gun model to a bot's "hand" - couldn't be
// visually confirmed from here; nudge if the gun floats away from the capsule or looks
// mis-scaled/rotated. Roughly: forward and to the right of center, chest-height. ---
const GUN_SCALE = 0.01;
const GUN_ROTATION_EULER = new THREE.Euler(0, 0, 0);
const GUN_LOCAL_OFFSET = new THREE.Vector3(0.3, 0.2, 0.2);

/** Renders each AI bot as a primitive capsule (holding its weapon's third-person model), synced to its simulation position each frame. */
export class EntityRenderer {
  private readonly scene: THREE.Scene;
  private readonly meshesById = new Map<string, THREE.Mesh>();
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
        this.attachGunModel(bot, mesh);
      }

      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.copy(bot.isDead ? BOT_DEAD_COLOR : BOT_COLOR);
      mesh.position.set(bot.position.x, bot.position.y + CAPSULE_HEIGHT / 2, bot.position.z);
      mesh.rotation.y = bot.yaw;
    }
  }

  private attachGunModel(bot: AICharacter, mesh: THREE.Mesh): void {
    if (this.gunLoadStarted.has(bot.id)) return;
    this.gunLoadStarted.add(bot.id);

    const modelUrl = getWeaponConfig(bot.currentWeapon.configId).thirdPersonModelUrl;
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
