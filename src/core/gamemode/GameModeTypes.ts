import type { Vec3 } from "../entities/Entity";
import type { LocalTeam, LanMatchPhase, LanPickupSnapshot } from "../../net/LanProtocol";

export interface GameModeDefinition {
  id: string;
  displayName: string;
  scoreLimit: number;
  timeLimitSeconds: number;
  warmupSeconds: number;
  countdownSeconds: number;
  roundEndSeconds: number;
  rematchSeconds: number;
  respawnSeconds: number;
}

export interface MatchPhaseState {
  phase: LanMatchPhase;
  phaseRemaining: number;
  winner: string | null;
  rematchVotes: number;
  rematchNeeded: number;
}

export interface GameModeScore {
  kills: number;
  deaths: number;
}

export interface GameModeKillEvent {
  killerId: string;
  killerName: string;
  killerTeam: LocalTeam;
  victimId: string;
  victimName: string;
  victimTeam: LocalTeam;
  victimPosition: Vec3;
  now: number;
}

export interface GameModeRuntime {
  readonly scoreLimit: number;
  readonly timeLimit: number;
  readonly respawnSeconds: number;
  readonly pickups: readonly LanPickupSnapshot[];
  update(now: number, activePlayerIds: readonly string[]): void;
  recordKill(event: GameModeKillEvent): void;
  getScore(entityId: string): GameModeScore;
  getPhaseState(now: number, activePlayerIds: readonly string[]): MatchPhaseState;
  canDealDamage(): boolean;
  canMoveAndShoot(): boolean;
  voteRematch(playerId: string): void;
  resetForRematch(now: number): void;
  shouldReturnToLobby(now: number): boolean;
}
