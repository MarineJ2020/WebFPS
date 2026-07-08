import { SimulationWorld } from "../core/simulation/SimulationWorld";
import type { IHitscanQuery } from "../core/physics/raycast/IHitscanQuery";
import type { GameSessionDefinition } from "../data/session/GameSessionDefinition";

export class SessionController {
  private activeDefinition: GameSessionDefinition | null = null;
  private activeSimulation: SimulationWorld | null = null;
  private readonly rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  get simulation(): SimulationWorld | null {
    return this.activeSimulation;
  }

  get definition(): GameSessionDefinition | null {
    return this.activeDefinition;
  }

  async start(definition: GameSessionDefinition, hitscan: IHitscanQuery): Promise<SimulationWorld> {
    this.activeDefinition = definition;
    this.activeSimulation = await SimulationWorld.create(hitscan, definition, this.rng);
    return this.activeSimulation;
  }

  async restart(hitscan: IHitscanQuery): Promise<SimulationWorld | null> {
    if (!this.activeDefinition) return null;
    return this.start(this.activeDefinition, hitscan);
  }

  clear(): void {
    this.activeDefinition = null;
    this.activeSimulation = null;
  }
}
