import { Character } from "./Character";
import type { Vec3 } from "./Entity";
import type { Weapon } from "./weapons/Weapon";
import { SteeringAgent } from "../ai/navigation/SteeringAgent";
import { BotStateMachine } from "../ai/FSM/BotStateMachine";
import { BOT_STATES } from "../ai/FSM/botStates";

export const AI_MAX_HEALTH = 80;
export const AI_EYE_HEIGHT = 1.5;
export const AI_MOVE_SPEED = 3.2;
export const AI_VIEW_RANGE = 13;
export const AI_FOV_HALF_ANGLE = (45 * Math.PI) / 180;
export const AI_LOW_HEALTH_FRACTION = 0.25;
export const AI_LOSE_SIGHT_GRACE_SECONDS = 2;
export const AI_SEARCH_DURATION_SECONDS = 5;
export const AI_IDLE_DURATION_SECONDS = 1.5;
export const AI_FLEE_SAFE_DISTANCE = 12;
export const AI_ARRIVAL_DISTANCE = 0.75;
/** Delay after first spotting the player before a bot actually opens fire - gives the player
 * a moment to react/take cover instead of getting shot the instant they're seen. */
export const AI_REACTION_DELAY_SECONDS = 0.8;

export class AICharacter extends Character {
  readonly steering = new SteeringAgent(AI_MOVE_SPEED);
  readonly fsm = new BotStateMachine(BOT_STATES, "idle");
  readonly patrolPoints: Vec3[];
  patrolIndex = 0;
  currentPath: Vec3[] = [];
  pathTargetIndex = 0;
  lastKnownPlayerPosition: Vec3 | null = null;
  timeSinceLastSeenPlayer = Number.POSITIVE_INFINITY;
  heardNoisePosition: Vec3 | null = null;
  heardNoiseTimer = Number.POSITIVE_INFINITY;
  stateTimer = 0;
  reactionTimer = 0;
  isDead = false;

  constructor(id: string, position: Vec3, weapons: Weapon[], patrolPoints: Vec3[]) {
    super(id, position, AI_MAX_HEALTH, weapons);
    this.patrolPoints = patrolPoints;
  }
}
