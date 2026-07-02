import { Character } from "./Character";
import type { Vec3 } from "./Entity";
import type { Weapon } from "./weapons/Weapon";
import { createRecoilOffset, type RecoilOffset } from "./weapons/RecoilController";

export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_EYE_HEIGHT = 1.6;

export class Player extends Character {
  /**
   * Authoritative muzzle-climb state (not just cosmetic): added to yaw/pitch for both the
   * camera and the actual hitscan direction, so point of impact follows the visual climb.
   */
  readonly recoil: RecoilOffset = createRecoilOffset();

  constructor(id: string, position: Vec3, weapons: Weapon[]) {
    super(id, position, PLAYER_MAX_HEALTH, weapons);
  }
}
