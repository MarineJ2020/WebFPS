export const FIXED_TIMESTEP = 1 / 60;
export const MAX_FRAME_DELTA = 0.25;
export const DEFAULT_MOUSE_SENSITIVITY = 0.0022;
export const GUNSHOT_NOISE_RADIUS = 20;
/** Fraction of a character's eye height used for both its hitbox sphere center and where AI aims. */
export const CHARACTER_HITBOX_HEIGHT_FRACTION = 0.55;
export const CHARACTER_HITBOX_RADIUS = 0.45;
/** Shared by SimulationWorld (aim/hitscan) and CameraRig (display) so recoil-punched point of
 * impact can never diverge from what's shown on screen, even at extreme pitch. */
export const MAX_PLAYER_PITCH = Math.PI / 2 - 0.01;

export const CollisionLayer = {
  Static: 0b0001,
  Player: 0b0010,
  AI: 0b0100,
  Projectile: 0b1000,
} as const;
