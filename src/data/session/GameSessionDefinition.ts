import { BLOCKOUT_MAP_01 } from "../maps/blockoutMap01";
import type { MapDefinition } from "../maps/MapDefinition";
import { ASSAULT_RIFLE_01, BOT_RIFLE_01 } from "../weapons/weaponTypes";

export interface CharacterLoadoutDefinition {
  weaponConfigIds: string[];
}

export interface BotSessionDefinition extends CharacterLoadoutDefinition {
  id?: string;
}

export interface GameSessionDefinition {
  id: string;
  name: string;
  map: MapDefinition;
  player: CharacterLoadoutDefinition;
  bots: BotSessionDefinition[];
}

export function createDefaultSessionDefinition(map: MapDefinition = BLOCKOUT_MAP_01): GameSessionDefinition {
  return {
    id: "default-blockout",
    name: "Blockout Skirmish",
    map,
    player: {
      weaponConfigIds: [ASSAULT_RIFLE_01.id],
    },
    bots: map.spawnPoints.ai.map((_, index) => ({
      id: `bot-${index}`,
      weaponConfigIds: [BOT_RIFLE_01.id],
    })),
  };
}
