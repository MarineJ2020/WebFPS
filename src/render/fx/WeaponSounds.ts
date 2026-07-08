const BASE_PATH = "/Sound/Gun/AutoRifle/";

const CLIPS = {
  shoot: BASE_PATH + "Shoot.wav",
  clipOut: BASE_PATH + "clipout.wav",
  clipIn: BASE_PATH + "clipin.wav",
  slideBack: BASE_PATH + "slideback.wav",
};

const SHOOT_VOLUME = 0.5;
const RELOAD_VOLUME = 0.6;

// --- Individually tunable timing, edit directly here ---
// Fractions of the reload animation's duration at which each mechanical sound lands - there's no
// per-frame event data from the source asset, so these are estimates (mag drops near the start,
// new mag seats partway through, and only an empty reload racks the slide near the end).
const TACTICAL_CLIP_IN_FRACTION = 0.55;
const EMPTY_CLIP_IN_FRACTION = 0.4;
const EMPTY_SLIDE_BACK_FRACTION = 0.85;

// Per-sound fine adjustment in seconds - negative plays it earlier, positive later. Nudge these
// individually while testing instead of the fractions above, which set the rough position.
const SHOOT_OFFSET_SECONDS = 0;
const CLIP_OUT_OFFSET_SECONDS = 0.5;
const CLIP_IN_OFFSET_SECONDS = 0;
const SLIDE_BACK_OFFSET_SECONDS = -0.35;

// Randomizes the shoot sound's playback rate by up to this much each side, so rapid fire doesn't
// sound like the exact same sample looping.
const SHOOT_PITCH_RANDOMNESS = 0.1;

function playSound(url: string, volume: number, playbackRate = 1): void {
  const audio = new Audio(url);
  audio.volume = volume;
  audio.playbackRate = playbackRate;
  void audio.play().catch(() => {});
}

/** Fire-and-forget weapon SFX, including a rough mechanical sequence timed against reload duration. */
export class WeaponSounds {
  private reloadTimers: number[] = [];

  playFire(): void {
    const pitch = 1 + (Math.random() * 2 - 1) * SHOOT_PITCH_RANDOMNESS;
    this.scheduleAfter(SHOOT_OFFSET_SECONDS, () => playSound(CLIPS.shoot, SHOOT_VOLUME, pitch));
  }

  playReload(isEmpty: boolean, durationSeconds: number): void {
    this.clearReloadTimers();
    this.scheduleAfter(CLIP_OUT_OFFSET_SECONDS, () => playSound(CLIPS.clipOut, RELOAD_VOLUME));

    const clipInFraction = isEmpty ? EMPTY_CLIP_IN_FRACTION : TACTICAL_CLIP_IN_FRACTION;
    this.scheduleAfter(durationSeconds * clipInFraction + CLIP_IN_OFFSET_SECONDS, () =>
      playSound(CLIPS.clipIn, RELOAD_VOLUME),
    );

    if (isEmpty) {
      this.scheduleAfter(durationSeconds * EMPTY_SLIDE_BACK_FRACTION + SLIDE_BACK_OFFSET_SECONDS, () =>
        playSound(CLIPS.slideBack, RELOAD_VOLUME),
      );
    }
  }

  dispose(): void {
    this.clearReloadTimers();
  }

  private scheduleAfter(seconds: number, fire: () => void): void {
    this.reloadTimers.push(window.setTimeout(fire, Math.max(0, seconds) * 1000));
  }

  private clearReloadTimers(): void {
    for (const id of this.reloadTimers) window.clearTimeout(id);
    this.reloadTimers = [];
  }
}
