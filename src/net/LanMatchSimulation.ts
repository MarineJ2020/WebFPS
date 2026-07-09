import { AICharacter, AI_EYE_HEIGHT } from "../core/entities/AICharacter";
import { Character } from "../core/entities/Character";
import type { Vec3 } from "../core/entities/Entity";
import { Player, PLAYER_EYE_HEIGHT } from "../core/entities/Player";
import { EventBus } from "../core/EventBus";
import type { HitResult, IHitscanQuery } from "../core/physics/raycast/IHitscanQuery";
import { CharacterAwareHitscanQuery } from "../core/physics/raycast/CharacterAwareHitscanQuery";
import type { PlayerCommand } from "../core/simulation/commands/PlayerCommand";
import { emptyPlayerCommand } from "../core/simulation/commands/PlayerCommand";
import { MAX_PLAYER_PITCH } from "../config/constants";
import type { MapDefinition, MapVolume } from "../data/maps/MapDefinition";
import { createDefaultSessionDefinition } from "../data/session/GameSessionDefinition";
import { getWeaponConfig, ASSAULT_RIFLE_01, BOT_RIFLE_01 } from "../data/weapons/weaponTypes";
import {
  cycleFireMode,
  startReload,
  updateFireMode,
  updateReload,
} from "../core/entities/weapons/FireModeController";
import { resolveShot } from "../core/entities/weapons/ShotResolver";
import { applySpreadPerShot, decaySpread } from "../core/entities/weapons/SpreadController";
import { createWeapon } from "../core/entities/weapons/Weapon";
import type {
  LanCharacterSnapshot,
  LanKillEvent,
  LanMatchSnapshot,
  LanRoomPlayer,
  LanShotEvent,
  LocalTeam,
} from "./LanProtocol";

const MOVE_SPEED = 5;
const BOT_MOVE_SPEED = 2.6;
const BOT_VIEW_RANGE = 26;
const GRAVITY_Y = -9.81;
const JUMP_SPEED = 6;
const FLOOR_Y = 0.1;
const RESPAWN_SECONDS = 3;
const BOT_REACTION_SECONDS = 0.25;

interface PlayerRig {
  player: Player;
  name: string;
  team: LocalTeam;
  spawn: Vec3;
  command: PlayerCommand;
  kills: number;
  deaths: number;
  dead: boolean;
  respawnAt: number;
}

interface BotRig {
  bot: AICharacter;
  name: string;
  team: LocalTeam;
  spawn: Vec3;
  kills: number;
  deaths: number;
  dead: boolean;
  respawnAt: number;
  reactionTimer: number;
}

export class LanMatchSimulation {
  private readonly roomId: string;
  private readonly events = new EventBus();
  private readonly hitscan: CharacterAwareHitscanQuery;
  private readonly players = new Map<string, PlayerRig>();
  private readonly bots: BotRig[] = [];
  private readonly pendingShots: LanShotEvent[] = [];
  private readonly pendingKills: LanKillEvent[] = [];

  constructor(roomId: string, roomPlayers: readonly LanRoomPlayer[], map = createDefaultSessionDefinition().map) {
    this.roomId = roomId;
    this.hitscan = new CharacterAwareHitscanQuery(new VolumeHitscanQuery(map.volumes));

    const teamSpawnState: Record<LocalTeam, number> = { A: 0, B: 0 };
    for (const player of roomPlayers) {
      const spawn = pickTeamSpawn(map, player.team, teamSpawnState[player.team]++);
      this.players.set(player.id, {
        player: new Player(player.id, spawn, [createWeapon(getWeaponConfig(ASSAULT_RIFLE_01.id))]),
        name: player.name,
        team: player.team,
        spawn,
        command: emptyPlayerCommand(),
        kills: 0,
        deaths: 0,
        dead: false,
        respawnAt: 0,
      });
    }

    this.bots = map.spawnPoints.ai.map((spawn, index) => ({
      bot: new AICharacter(`bot-${index}`, spawn.position, [createWeapon(getWeaponConfig(BOT_RIFLE_01.id))], spawn.patrolPoints),
      name: `Bot ${index + 1}`,
      team: "B",
      spawn: { ...spawn.position },
      kills: 0,
      deaths: 0,
      dead: false,
      respawnAt: 0,
      reactionTimer: BOT_REACTION_SECONDS,
    }));

    this.events.on("weaponFired", (event) => {
      this.pendingShots.push({
        shooterId: event.entityId,
        from: event.origin,
        to: {
          x: event.origin.x + event.direction.x * event.range,
          y: event.origin.y + event.direction.y * event.range,
          z: event.origin.z + event.direction.z * event.range,
        },
      });
    });

    this.events.on("weaponHit", (hit) => this.applyDamage(hit.shooterId, hit.hitEntityId, hit.damage, hit.point));
  }

  get respawnSeconds(): number {
    return RESPAWN_SECONDS;
  }

  setInput(playerId: string, command: PlayerCommand): void {
    const rig = this.players.get(playerId);
    if (!rig) return;
    rig.command = command;
  }

  update(dt: number, now: number): void {
    for (const rig of this.players.values()) {
      if (rig.dead) {
        if (now >= rig.respawnAt) this.respawnPlayer(rig);
        continue;
      }
      this.updatePlayer(rig, dt);
    }

    for (const rig of this.bots) {
      if (rig.dead) {
        if (now >= rig.respawnAt) this.respawnBot(rig);
        continue;
      }
      this.updateBot(rig, dt);
    }
  }

  snapshot(now: number): LanMatchSnapshot {
    const shots = this.pendingShots.splice(0);
    const kills = this.pendingKills.splice(0);
    return {
      roomId: this.roomId,
      serverTime: now,
      players: [...this.players.values()].map((rig) => this.snapshotRig(rig, now)),
      bots: this.bots.map((rig) => this.snapshotRig(rig, now)),
      shots,
      kills,
    };
  }

  private updatePlayer(rig: PlayerRig, dt: number): void {
    const command = rig.command;
    const player = rig.player;
    player.yaw += command.yawDelta;
    player.pitch = clamp(player.pitch + command.pitchDelta, -MAX_PLAYER_PITCH, MAX_PLAYER_PITCH);

    moveCharacter(player, command.moveX, command.moveZ, command.jumpRequested, dt, MOVE_SPEED);

    const weapon = player.currentWeapon;
    const config = getWeaponConfig(weapon.configId);
    if (command.switchFireModeRequested) cycleFireMode(weapon, config);
    if (command.reloadRequested) startReload(weapon, config);
    this.updateWeapon(player, dt, command.fireHeld);

    rig.command = emptyPlayerCommand();
  }

  private updateBot(rig: BotRig, dt: number): void {
    const target = this.closestAliveEnemy(rig.team, rig.bot.position);
    if (!target) return;

    rig.bot.yaw = yawTowards(rig.bot.position, target.position);
    rig.bot.pitch = pitchTowards({ x: rig.bot.position.x, y: rig.bot.position.y + AI_EYE_HEIGHT, z: rig.bot.position.z }, {
      x: target.position.x,
      y: target.position.y + PLAYER_EYE_HEIGHT * 0.6,
      z: target.position.z,
    });

    const distanceToTarget = distance(rig.bot.position, target.position);
    if (distanceToTarget > 9) {
      const forward = directionTo(rig.bot.position, target.position);
      moveCharacter(rig.bot, forward.x, forward.z, false, dt, BOT_MOVE_SPEED);
    }

    const canFire = distanceToTarget <= BOT_VIEW_RANGE && this.hasLineOfSight(rig.bot, target);
    if (canFire && rig.reactionTimer > 0) rig.reactionTimer -= dt;
    this.updateWeapon(rig.bot, dt, canFire && rig.reactionTimer <= 0);
  }

  private updateWeapon(character: Character, dt: number, fireHeld: boolean): void {
    const weapon = character.currentWeapon;
    const config = getWeaponConfig(weapon.configId);
    updateReload(weapon, config, dt);

    if (character instanceof AICharacter && weapon.ammoInMag === 0 && weapon.reloadTimer <= 0) {
      startReload(weapon, config);
    }

    const triggerPressedEdge = fireHeld && !character.lastFireHeld;
    character.lastFireHeld = fireHeld;
    const result = updateFireMode(weapon, config, { dt, triggerHeld: fireHeld, triggerPressedEdge });

    if (result.firedShots > 0) {
      const eyeHeight = character instanceof Player ? PLAYER_EYE_HEIGHT : AI_EYE_HEIGHT;
      const origin = {
        x: character.position.x,
        y: character.position.y + eyeHeight,
        z: character.position.z,
      };
      this.hitscan.setCharacters(this.characterHitboxTargets(character.id, this.teamFor(character.id)));
      resolveShot({
        shooterId: character.id,
        origin,
        yaw: character.yaw,
        pitch: character.pitch,
        weapon,
        config,
        hitscan: this.hitscan,
        events: this.events,
        rng: Math.random,
      });
      applySpreadPerShot(weapon, config);
    } else if (!fireHeld) {
      decaySpread(weapon, config, dt);
    }
  }

  private applyDamage(shooterId: string, targetId: string | undefined, damage: number, point: Vec3): void {
    if (!targetId) {
      const pending = this.pendingShots.at(-1);
      if (pending && pending.shooterId === shooterId) pending.to = point;
      return;
    }

    const target = this.findRig(targetId);
    const shooter = this.findRig(shooterId);
    if (!target || !shooter || target.dead || target.team === shooter.team) return;

    target.character.health = Math.max(0, target.character.health - damage);
    const pending = this.pendingShots.at(-1);
    if (pending && pending.shooterId === shooterId) pending.to = point;

    if (target.character.health > 0) return;

    target.dead = true;
    target.respawnAt = performanceNowSeconds() + RESPAWN_SECONDS;
    target.deaths += 1;
    shooter.kills += 1;
    if (target.character instanceof AICharacter) target.character.isDead = true;

    this.pendingKills.push({
      killerId: shooterId,
      victimId: targetId,
      killerName: shooter.name,
      victimName: target.name,
    });
  }

  private respawnPlayer(rig: PlayerRig): void {
    resetCharacter(rig.player);
    rig.player.position = { ...rig.spawn };
    rig.dead = false;
    rig.respawnAt = 0;
  }

  private respawnBot(rig: BotRig): void {
    resetCharacter(rig.bot);
    rig.bot.position = { ...rig.spawn };
    rig.bot.isDead = false;
    rig.dead = false;
    rig.respawnAt = 0;
    rig.reactionTimer = BOT_REACTION_SECONDS;
  }

  private closestAliveEnemy(team: LocalTeam, from: Vec3): Character | null {
    let closest: Character | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const rig of this.players.values()) {
      if (rig.team === team || rig.dead) continue;
      const nextDistance = distance(from, rig.player.position);
      if (nextDistance < closestDistance) {
        closest = rig.player;
        closestDistance = nextDistance;
      }
    }
    return closest;
  }

  private hasLineOfSight(bot: AICharacter, target: Character): boolean {
    const origin = { x: bot.position.x, y: bot.position.y + AI_EYE_HEIGHT, z: bot.position.z };
    const targetPoint = { x: target.position.x, y: target.position.y + PLAYER_EYE_HEIGHT * 0.6, z: target.position.z };
    const direction = directionTo(origin, targetPoint);
    const hit = this.hitscan.castRay(origin, direction, distance(origin, targetPoint));
    return !hit || hit.hitEntityId === target.id;
  }

  private characterHitboxTargets(excludeId: string, shooterTeam: LocalTeam | null) {
    const targets: Array<{ entityId: string; center: Vec3; radius: number }> = [];
    for (const rig of this.players.values()) {
      if (rig.player.id === excludeId || rig.dead || rig.team === shooterTeam) continue;
      targets.push({
        entityId: rig.player.id,
        center: { x: rig.player.position.x, y: rig.player.position.y + PLAYER_EYE_HEIGHT * 0.6, z: rig.player.position.z },
        radius: 0.35,
      });
    }
    for (const rig of this.bots) {
      if (rig.bot.id === excludeId || rig.dead || rig.team === shooterTeam) continue;
      targets.push({
        entityId: rig.bot.id,
        center: { x: rig.bot.position.x, y: rig.bot.position.y + AI_EYE_HEIGHT * 0.6, z: rig.bot.position.z },
        radius: 0.35,
      });
    }
    return targets;
  }

  private teamFor(entityId: string): LocalTeam | null {
    const player = this.players.get(entityId);
    if (player) return player.team;
    return this.bots.find((rig) => rig.bot.id === entityId)?.team ?? null;
  }

  private findRig(entityId: string): {
    character: Character;
    name: string;
    team: LocalTeam;
    kills: number;
    deaths: number;
    dead: boolean;
    respawnAt: number;
  } | null {
    const player = this.players.get(entityId);
    if (player) {
      return {
        get character() { return player.player; },
        get name() { return player.name; },
        get team() { return player.team; },
        get kills() { return player.kills; },
        set kills(value) { player.kills = value; },
        get deaths() { return player.deaths; },
        set deaths(value) { player.deaths = value; },
        get dead() { return player.dead; },
        set dead(value) { player.dead = value; },
        get respawnAt() { return player.respawnAt; },
        set respawnAt(value) { player.respawnAt = value; },
      };
    }

    const bot = this.bots.find((rig) => rig.bot.id === entityId);
    if (!bot) return null;
    return {
      get character() { return bot.bot; },
      get name() { return bot.name; },
      get team() { return bot.team; },
      get kills() { return bot.kills; },
      set kills(value) { bot.kills = value; },
      get deaths() { return bot.deaths; },
      set deaths(value) { bot.deaths = value; },
      get dead() { return bot.dead; },
      set dead(value) { bot.dead = value; },
      get respawnAt() { return bot.respawnAt; },
      set respawnAt(value) { bot.respawnAt = value; },
    };
  }

  private snapshotRig(rig: PlayerRig | BotRig, now: number): LanCharacterSnapshot {
    const character = "player" in rig ? rig.player : rig.bot;
    const weapon = character.currentWeapon;
    const config = getWeaponConfig(weapon.configId);
    const fireMode = config.fireModes[weapon.currentFireModeIndex];
    return {
      id: character.id,
      name: rig.name,
      team: rig.team,
      position: { ...character.position },
      yaw: character.yaw,
      pitch: character.pitch,
      health: character.health,
      maxHealth: character.maxHealth,
      dead: rig.dead,
      respawnRemaining: rig.dead ? Math.max(0, rig.respawnAt - now) : 0,
      kills: rig.kills,
      deaths: rig.deaths,
      weapon: {
        configId: weapon.configId,
        ammoInMag: weapon.ammoInMag,
        ammoReserve: weapon.ammoReserve,
        reloadTimer: weapon.reloadTimer,
        fireModeKind: fireMode.kind,
      },
      kind: "player" in rig ? "player" : "bot",
    };
  }
}

class VolumeHitscanQuery implements IHitscanQuery {
  private readonly volumes: readonly MapVolume[];

  constructor(volumes: readonly MapVolume[]) {
    this.volumes = volumes;
  }

  castRay(origin: Vec3, direction: Vec3, maxDistance: number): HitResult | null {
    let closest: HitResult | null = null;
    for (const volume of this.volumes) {
      const hit = intersectAabb(origin, direction, volume, maxDistance);
      if (hit && (!closest || hit.distance < closest.distance)) closest = hit;
    }
    return closest;
  }
}

function intersectAabb(origin: Vec3, direction: Vec3, volume: MapVolume, maxDistance: number): HitResult | null {
  if (volume.rotation) return null;
  const min = {
    x: volume.position.x - volume.halfExtents.x,
    y: volume.position.y - volume.halfExtents.y,
    z: volume.position.z - volume.halfExtents.z,
  };
  const max = {
    x: volume.position.x + volume.halfExtents.x,
    y: volume.position.y + volume.halfExtents.y,
    z: volume.position.z + volume.halfExtents.z,
  };

  let tMin = 0;
  let tMax = maxDistance;
  for (const axis of ["x", "y", "z"] as const) {
    const component = direction[axis];
    if (Math.abs(component) < 0.00001) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return null;
      continue;
    }
    const inv = 1 / component;
    let near = (min[axis] - origin[axis]) * inv;
    let far = (max[axis] - origin[axis]) * inv;
    if (near > far) [near, far] = [far, near];
    tMin = Math.max(tMin, near);
    tMax = Math.min(tMax, far);
    if (tMin > tMax) return null;
  }

  return {
    distance: tMin,
    point: {
      x: origin.x + direction.x * tMin,
      y: origin.y + direction.y * tMin,
      z: origin.z + direction.z * tMin,
    },
  };
}

function pickTeamSpawn(map: MapDefinition, team: LocalTeam, index: number): Vec3 {
  const points = map.spawnPoints.points?.filter((point) => point.kind === "player" && point.team === team && point.enabled !== false && point.hidden !== true) ?? [];
  const point = points[index % Math.max(1, points.length)];
  if (point) return { ...point.position };

  const offset = team === "A" ? index : index + 4;
  return {
    x: map.spawnPoints.player.x + (offset % 4) * 1.2,
    y: map.spawnPoints.player.y,
    z: map.spawnPoints.player.z + Math.floor(offset / 4) * 1.2,
  };
}

function moveCharacter(character: Character, moveX: number, moveZ: number, jumpRequested: boolean, dt: number, speed: number): void {
  const rawLen = Math.hypot(moveX, moveZ);
  const scale = rawLen > 1 ? 1 / rawLen : 1;
  const nx = moveX * scale;
  const nz = moveZ * scale;
  const sin = Math.sin(character.yaw);
  const cos = Math.cos(character.yaw);
  const worldX = nx * cos - nz * sin;
  const worldZ = -nx * sin - nz * cos;

  if (character.grounded && jumpRequested) {
    character.verticalVelocity = JUMP_SPEED;
    character.grounded = false;
  } else if (!character.grounded) {
    character.verticalVelocity += GRAVITY_Y * dt;
  }

  character.position.x += worldX * speed * dt;
  character.position.y += character.verticalVelocity * dt;
  character.position.z += worldZ * speed * dt;

  if (character.position.y <= FLOOR_Y) {
    character.position.y = FLOOR_Y;
    character.verticalVelocity = 0;
    character.grounded = true;
  }
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

function yawTowards(from: Vec3, to: Vec3): number {
  return Math.atan2(from.x - to.x, from.z - to.z);
}

function pitchTowards(from: Vec3, to: Vec3): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return clamp(Math.atan2(dy, Math.hypot(dx, dz)), -MAX_PLAYER_PITCH, MAX_PLAYER_PITCH);
}

function directionTo(from: Vec3, to: Vec3): Vec3 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / length, y: dy / length, z: dz / length };
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function performanceNowSeconds(): number {
  return performance.now() / 1000;
}
