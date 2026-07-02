/**
 * Fixed-timestep accumulator: decouples simulation stepping from the variable render-frame
 * delta. Without this, a single slow/delayed frame (e.g. a backgrounded tab resuming, or a
 * GC pause) can hand the physics step a large dt, which is enough for a fast-moving or
 * just-spawned kinematic character to tunnel through thin geometry in one step before
 * Rapier's shallow-penetration correction has a chance to catch it.
 */
export class FixedTimestepAccumulator {
  private readonly timestep: number;
  private readonly maxCatchUpTime: number;
  private accumulator = 0;

  constructor(timestep: number, maxCatchUpTime: number) {
    this.timestep = timestep;
    this.maxCatchUpTime = maxCatchUpTime;
  }

  /** Invokes `step(timestep)` once per fixed step needed to consume `frameDelta`, capping catch-up. */
  advance(frameDelta: number, step: (dt: number) => void): void {
    this.accumulator = Math.min(this.accumulator + frameDelta, this.maxCatchUpTime);
    while (this.accumulator >= this.timestep) {
      step(this.timestep);
      this.accumulator -= this.timestep;
    }
  }
}
