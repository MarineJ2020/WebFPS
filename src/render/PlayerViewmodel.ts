import * as THREE from "three";
import type { WeaponConfig } from "../data/weapons/weaponTypes";
import { MuzzleFlash } from "./fx/MuzzleFlash";
import { loadModelInstance } from "./GLTFModelCache";
import { ViewmodelAnimator } from "./ViewmodelAnimator";
import { ViewmodelSway } from "./ViewmodelSway";
import { WeaponSounds } from "./fx/WeaponSounds";
import { clipDurationSeconds } from "./WeaponAnimationClips";

// Kept close to center-bottom (rather than far bottom-right) so it stays in frame across both
// narrow and wide aspect ratios, since THREE's horizontal FOV shrinks with a narrower viewport.
// z is far enough that the model's near face clears the camera's near clip plane (0.1) with
// margin - sitting exactly on it caused intermittent clipping.
const VIEWMODEL_OFFSET = new THREE.Vector3(0.0, -0.0, -0.0);

// --- Tunables for the real AutoRifle.glb model - the source asset's exported scale/orientation
// couldn't be visually confirmed from here; nudge these if the gun looks mis-scaled, sideways,
// or the muzzle flash/tracers don't originate from the barrel tip. ---
const MODEL_SCALE = 1;
const MODEL_ROTATION_EULER = new THREE.Euler(0, 90+45, 0);
const MODEL_LOCAL_OFFSET = new THREE.Vector3(0.2, -0.2, -0.2);
const MUZZLE_LOCAL_OFFSET = new THREE.Vector3(0, 0, -0.6);
const VIEWMODEL_ENV_INTENSITY = 2.2;

/** Placeholder-primitive or real animated gun, rendered in a separate first-person scene so world geometry cannot clip it. */
export class PlayerViewmodel {
  private readonly group = new THREE.Group();
  private readonly muzzleFlash = new MuzzleFlash();
  private readonly sway = new ViewmodelSway();
  private readonly sounds = new WeaponSounds();
  private modelRoot: THREE.Object3D | null = null;
  private animator: ViewmodelAnimator | null = null;
  private currentConfigId: string | null = null;
  private loadToken = 0;

  constructor(scene: THREE.Scene) {
    this.group.position.copy(VIEWMODEL_OFFSET);
    scene.add(this.group);
    this.group.add(this.muzzleFlash.object);
  }

  /** Returns the muzzle's current world position, e.g. as a tracer origin. */
  getMuzzleWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.muzzleFlash.object.getWorldPosition(target);
  }

  async setWeapon(config: WeaponConfig): Promise<void> {
    if (this.currentConfigId === config.id) return;
    this.currentConfigId = config.id;
    const token = ++this.loadToken;

    this.clearModel();

    if (config.firstPersonModelUrl) {
      const { scene, animations } = await loadModelInstance(config.firstPersonModelUrl);
      if (token !== this.loadToken) return; // a newer setWeapon call superseded this one

      applyViewmodelMaterialLighting(scene);

      const modelRoot = new THREE.Group();
      modelRoot.scale.setScalar(MODEL_SCALE);
      modelRoot.rotation.copy(MODEL_ROTATION_EULER);
      modelRoot.position.copy(MODEL_LOCAL_OFFSET);
      modelRoot.add(scene);
      this.group.add(modelRoot);
      this.modelRoot = modelRoot;

      const sourceClip = animations.find((clip) => clip.name === "allanims") ?? animations[0];
      if (sourceClip) {
        this.animator = new ViewmodelAnimator(scene, sourceClip);
      }

      this.muzzleFlash.object.position.copy(MUZZLE_LOCAL_OFFSET);
      return;
    }

    const primitive = config.viewmodel;
    if (!primitive) return;

    const [width, height, length] = primitive.scale;
    let geometry: THREE.BufferGeometry;
    if (primitive.primitiveShape === "cylinder") {
      geometry = new THREE.CylinderGeometry(width / 2, width / 2, length, 12);
      geometry.rotateX(Math.PI / 2); // cylinder's default axis is Y; a gun barrel points along local Z
    } else {
      geometry = new THREE.BoxGeometry(width, height, length);
    }

    const material = new THREE.MeshStandardMaterial({ color: primitive.color });
    const mesh = new THREE.Mesh(geometry, material);
    this.group.add(mesh);
    this.modelRoot = mesh;

    this.muzzleFlash.object.position.set(0, 0, -length / 2);
  }

  /** `isLastRound` should reflect ammo remaining *after* this shot. */
  playFireEffect(isLastRound: boolean): void {
    this.muzzleFlash.trigger();
    this.animator?.playFire(isLastRound);
    this.sounds.playFire();
  }

  playReloadEffect(isEmpty: boolean): void {
    this.animator?.playReload(isEmpty);
    const duration = clipDurationSeconds(isEmpty ? "reloadB" : "reloadA");
    this.sounds.playReload(isEmpty, duration);
  }

  /** Suppresses the idle fidget and keeps the slide/bolt held back while the mag is dry. */
  setMagazineEmpty(empty: boolean): void {
    this.animator?.setMagazineEmpty(empty);
  }

  update(
    dt: number,
    yawDelta: number,
    pitchDelta: number,
    grounded: boolean,
    verticalVelocity: number,
  ): void {
    this.muzzleFlash.update(dt);
    this.animator?.update(dt);

    const { yaw, pitch, bob } = this.sway.update(dt, yawDelta, pitchDelta, grounded, verticalVelocity);
    this.group.rotation.set(pitch, yaw, 0);
    this.group.position.set(VIEWMODEL_OFFSET.x, VIEWMODEL_OFFSET.y + bob, VIEWMODEL_OFFSET.z);
  }

  private clearModel(): void {
    this.animator?.dispose();
    this.animator = null;

    if (this.modelRoot) {
      this.group.remove(this.modelRoot);
      disposeObject3D(this.modelRoot);
      this.modelRoot = null;
    }
  }
}

function applyViewmodelMaterialLighting(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
        material.envMapIntensity = Math.max(material.envMapIntensity, VIEWMODEL_ENV_INTENSITY);
        material.needsUpdate = true;
      }
    }
  });
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
