import * as THREE from "three";
import { buildWeaponClips, type WeaponClipName } from "./WeaponAnimationClips";

const CROSSFADE_SECONDS = 0.145;
const AMBIENT_MIN_DELAY = 4;
const AMBIENT_MAX_DELAY = 10;

/**
 * Drives the AutoRifle.glb "allanims" clips. "ready" is the draw/equip motion, not a loop - it
 * plays once and then holds its last frame as the idle pose (clampWhenFinished). "ambient" is an
 * occasional fidget played from that held pose, returning to it afterwards. One-shot fire/reload
 * clips play on top and hand back to the held idle pose when they finish - except "firelast",
 * which is left holding its own last frame (slide/bolt back) while the magazine is empty, instead
 * of snapping back to the loaded-looking idle pose.
 */
export class ViewmodelAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Record<WeaponClipName, THREE.AnimationAction>;
  private ambientCooldown = randomAmbientDelay();
  private idling = true;
  private readyPlayedOnce = false;
  private magazineEmpty = false;
  private activeOneShot: WeaponClipName | null = null;

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

    if (this.idling && !this.magazineEmpty) {
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

  /** Suppresses the ambient idle fidget and keeps the slide/bolt held back once the mag is dry. */
  setMagazineEmpty(empty: boolean): void {
    this.magazineEmpty = empty;
  }

  dispose(): void {
    this.mixer.removeEventListener("finished", this.onActionFinished);
    this.mixer.stopAllAction();
  }

  private enterIdle(): void {
    this.idling = true;
    const ready = this.actions.ready;
    if (!this.readyPlayedOnce) {
      this.readyPlayedOnce = true;
      ready.reset();
      ready.setLoop(THREE.LoopOnce, 1);
      ready.clampWhenFinished = true;
      ready.fadeIn(CROSSFADE_SECONDS).play();
    } else {
      // Already sitting at its clamped final frame from the first play-through - just restore
      // its blend weight rather than replaying the draw motion from the start every time.
      ready.fadeIn(CROSSFADE_SECONDS);
    }
  }

  private playOnce(name: WeaponClipName): void {
    this.idling = false;
    const action = this.actions[name];

    if (this.activeOneShot === name) {
      // Retriggered faster than the clip's own duration (rapid fire outpacing the "fire" clip
      // length) - just snap its time back to 0 at full weight. Fading it against itself here
      // caused the visible stutter: a partial-weight blend from wherever the previous fade-in
      // had reached, layered under an abrupt time reset.
      action.stopFading();
      action.setEffectiveWeight(1);
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      return;
    }

    for (const other of Object.values(this.actions)) {
      if (other !== action) other.fadeOut(CROSSFADE_SECONDS);
    }
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.fadeIn(CROSSFADE_SECONDS).play();
    this.activeOneShot = name;
  }

  private onActionFinished = (event: { action: THREE.AnimationAction }): void => {
    if (event.action === this.actions.ready) return;
    if (event.action !== this.actions[this.activeOneShot as WeaponClipName]) return;
    this.activeOneShot = null;
    if (event.action === this.actions.firelast && this.magazineEmpty) return;
    this.enterIdle();
  };
}

function randomAmbientDelay(): number {
  return AMBIENT_MIN_DELAY + Math.random() * (AMBIENT_MAX_DELAY - AMBIENT_MIN_DELAY);
}
