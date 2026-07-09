import * as THREE from "three";
import type { Vec3 } from "../../core/entities/Entity";

const GUN_BASE_PATH = "/Sound/Gun/AutoRifle/";
const CLIPS = {
  shoot: GUN_BASE_PATH + "Shoot.wav",
  wallImpact: GUN_BASE_PATH + "slideback.wav",
  characterImpact: GUN_BASE_PATH + "clipin.wav",
};

const MAX_VOICES = 18;
const SHOOT_VOLUME = 0.42;
const IMPACT_VOLUME = 0.2;
const REF_DISTANCE = 4;
const MAX_DISTANCE = 55;
const ROLLOFF = 1.35;
const PITCH_RANDOMNESS = 0.08;

interface QueuedSound {
  url: string;
  position: Vec3;
  volume: number;
  playbackRate: number;
}

export class WorldAudio {
  private readonly scene: THREE.Scene;
  private readonly listener = new THREE.AudioListener();
  private readonly loader = new THREE.AudioLoader();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly pendingLoads = new Map<string, Promise<AudioBuffer>>();
  private readonly voices: THREE.PositionalAudio[] = [];
  private readonly queued: QueuedSound[] = [];
  private nextVoice = 0;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    this.scene = scene;
    camera.add(this.listener);
  }

  playShot(position: Vec3): void {
    const pitch = 1 + (Math.random() * 2 - 1) * PITCH_RANDOMNESS;
    this.play(CLIPS.shoot, position, SHOOT_VOLUME, pitch);
  }

  playImpact(position: Vec3, kind: "world" | "character"): void {
    this.play(kind === "character" ? CLIPS.characterImpact : CLIPS.wallImpact, position, IMPACT_VOLUME, 1);
  }

  update(): void {
    for (let i = this.queued.length - 1; i >= 0; i--) {
      const sound = this.queued[i];
      if (!this.buffers.has(sound.url)) continue;
      this.queued.splice(i, 1);
      this.play(sound.url, sound.position, sound.volume, sound.playbackRate);
    }
  }

  dispose(): void {
    for (const voice of this.voices) {
      voice.stop();
      this.scene.remove(voice);
      voice.disconnect();
    }
    this.voices.length = 0;
    this.listener.parent?.remove(this.listener);
    this.queued.length = 0;
  }

  private play(url: string, position: Vec3, volume: number, playbackRate: number): void {
    const buffer = this.buffers.get(url);
    if (!buffer) {
      this.queueLoad(url);
      this.queued.push({ url, position: { ...position }, volume, playbackRate });
      return;
    }

    const voice = this.acquireVoice();
    if (voice.isPlaying) voice.stop();
    voice.position.set(position.x, position.y, position.z);
    voice.setBuffer(buffer);
    voice.setVolume(volume);
    voice.setPlaybackRate(playbackRate);
    voice.setRefDistance(REF_DISTANCE);
    voice.setMaxDistance(MAX_DISTANCE);
    voice.setRolloffFactor(ROLLOFF);
    voice.setDistanceModel("inverse");
    voice.play();
  }

  private acquireVoice(): THREE.PositionalAudio {
    if (this.voices.length < MAX_VOICES) {
      const voice = new THREE.PositionalAudio(this.listener);
      this.scene.add(voice);
      this.voices.push(voice);
      return voice;
    }

    const voice = this.voices[this.nextVoice];
    this.nextVoice = (this.nextVoice + 1) % MAX_VOICES;
    return voice;
  }

  private queueLoad(url: string): void {
    if (this.pendingLoads.has(url)) return;
    const pending = this.loader.loadAsync(url).then((buffer) => {
      this.buffers.set(url, buffer);
      this.pendingLoads.delete(url);
      return buffer;
    });
    this.pendingLoads.set(url, pending);
  }
}
