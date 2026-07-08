import { FixedTimestepAccumulator } from "../core/Clock";
import { FIXED_TIMESTEP, MAX_FRAME_DELTA } from "../config/constants";

export class GameLoop {
  private readonly accumulator = new FixedTimestepAccumulator(FIXED_TIMESTEP, MAX_FRAME_DELTA);
  private lastTime = performance.now();
  private running = false;

  start(frame: (frameDelta: number, stepFixed: (step: (fixedDt: number) => void) => void) => void): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();

    const tick = (now: number) => {
      if (!this.running) return;
      const frameDelta = Math.max(0, (now - this.lastTime) / 1000);
      this.lastTime = now;
      frame(frameDelta, (step) => this.accumulator.advance(frameDelta, step));
      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
  }
}
