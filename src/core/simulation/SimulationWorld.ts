import { PhysicsWorld } from "../physics/PhysicsWorld";
import { CharacterController } from "../physics/CharacterController";
import { Player, PLAYER_EYE_HEIGHT } from "../entities/Player";
import type { Character } from "../entities/Character";
import { AICharacter, AI_EYE_HEIGHT, AI_MOVE_SPEED } from "../entities/AICharacter";
import type { PlayerCommand } from "./commands/PlayerCommand";
import { EventBus } from "../EventBus";
import type { IHitscanQuery } from "../physics/raycast/IHitscanQuery";
import { CharacterAwareHitscanQuery } from "../physics/raycast/CharacterAwareHitscanQuery";
import { createWeapon } from "../entities/weapons/Weapon";
import { getWeaponConfig } from "../../data/weapons/weaponTypes";
import {
  createDefaultSessionDefinition,
  type GameSessionDefinition,
} from "../../data/session/GameSessionDefinition";
import {
  cycleFireMode,
  startReload,
  updateFireMode,
  updateReload,
} from "../entities/weapons/FireModeController";
import { resolveShot } from "../entities/weapons/ShotResolver";
import { applySpreadPerShot, decaySpread } from "../entities/weapons/SpreadController";
import { applyRecoilKick, updateRecoilRecovery } from "../entities/weapons/RecoilController";
import { NavMeshService } from "../ai/navigation/NavMeshService";
import { updateBotAI } from "../ai/FSM/botStates";
import type { BotContext } from "../ai/FSM/BotContext";
import { distance, pitchTowards, yawTowards } from "../math/vec3";
import type { Vec3 } from "../entities/Entity";
import {
  CHARACTER_HITBOX_HEIGHT_FRACTION,
  CHARACTER_HITBOX_RADIUS,
  MAX_PLAYER_PITCH,
} from "../../config/constants";

const MOVE_SPEED = 5;
const JUMP_SPEED = 6;
const GRAVITY_Y = -9.81;
const GROUNDED_STICK_VELOCITY = -0.1;

interface BotRig {
  character: AICharacter;
  controller: CharacterController;
  spawn: Vec3;
}

export class SimulationWorld {
  readonly player: Player;
  readonly events = new EventBus();
  private readonly physics: PhysicsWorld;
  private readonly playerController: CharacterController;
  private readonly playerSpawn: Vec3;
  private readonly hitscan: CharacterAwareHitscanQuery;
  private readonly rng: () => number;
  private readonly navMesh: NavMeshService;
  private readonly bots: BotRig[];

  private constructor(
    physics: PhysicsWorld,
    player: Player,
    playerController: CharacterController,
    playerSpawn: Vec3,
    hitscan: CharacterAwareHitscanQuery,
    rng: () => number,
    navMesh: NavMeshService,
    bots: BotRig[],
  ) {
    this.physics = physics;
    this.player = player;
    this.playerController = playerController;
    this.playerSpawn = playerSpawn;
    this.hitscan = hitscan;
    this.rng = rng;
    this.navMesh = navMesh;
    this.bots = bots;

    this.events.on("weaponHit", (hit) => {
      if (!hit.hitEntityId) return;
      const target = this.findCharacter(hit.hitEntityId);
      if (!target || target === this.findCharacter(hit.shooterId)) return;
      const wasAlive = target.health > 0;
      target.health = Math.max(0, target.health - hit.damage);
      if (wasAlive && target.health <= 0) {
        this.events.emit("characterKilled", { killerId: hit.shooterId, victimId: target.id });
      }
      if (target.health <= 0 && target instanceof AICharacter) {
        target.isDead = true;
      }
    });

    for (const { character } of this.bots) {
      this.events.on("noiseEvent", (noise) => {
        if (noise.sourceId === character.id) return;
        if (distance(character.position, noise.position) <= noise.radius) {
          character.heardNoisePosition = { ...noise.position };
          character.heardNoiseTimer = 0;
        }
      });
    }
  }

  static async create(
    hitscan: IHitscanQuery,
    session: GameSessionDefinition = createDefaultSessionDefinition(),
    rng: () => number = Math.random,
  ): Promise<SimulationWorld> {
    const physics = await PhysicsWorld.create();
    for (const volume of session.map.volumes) {
      physics.createStaticCuboid(volume.halfExtents, volume.position, volume.rotation);
    }

    const spawn = session.map.spawnPoints.player;
    const player = new Player("local-player", spawn, createWeapons(session.player.weaponConfigIds));
    const playerController = createHumanoidController(physics, spawn);

    const bots: BotRig[] = session.map.spawnPoints.ai.map((aiSpawn, index) => {
      const botDefinition = session.bots[index] ?? session.bots[0] ?? { weaponConfigIds: [] };
      const character = new AICharacter(
        botDefinition.id ?? `bot-${index}`,
        aiSpawn.position,
        createWeapons(botDefinition.weaponConfigIds),
        aiSpawn.patrolPoints,
      );
      const controller = createHumanoidController(physics, aiSpawn.position);
      return { character, controller, spawn: { ...aiSpawn.position } };
    });

    const navMesh = new NavMeshService(session.map.navMeshRegions);
    const characterAwareHitscan = new CharacterAwareHitscanQuery(hitscan);

    return new SimulationWorld(
      physics,
      player,
      playerController,
      { ...spawn },
      characterAwareHitscan,
      rng,
      navMesh,
      bots,
    );
  }

  get aiCharacters(): readonly AICharacter[] {
    return this.bots.map((rig) => rig.character);
  }

  update(dt: number, commandsByEntityId: ReadonlyMap<string, PlayerCommand>): void {
    const command = commandsByEntityId.get(this.player.id);
    if (command) {
      this.applyPlayerCommand(dt, command);
      this.applyPlayerWeaponCommand(dt, command);
    }

    for (const rig of this.bots) {
      this.updateBot(rig, dt);
    }

    this.physics.step();
  }

  respawnCharacter(entityId: string): void {
    if (entityId === this.player.id) {
      resetCharacter(this.player);
      resetPlayerRecoil(this.player);
      this.player.position = { ...this.playerSpawn };
      this.playerController.teleport(this.playerSpawn);
      return;
    }

    const rig = this.bots.find((bot) => bot.character.id === entityId);
    if (!rig) return;
    resetCharacter(rig.character);
    rig.character.isDead = false;
    rig.character.fsm.resetTo("idle", rig.character);
    rig.character.currentPath = [];
    rig.character.pathTargetIndex = 0;
    rig.character.lastKnownPlayerPosition = null;
    rig.character.heardNoisePosition = null;
    rig.character.timeSinceLastSeenPlayer = Number.POSITIVE_INFINITY;
    rig.character.heardNoiseTimer = Number.POSITIVE_INFINITY;
    rig.character.position = { ...rig.spawn };
    rig.controller.teleport(rig.spawn);
  }

  private applyPlayerCommand(dt: number, command: PlayerCommand): void {
    const player = this.player;

    player.yaw += command.yawDelta;
    player.pitch = clamp(player.pitch + command.pitchDelta, -MAX_PLAYER_PITCH, MAX_PLAYER_PITCH);

    const rawLen = Math.hypot(command.moveX, command.moveZ);
    const scale = rawLen > 1 ? 1 / rawLen : 1;
    const nx = command.moveX * scale;
    const nz = command.moveZ * scale;

    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const worldX = nx * cos - nz * sin;
    const worldZ = -nx * sin - nz * cos;

    applyGroundMovement(
      player,
      this.playerController,
      { x: worldX, z: worldZ },
      dt,
      MOVE_SPEED,
      command.jumpRequested,
    );
  }

  private applyPlayerWeaponCommand(dt: number, command: PlayerCommand): void {
    const player = this.player;
    const weapon = player.currentWeapon;
    const config = getWeaponConfig(weapon.configId);

    if (command.switchFireModeRequested) {
      cycleFireMode(weapon, config);
    }
    if (command.reloadRequested) {
      startReload(weapon, config);
    }

    this.applyWeaponTick(player, dt, command.fireHeld);
  }

  private updateBot(rig: BotRig, dt: number): void {
    const { character, controller } = rig;
    if (character.isDead) return;

    let moveDirection = { x: 0, z: 0 };
    let wantsToFire = false;

    const ctx: BotContext = {
      player: this.player,
      hitscan: this.hitscan,
      events: this.events,
      navMesh: this.navMesh,
      rng: this.rng,
      requestMove: (_bot, direction) => {
        moveDirection = direction;
      },
      faceTowards: (bot, position) => {
        // Use eye position, not feet, as the "from" point - pitch must match where the
        // hitscan ray actually originates (applyWeaponTick), not the ground-anchored transform.
        const eyePosition = { x: bot.position.x, y: bot.position.y + AI_EYE_HEIGHT, z: bot.position.z };
        bot.yaw = yawTowards(eyePosition, position);
        bot.pitch = clamp(pitchTowards(eyePosition, position), -MAX_PLAYER_PITCH, MAX_PLAYER_PITCH);
      },
      requestFire: () => {
        wantsToFire = true;
      },
    };

    updateBotAI(character, ctx, dt);

    applyGroundMovement(character, controller, moveDirection, dt, AI_MOVE_SPEED, false);
    this.applyWeaponTick(character, dt, wantsToFire);
  }

  /** Shared by the player and bots: advances fire-mode timing/reload and resolves a shot if one fired. */
  private applyWeaponTick(character: Character, dt: number, fireHeld: boolean): void {
    const weapon = character.currentWeapon;
    const config = getWeaponConfig(weapon.configId);

    updateReload(weapon, config, dt);
    if (character instanceof AICharacter && weapon.ammoInMag === 0 && weapon.reloadTimer <= 0) {
      // Bots self-manage reloading; only the player needs an explicit reload input.
      startReload(weapon, config);
    }

    const triggerPressedEdge = fireHeld && !character.lastFireHeld;
    character.lastFireHeld = fireHeld;

    const result = updateFireMode(weapon, config, { dt, triggerHeld: fireHeld, triggerPressedEdge });

    if (result.firedShots > 0) {
      // Muzzle climb is authoritative for the player - applied to the actual firing direction
      // (not just the camera) so point of impact follows the visual climb, and cleared by the
      // same recovery spring once the trigger is released.
      if (character instanceof Player) {
        applyRecoilKick(character.recoil, config.recoil, this.rng);
      }

      const eyeHeight = character instanceof Player ? PLAYER_EYE_HEIGHT : AI_EYE_HEIGHT;
      const origin = {
        x: character.position.x,
        y: character.position.y + eyeHeight,
        z: character.position.z,
      };
      const aimYaw = character instanceof Player ? character.yaw + character.recoil.yaw : character.yaw;
      const aimPitch =
        character instanceof Player
          ? clamp(character.pitch + character.recoil.pitch, -MAX_PLAYER_PITCH, MAX_PLAYER_PITCH)
          : character.pitch;

      this.hitscan.setCharacters(this.characterHitboxTargets(character.id));
      resolveShot({
        shooterId: character.id,
        origin,
        yaw: aimYaw,
        pitch: aimPitch,
        weapon,
        config,
        hitscan: this.hitscan,
        events: this.events,
        rng: this.rng,
      });
      applySpreadPerShot(weapon, config);
    } else if (!fireHeld) {
      decaySpread(weapon, config, dt);
    }

    if (character instanceof Player) {
      updateRecoilRecovery(character.recoil, config.recoil, dt, fireHeld);
    }
  }

  private characterHitboxTargets(excludeId: string) {
    const all: Character[] = [this.player, ...this.bots.map((rig) => rig.character)];
    return all
      .filter((c) => c.id !== excludeId && !(c instanceof AICharacter && c.isDead))
      .map((c) => {
        const eyeHeight = c instanceof Player ? PLAYER_EYE_HEIGHT : AI_EYE_HEIGHT;
        return {
          entityId: c.id,
          center: {
            x: c.position.x,
            y: c.position.y + eyeHeight * CHARACTER_HITBOX_HEIGHT_FRACTION,
            z: c.position.z,
          },
          radius: CHARACTER_HITBOX_RADIUS,
        };
      });
  }

  private findCharacter(id: string): Character | undefined {
    if (this.player.id === id) return this.player;
    return this.bots.find((rig) => rig.character.id === id)?.character;
  }
}

function createHumanoidController(physics: PhysicsWorld, spawn: Vec3): CharacterController {
  return new CharacterController(physics, {
    radius: 0.35,
    halfHeight: 0.5,
    spawn,
    maxSlopeClimbRadians: (45 * Math.PI) / 180,
    autoStepMaxHeight: 0.3,
    autoStepMinWidth: 0.2,
    snapToGroundDistance: 0.3,
  });
}

/** Shared by the player and bots: gravity integration + Rapier collision for horizontal movement. */
function applyGroundMovement(
  character: Character,
  controller: CharacterController,
  desiredWorldXZ: { x: number; z: number },
  dt: number,
  moveSpeed: number,
  jumpRequested: boolean,
): void {
  if (controller.isGrounded) {
    character.verticalVelocity = jumpRequested ? JUMP_SPEED : GROUNDED_STICK_VELOCITY;
  } else {
    character.verticalVelocity += GRAVITY_Y * dt;
  }

  const desiredTranslation = {
    x: desiredWorldXZ.x * moveSpeed * dt,
    y: character.verticalVelocity * dt,
    z: desiredWorldXZ.z * moveSpeed * dt,
  };

  character.position = controller.move(desiredTranslation);
  character.grounded = controller.isGrounded;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function createWeapons(configIds: readonly string[]) {
  return configIds.map((id) => createWeapon(getWeaponConfig(id)));
}

function resetCharacter(character: Character): void {
  character.health = character.maxHealth;
  character.verticalVelocity = 0;
  character.grounded = false;
  character.lastFireHeld = false;
  character.pitch = 0;

  for (const weapon of character.weapons) {
    const config = getWeaponConfig(weapon.configId);
    weapon.ammoInMag = config.magazineSize;
    weapon.ammoReserve = config.reserveAmmoMax;
    weapon.currentFireModeIndex = config.defaultFireModeIndex;
    weapon.currentSpread = config.baseSpread;
    weapon.cooldownTimer = 0;
    weapon.reloadTimer = 0;
    weapon.burstState = null;
  }
}

function resetPlayerRecoil(player: Player): void {
  player.recoil.pitch = 0;
  player.recoil.yaw = 0;
  player.recoil.pitchVelocity = 0;
  player.recoil.yawVelocity = 0;
  player.recoil.shotIndex = 0;
}
