import type { MapDefinition } from "../maps/MapDefinition";
import type { WeaponConfig } from "../weapons/weaponTypes";
import weaponsJson from "./weapons.json";
import charactersJson from "./characters.json";
import gameModesJson from "./gameModes.json";
import sessionsJson from "./sessions.json";
import mapsJson from "./maps.json";
import blockoutMapJson from "./maps/blockout_map_01.json";

export interface WeaponManifestEntry extends WeaponConfig {}

export interface MapManifestEntry {
  id: string;
  displayName: string;
  definition: MapDefinition;
}

export interface MapIndexManifestEntry {
  id: string;
  displayName: string;
  mapUrl: string;
}

export interface CharacterManifestEntry {
  id: string;
  displayName: string;
  teamAColor: string;
  teamBColor: string;
  modelUrl: string | null;
}

export interface GameModeManifestEntry {
  id: string;
  displayName: string;
  scoreLimit: number;
  timeLimitSeconds: number;
  warmupSeconds: number;
  countdownSeconds: number;
  roundEndSeconds: number;
  rematchSeconds: number;
  respawnSeconds: number;
  pickup: {
    healthDropChance: number;
    healthAmount: number;
    pickupLifetimeSeconds: number;
    pickupRadius: number;
  };
}

export interface SessionManifestEntry {
  id: string;
  displayName: string;
  mapId: string;
  gameModeId: string;
  playerWeaponConfigIds: string[];
  botWeaponConfigIds: string[];
  characterId: string;
}

const weaponEntries = validateArray<WeaponManifestEntry>(weaponsJson, "weapons");
const characterEntries = validateArray<CharacterManifestEntry>(charactersJson, "characters");
const gameModeEntries = validateArray<GameModeManifestEntry>(gameModesJson, "gameModes");
const sessionEntries = validateArray<SessionManifestEntry>(sessionsJson, "sessions");
const mapIndexEntries = validateArray<MapIndexManifestEntry>(mapsJson, "maps");
const mapEntries = validateArray<MapManifestEntry>([blockoutMapJson], "maps");
for (const entry of mapIndexEntries) {
  if (!mapEntries.some((map) => map.id === entry.id)) throw new Error(`Map index references missing map "${entry.id}".`);
}

export const ASSET_MANIFEST = {
  weapons: toRecord(weaponEntries, "weapons"),
  characters: toRecord(characterEntries, "characters"),
  gameModes: toRecord(gameModeEntries, "gameModes"),
  sessions: toRecord(sessionEntries, "sessions"),
  maps: toRecord(mapEntries, "maps"),
};

export function getManifestWeapon(id: string): WeaponManifestEntry {
  return requireEntry(ASSET_MANIFEST.weapons, id, "weapon");
}

export function getManifestMap(id: string): MapManifestEntry {
  return requireEntry(ASSET_MANIFEST.maps, id, "map");
}

export function getManifestGameMode(id: string): GameModeManifestEntry {
  return requireEntry(ASSET_MANIFEST.gameModes, id, "game mode");
}

export function getManifestSession(id: string): SessionManifestEntry {
  return requireEntry(ASSET_MANIFEST.sessions, id, "session");
}

function validateArray<T>(value: unknown, label: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Manifest "${label}" must be an array.`);
  return value as T[];
}

function toRecord<T extends { id: string }>(entries: readonly T[], label: string): Record<string, T> {
  const record: Record<string, T> = {};
  for (const entry of entries) {
    if (!entry.id) throw new Error(`Manifest "${label}" contains an entry without an id.`);
    if (record[entry.id]) throw new Error(`Manifest "${label}" contains duplicate id "${entry.id}".`);
    record[entry.id] = entry;
  }
  return record;
}

function requireEntry<T>(record: Record<string, T>, id: string, label: string): T {
  const entry = record[id];
  if (!entry) throw new Error(`Unknown ${label} id: ${id}`);
  return entry;
}
