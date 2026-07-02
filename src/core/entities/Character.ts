import { Entity, type Vec3 } from "./Entity";
import type { Weapon } from "./weapons/Weapon";

export abstract class Character extends Entity {
  health: number;
  maxHealth: number;
  yaw = 0;
  pitch = 0;
  verticalVelocity = 0;
  grounded = false;
  lastFireHeld = false;
  weapons: Weapon[];
  currentWeaponIndex = 0;

  constructor(id: string, position: Vec3, maxHealth: number, weapons: Weapon[]) {
    super(id, position);
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.weapons = weapons;
  }

  get currentWeapon(): Weapon {
    return this.weapons[this.currentWeaponIndex];
  }
}
