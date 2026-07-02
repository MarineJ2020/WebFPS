import type { Player } from "../../entities/Player";
import type { EventBus } from "../../EventBus";
import type { IHitscanQuery } from "../../physics/raycast/IHitscanQuery";
import type { NavMeshService } from "../navigation/NavMeshService";
import type { AICharacter } from "../../entities/AICharacter";

export interface BotContext {
  player: Player;
  hitscan: IHitscanQuery;
  events: EventBus;
  navMesh: NavMeshService;
  rng: () => number;
  /** Requests a world-space XZ move direction be applied to the bot this tick (gravity/collision handled by the caller). */
  requestMove(bot: AICharacter, direction: { x: number; z: number }): void;
  /** Rotates the bot's yaw/pitch to face a world position. */
  faceTowards(bot: AICharacter, position: { x: number; y: number; z: number }): void;
  /** Fires the bot's current weapon this tick if its fire-mode timing allows. */
  requestFire(bot: AICharacter): void;
}
