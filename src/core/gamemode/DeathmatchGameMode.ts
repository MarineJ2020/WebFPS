import { Character } from "../entities/Character";
import type { Vec3 } from "../entities/Entity";
import { getWeaponConfig } from "../../data/weapons/weaponTypes";
import { getManifestGameMode } from "../../data/manifests/AssetManifest";
import type { LanMatchPhase, LanPickupKind, LanPickupSnapshot } from "../../net/LanProtocol";
import type {
  GameModeKillEvent,
  GameModeRuntime,
  GameModeScore,
  MatchPhaseState,
} from "./GameModeTypes";

const DEFAULT_MODE_ID = "deathmatch";

interface PickupConfig {
  healthDropChance: number;
  healthAmount: number;
  pickupLifetimeSeconds: number;
  pickupRadius: number;
}

export class DeathmatchGameMode implements GameModeRuntime {
  readonly scoreLimit: number;
  readonly timeLimit: number;
  readonly respawnSeconds: number;
  private readonly warmupSeconds: number;
  private readonly countdownSeconds: number;
  private readonly roundEndSeconds: number;
  private readonly rematchSeconds: number;
  private readonly pickupConfig: PickupConfig;
  private readonly rng: () => number;
  private readonly scores = new Map<string, GameModeScore>();
  private readonly names = new Map<string, string>();
  private readonly mutablePickups: LanPickupSnapshot[] = [];
  private readonly rematchVotes = new Set<string>();
  private phase: LanMatchPhase = "warmup";
  private phaseEndsAt = 0;
  private liveEndsAt = 0;
  private winner: string | null = null;

  constructor(options: { now: number; rng?: () => number; gameModeId?: string }) {
    const definition = getManifestGameMode(options.gameModeId ?? DEFAULT_MODE_ID);
    this.scoreLimit = definition.scoreLimit;
    this.timeLimit = definition.timeLimitSeconds;
    this.warmupSeconds = definition.warmupSeconds;
    this.countdownSeconds = definition.countdownSeconds;
    this.roundEndSeconds = definition.roundEndSeconds;
    this.rematchSeconds = definition.rematchSeconds;
    this.respawnSeconds = definition.respawnSeconds;
    this.pickupConfig = definition.pickup;
    this.rng = options.rng ?? Math.random;
    this.phaseEndsAt = options.now + this.warmupSeconds;
  }

  get pickups(): readonly LanPickupSnapshot[] {
    return this.mutablePickups;
  }

  update(now: number, activePlayerIds: readonly string[]): void {
    this.expirePickups(now);
    if (this.phase === "warmup" && now >= this.phaseEndsAt) {
      this.setPhase("countdown", now, this.countdownSeconds);
    } else if (this.phase === "countdown" && now >= this.phaseEndsAt) {
      this.phase = "live";
      this.liveEndsAt = now + this.timeLimit;
      this.phaseEndsAt = this.liveEndsAt;
    } else if (this.phase === "live" && now >= this.liveEndsAt) {
      this.endRound(this.highestScorerName(), now);
    } else if (this.phase === "roundEnd" && now >= this.phaseEndsAt) {
      this.setPhase("rematch", now, this.rematchSeconds);
      this.rematchVotes.clear();
    } else if (this.phase === "rematch" && this.allActivePlayersVoted(activePlayerIds)) {
      this.resetForRematch(now);
    }
  }

  recordKill(event: GameModeKillEvent): void {
    if (this.phase !== "live") return;
    const killer = this.ensureScore(event.killerId);
    const victim = this.ensureScore(event.victimId);
    this.names.set(event.killerId, event.killerName);
    this.names.set(event.victimId, event.victimName);
    if (event.killerId !== event.victimId) killer.kills += 1;
    victim.deaths += 1;

    this.spawnPickup("ammo_box", event.victimPosition, 0, event.now);
    if (this.rng() < this.pickupConfig.healthDropChance) {
      this.spawnPickup("health_pack", event.victimPosition, this.pickupConfig.healthAmount, event.now);
    }

    if (killer.kills >= this.scoreLimit) {
      this.endRound(event.killerName, event.now);
    }
  }

  getScore(entityId: string): GameModeScore {
    const score = this.scores.get(entityId);
    return score ? { ...score } : { kills: 0, deaths: 0 };
  }

  getPhaseState(now: number, activePlayerIds: readonly string[]): MatchPhaseState {
    return {
      phase: this.phase,
      phaseRemaining: Math.max(0, this.phaseEndsAt - now),
      winner: this.winner,
      rematchVotes: this.rematchVotes.size,
      rematchNeeded: Math.max(1, activePlayerIds.length),
    };
  }

  canDealDamage(): boolean {
    return this.phase === "live";
  }

  canMoveAndShoot(): boolean {
    return this.phase === "warmup" || this.phase === "countdown" || this.phase === "live";
  }

  voteRematch(playerId: string): void {
    if (this.phase !== "rematch" && this.phase !== "roundEnd") return;
    this.rematchVotes.add(playerId);
  }

  resetForRematch(now: number): void {
    this.scores.clear();
    this.mutablePickups.length = 0;
    this.rematchVotes.clear();
    this.winner = null;
    this.setPhase("countdown", now, this.countdownSeconds);
  }

  shouldReturnToLobby(now: number): boolean {
    return this.phase === "rematch" && now >= this.phaseEndsAt;
  }

  collectPickups(character: Character, now: number): void {
    if (this.phase !== "live" || character.health <= 0) return;
    for (let i = this.mutablePickups.length - 1; i >= 0; i--) {
      const pickup = this.mutablePickups[i];
      if (pickup.expiresAt <= now || distance(character.position, pickup.position) > this.pickupConfig.pickupRadius) continue;
      if (pickup.kind === "ammo_box") {
        const weapon = character.currentWeapon;
        weapon.ammoReserve = getWeaponConfig(weapon.configId).reserveAmmoMax;
      } else {
        character.health = Math.min(character.maxHealth, character.health + pickup.amount);
      }
      this.mutablePickups.splice(i, 1);
    }
  }

  private ensureScore(entityId: string): GameModeScore {
    let score = this.scores.get(entityId);
    if (!score) {
      score = { kills: 0, deaths: 0 };
      this.scores.set(entityId, score);
    }
    return score;
  }

  private spawnPickup(kind: LanPickupKind, position: Vec3, amount: number, now: number): void {
    this.mutablePickups.push({
      id: `${kind}-${Math.random().toString(36).slice(2, 9)}`,
      kind,
      position: { ...position },
      amount,
      expiresAt: now + this.pickupConfig.pickupLifetimeSeconds,
    });
  }

  private expirePickups(now: number): void {
    for (let i = this.mutablePickups.length - 1; i >= 0; i--) {
      if (this.mutablePickups[i].expiresAt <= now) this.mutablePickups.splice(i, 1);
    }
  }

  private setPhase(phase: LanMatchPhase, now: number, duration: number): void {
    this.phase = phase;
    this.phaseEndsAt = now + duration;
  }

  private endRound(winner: string | null, now: number): void {
    if (this.phase === "roundEnd" || this.phase === "rematch") return;
    this.winner = winner ?? "No winner";
    this.setPhase("roundEnd", now, this.roundEndSeconds);
  }

  private allActivePlayersVoted(activePlayerIds: readonly string[]): boolean {
    return activePlayerIds.length > 0 && activePlayerIds.every((id) => this.rematchVotes.has(id));
  }

  private highestScorerName(): string | null {
    let best: { id: string; kills: number } | null = null;
    for (const [id, score] of this.scores) {
      if (!best || score.kills > best.kills) best = { id, kills: score.kills };
    }
    return best ? this.names.get(best.id) ?? best.id : null;
  }
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
