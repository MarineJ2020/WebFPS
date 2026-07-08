const LOOK_SWAY_AMOUNT = 0.5;
const LOOK_SWAY_SMOOTHING = 12;
const BOB_STIFFNESS = 180;
const BOB_DAMPING = 16;
const JUMP_KICK = -0.9;
const LAND_KICK = -2.4;

/** Procedural viewmodel sway: gun lags behind mouse-look, and dips on jump/land. */
export class ViewmodelSway {
  private yawOffset = 0;
  private pitchOffset = 0;
  private bobOffset = 0;
  private bobVelocity = 0;
  private wasGrounded = true;

  update(
    dt: number,
    yawDelta: number,
    pitchDelta: number,
    grounded: boolean,
    verticalVelocity: number,
  ): { yaw: number; pitch: number; bob: number } {
    const targetYaw = -yawDelta * LOOK_SWAY_AMOUNT;
    const targetPitch = pitchDelta * LOOK_SWAY_AMOUNT;
    const smoothing = 1 - Math.exp(-LOOK_SWAY_SMOOTHING * dt);
    this.yawOffset += (targetYaw - this.yawOffset) * smoothing;
    this.pitchOffset += (targetPitch - this.pitchOffset) * smoothing;

    if (!grounded && this.wasGrounded && verticalVelocity > 0) this.bobVelocity += JUMP_KICK;
    if (grounded && !this.wasGrounded) this.bobVelocity += LAND_KICK;
    this.wasGrounded = grounded;

    const accel = -BOB_STIFFNESS * this.bobOffset - BOB_DAMPING * this.bobVelocity;
    this.bobVelocity += accel * dt;
    this.bobOffset += this.bobVelocity * dt;

    return { yaw: this.yawOffset, pitch: this.pitchOffset, bob: this.bobOffset };
  }
}
