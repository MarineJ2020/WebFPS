import type { BotState, BotStateName } from "./BotStateMachine";
import type { AICharacter } from "../../entities/AICharacter";
import type { BotContext } from "./BotContext";
import { canSeeTarget } from "../Perception";
import { distance } from "../../math/vec3";
import {
  AI_ARRIVAL_DISTANCE,
  AI_EYE_HEIGHT,
  AI_FLEE_SAFE_DISTANCE,
  AI_FOV_HALF_ANGLE,
  AI_IDLE_DURATION_SECONDS,
  AI_LOSE_SIGHT_GRACE_SECONDS,
  AI_LOW_HEALTH_FRACTION,
  AI_REACTION_DELAY_SECONDS,
  AI_SEARCH_DURATION_SECONDS,
  AI_VIEW_RANGE,
} from "../../entities/AICharacter";
import { PLAYER_EYE_HEIGHT } from "../../entities/Player";
import { getWeaponConfig } from "../../../data/weapons/weaponTypes";
import { CHARACTER_HITBOX_HEIGHT_FRACTION } from "../../../config/constants";

function eyePosition(bot: AICharacter) {
  return { x: bot.position.x, y: bot.position.y + AI_EYE_HEIGHT, z: bot.position.z };
}

export function botCanSeePlayer(bot: AICharacter, ctx: BotContext): boolean {
  return canSeeTarget(
    eyePosition(bot),
    bot.yaw,
    ctx.player.position,
    PLAYER_EYE_HEIGHT,
    { viewRange: AI_VIEW_RANGE, fovHalfAngleRadians: AI_FOV_HALF_ANGLE, eyeHeight: AI_EYE_HEIGHT },
    ctx.hitscan,
  );
}

/** Recomputes a navmesh path if needed and steers the bot along it. Returns true once the target is reached. */
function pursuePosition(
  bot: AICharacter,
  ctx: BotContext,
  target: { x: number; y: number; z: number },
): boolean {
  const finalWaypoint = bot.currentPath[bot.currentPath.length - 1];
  const needsNewPath =
    bot.currentPath.length === 0 || !finalWaypoint || distance(finalWaypoint, target) > AI_ARRIVAL_DISTANCE;

  if (needsNewPath) {
    bot.currentPath = ctx.navMesh.findPath(bot.position, target);
    bot.pathTargetIndex = 0;
  }

  if (bot.currentPath.length === 0) return true; // unreachable; don't spin forever

  const nextWaypoint = bot.currentPath[bot.pathTargetIndex];
  if (!nextWaypoint) return true;

  if (distance(bot.position, nextWaypoint) < AI_ARRIVAL_DISTANCE) {
    bot.pathTargetIndex += 1;
    if (bot.pathTargetIndex >= bot.currentPath.length) return true;
  }

  bot.steering.syncPosition(bot.position);
  const direction = bot.steering.followPathDirection(bot.currentPath.slice(bot.pathTargetIndex));
  ctx.requestMove(bot, direction);
  // Target y = own eye height so the look pitch stays level while walking (faceTowards
  // measures from eye position, so matching y here keeps pitch at 0 instead of tilting down).
  ctx.faceTowards(bot, {
    x: bot.position.x + direction.x,
    y: bot.position.y + AI_EYE_HEIGHT,
    z: bot.position.z + direction.z,
  });
  return false;
}

const IdleState: BotState = {
  name: "idle",
  enter(bot) {
    bot.stateTimer = AI_IDLE_DURATION_SECONDS;
  },
  execute(bot, ctx, dt) {
    bot.stateTimer -= dt;
    if (bot.stateTimer <= 0 || bot.patrolPoints.length > 0) {
      bot.fsm.changeTo("patrol", bot, ctx);
    }
  },
};

const PatrolState: BotState = {
  name: "patrol",
  execute(bot, ctx) {
    if (bot.patrolPoints.length === 0) return;

    const target = bot.patrolPoints[bot.patrolIndex];
    const arrived = pursuePosition(bot, ctx, target);
    if (arrived) {
      bot.patrolIndex = (bot.patrolIndex + 1) % bot.patrolPoints.length;
      bot.currentPath = [];
    }

    if (bot.heardNoisePosition && bot.heardNoiseTimer < 0.5) {
      bot.lastKnownPlayerPosition = bot.heardNoisePosition;
      bot.fsm.changeTo("search", bot, ctx);
    }
  },
};

const SearchState: BotState = {
  name: "search",
  enter(bot) {
    bot.stateTimer = AI_SEARCH_DURATION_SECONDS;
    bot.currentPath = [];
  },
  execute(bot, ctx, dt) {
    if (!bot.lastKnownPlayerPosition) {
      bot.fsm.changeTo("patrol", bot, ctx);
      return;
    }

    const arrived = pursuePosition(bot, ctx, bot.lastKnownPlayerPosition);
    if (arrived) {
      bot.stateTimer -= dt;
      if (bot.stateTimer <= 0) {
        bot.lastKnownPlayerPosition = null;
        bot.fsm.changeTo("patrol", bot, ctx);
      }
    }
  },
};

const AttackState: BotState = {
  name: "attack",
  enter(bot) {
    bot.reactionTimer = AI_REACTION_DELAY_SECONDS;
  },
  execute(bot, ctx, dt) {
    const target = ctx.player.position;
    // Aim at the same height used for the player's hitbox sphere (SimulationWorld), not the
    // full eye height - otherwise the bot consistently aims over the top of the hittable sphere.
    ctx.faceTowards(bot, {
      x: target.x,
      y: target.y + PLAYER_EYE_HEIGHT * CHARACTER_HITBOX_HEIGHT_FRACTION,
      z: target.z,
    });

    const weaponRange = getWeaponConfig(bot.currentWeapon.configId).range;
    const preferredEngageDistance = Math.min(weaponRange * 0.6, 14);
    if (distance(bot.position, target) > preferredEngageDistance) {
      bot.steering.syncPosition(bot.position);
      const direction = bot.steering.seekDirection(target);
      ctx.requestMove(bot, direction);
    }

    if (botCanSeePlayer(bot, ctx)) {
      if (bot.reactionTimer > 0) {
        bot.reactionTimer -= dt;
      } else {
        ctx.requestFire(bot);
      }
    } else if (bot.timeSinceLastSeenPlayer > AI_LOSE_SIGHT_GRACE_SECONDS) {
      bot.lastKnownPlayerPosition = { ...target };
      bot.fsm.changeTo("search", bot, ctx);
    }
  },
};

const FleeState: BotState = {
  name: "flee",
  execute(bot, ctx) {
    bot.steering.syncPosition(bot.position);
    const direction = bot.steering.fleeDirection(ctx.player.position, AI_FLEE_SAFE_DISTANCE);
    ctx.requestMove(bot, direction);

    if (distance(bot.position, ctx.player.position) > AI_FLEE_SAFE_DISTANCE) {
      bot.fsm.changeTo("patrol", bot, ctx);
    }
  },
};

export const BOT_STATES: Record<BotStateName, BotState> = {
  idle: IdleState,
  patrol: PatrolState,
  search: SearchState,
  attack: AttackState,
  flee: FleeState,
};

/** Cross-cutting transitions (spotted the player, low health) evaluated before the active state runs. */
export function updateBotAI(bot: AICharacter, ctx: BotContext, dt: number): void {
  if (bot.isDead) return;

  const canSee = botCanSeePlayer(bot, ctx);
  bot.timeSinceLastSeenPlayer = canSee ? 0 : bot.timeSinceLastSeenPlayer + dt;
  if (Number.isFinite(bot.heardNoiseTimer)) {
    bot.heardNoiseTimer += dt;
  }

  const isLowHealth = bot.health <= bot.maxHealth * AI_LOW_HEALTH_FRACTION;

  if (isLowHealth && bot.fsm.currentName !== "flee") {
    bot.fsm.changeTo("flee", bot, ctx);
  } else if (!isLowHealth && canSee && bot.fsm.currentName !== "attack") {
    bot.fsm.changeTo("attack", bot, ctx);
  }

  bot.fsm.update(bot, ctx, dt);
}
