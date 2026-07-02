export interface PlayerCommand {
  /** Strafe axis, -1 (left) .. 1 (right). */
  moveX: number;
  /** Forward/back axis, -1 (back) .. 1 (forward). */
  moveZ: number;
  /** Raw mouse-look delta accumulated since the last tick, in radians. */
  yawDelta: number;
  pitchDelta: number;
  jumpRequested: boolean;
  /** Continuous state of the fire control, needed by auto fire mode. */
  fireHeld: boolean;
  reloadRequested: boolean;
  switchFireModeRequested: boolean;
}

export function emptyPlayerCommand(): PlayerCommand {
  return {
    moveX: 0,
    moveZ: 0,
    yawDelta: 0,
    pitchDelta: 0,
    jumpRequested: false,
    fireHeld: false,
    reloadRequested: false,
    switchFireModeRequested: false,
  };
}
