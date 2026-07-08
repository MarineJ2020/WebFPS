import type { AICharacter } from "../../entities/AICharacter";
import type { BotContext } from "./BotContext";

export type BotStateName = "idle" | "patrol" | "search" | "attack" | "flee";

export interface BotState {
  name: BotStateName;
  enter?(bot: AICharacter, ctx: BotContext): void;
  execute(bot: AICharacter, ctx: BotContext, dt: number): void;
  exit?(bot: AICharacter, ctx: BotContext): void;
}

/**
 * Hand-rolled FSM rather than yuka.StateMachine: yuka's StateMachine<T> requires T to extend
 * yuka.GameEntity, which would force AICharacter to inherit from yuka's class hierarchy instead
 * of the shared Character base it needs for health/weapons. The state/transition shape below is
 * otherwise identical to yuka's pattern (enter/execute/exit); yuka is still used for steering and
 * navmesh pathfinding, where no such constraint applies.
 */
export class BotStateMachine {
  private readonly states: Record<BotStateName, BotState>;
  private current: BotState;

  constructor(states: Record<BotStateName, BotState>, initial: BotStateName) {
    this.states = states;
    this.current = states[initial];
  }

  get currentName(): BotStateName {
    return this.current.name;
  }

  changeTo(name: BotStateName, bot: AICharacter, ctx: BotContext): void {
    if (this.current.name === name) return;
    this.current.exit?.(bot, ctx);
    this.current = this.states[name];
    bot.stateTimer = 0;
    this.current.enter?.(bot, ctx);
  }

  resetTo(name: BotStateName, bot: AICharacter): void {
    this.current = this.states[name];
    bot.stateTimer = 0;
  }

  update(bot: AICharacter, ctx: BotContext, dt: number): void {
    this.current.execute(bot, ctx, dt);
  }
}
