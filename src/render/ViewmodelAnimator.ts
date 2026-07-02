import * as THREE from "three";
import { buildWeaponClips, type WeaponClipName } from "./WeaponAnimationClips";

const CROSSFADE_SECONDS = 0.1;
const AMBIENT_MIN_DELAY = 4;
const AMBIENT_MAX_DELAY = 10;

/**
 * Drives the AutoRifle.glb "allanims" clips: loops "ready" as the idle pose, occasionally
 * cuts to "ambient" for a fidget, and plays one-shot fire/reload clips on demand, always
 * returning to the idle loop when a one-shot finishes.
 */
export class ViewmodelAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<WeaponClipName, THREE.AnimationAction>;
  private ambientCooldown = randomAmbientDelay();
  private idling = true;

  constructor(root: THREE.Object3D, sourceClip: THREE.AnimationClip) {
    this.mixer = new THREE.AnimationMixer(root);
    const clips = buildWeaponClips(sourceClip);
    this.actions = Object.fromEntries(
      (Object.keys(clips) as WeaponClipName[]).map((name) => [name, this.mixer.clipAction(clips[name])]),
    ) as Record<WeaponClipName, THREE.AnimationAction>;

    this.mixer.addEventListener("finished", this.onActionFinished);
    this.enterIdle();
  }

  update(dt: number): void {
    this.mixer.update(dt);

    if (this.idling) {
      this.ambientCooldown -= dt;
      if (this.ambientCooldown <= 0) {
        this.ambientCooldown = randomAmbientDelay();
        this.playOnce("ambient");
      }
    }
  }

  playFire(isLastRound: boolean): void {
    this.playOnce(isLastRound ? "firelast" : "fire");
  }

  playReload(isEmpty: boolean): void {
    this.playOnce(isEmpty ? "reloadB" : "reloadA");
  }

  dispose(): void {
    this.mixer.removeEventListener("finished", this.onActionFinished);
    this.mixer.stopAllAction();
  }

  private enterIdle(): void {
    this.idling = true;
    const ready = this.actions.ready;
    ready.reset();
    ready.setLoop(THREE.LoopRepeat, Infinity);
    ready.fadeIn(CROSSFADE_SECONDS).play();
  }

  private playOnce(name: WeaponClipName): void {
    this.idling = false;
    const action = this.actions[name];
    for (const other of Object.values(this.actions)) {
      if (other !== action) other.fadeOut(CROSSFADE_SECONDS);
    }
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.fadeIn(CROSSFADE_SECONDS).play();
  }

  private onActionFinished = (event: { action: THREE.AnimationAction }): void => {
    if (event.action === this.actions.ready) return;
    this.enterIdle();
  };
}

function randomAmbientDelay(): number {
  return AMBIENT_MIN_DELAY + Math.random() * (AMBIENT_MAX_DELAY - AMBIENT_MIN_DELAY);
}
