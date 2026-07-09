import { BLOCKOUT_MAP_01 } from "../maps/blockoutMap01";
import type { MapDefinition } from "../maps/MapDefinition";
import { getManifestSession } from "../manifests/AssetManifest";

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
  const session = getManifestSession("default-blockout");
  return {
    id: session.id,
    name: session.displayName,
    map,
    player: {
      weaponConfigIds: session.playerWeaponConfigIds,
    },
    bots: map.spawnPoints.ai.map((_, index) => ({
      id: `bot-${index}`,
      weaponConfigIds: session.botWeaponConfigIds,
    })),
  };
}
