import { ASSET_MANIFEST, type MapManifestEntry } from "../manifests/AssetManifest";
import type { MapDefinition } from "../maps/MapDefinition";
import { mapFromEditable, type EditableMapDocument } from "../../editor/EditableMapDocument";

export interface SelectableLevel {
  id: string;
  name: string;
  map: MapDefinition;
  source: "built-in" | "folder" | "import";
}

const folderLevelModules = import.meta.glob("./*.json", { eager: true, import: "default" }) as Record<string, unknown>;

export function getSelectableLevels(): SelectableLevel[] {
  const levels: SelectableLevel[] = Object.values(ASSET_MANIFEST.maps).map((entry) => ({
    id: entry.id,
    name: entry.displayName,
    map: entry.definition,
    source: "built-in",
  }));

  for (const [path, value] of Object.entries(folderLevelModules)) {
    levels.push(parseLevelEntry(value, fileBaseName(path), "folder"));
  }

  return dedupeLevels(levels);
}

export function createImportedLevel(json: string, fileName: string): SelectableLevel {
  return parseLevelEntry(JSON.parse(json) as unknown, fileName.replace(/\.json$/i, ""), "import");
}

function parseLevelEntry(value: unknown, fallbackId: string, source: SelectableLevel["source"]): SelectableLevel {
  if (isMapManifestEntry(value)) {
    return {
      id: normalizeId(value.id || fallbackId),
      name: value.displayName || titleFromId(fallbackId),
      map: value.definition,
      source,
    };
  }

  if (isEditableMapDocument(value)) {
    return {
      id: normalizeId(value.id || fallbackId),
      name: value.name || titleFromId(fallbackId),
      map: mapFromEditable(value),
      source,
    };
  }

  if (isMapDefinition(value)) {
    return {
      id: normalizeId(fallbackId),
      name: titleFromId(fallbackId),
      map: value,
      source,
    };
  }

  throw new Error(`Level "${fallbackId}" is not a map manifest, editor level, or runtime map.`);
}

function dedupeLevels(levels: SelectableLevel[]): SelectableLevel[] {
  const seen = new Set<string>();
  const result: SelectableLevel[] = [];
  for (const level of levels) {
    let id = level.id;
    let suffix = 2;
    while (seen.has(id)) id = `${level.id}-${suffix++}`;
    seen.add(id);
    result.push(id === level.id ? level : { ...level, id });
  }
  return result;
}

function isMapManifestEntry(value: unknown): value is MapManifestEntry {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.displayName === "string"
    && isMapDefinition(value.definition);
}

function isEditableMapDocument(value: unknown): value is EditableMapDocument {
  return isRecord(value)
    && value.version === 1
    && typeof value.id === "string"
    && typeof value.name === "string"
    && Array.isArray(value.volumes)
    && isRecord(value.spawnPoints)
    && Array.isArray(value.navMeshRegions);
}

function isMapDefinition(value: unknown): value is MapDefinition {
  return isRecord(value)
    && Array.isArray(value.volumes)
    && Array.isArray(value.navMeshRegions)
    && isRecord(value.spawnPoints)
    && isRecord(value.spawnPoints.player)
    && Array.isArray(value.spawnPoints.ai);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function fileBaseName(path: string): string {
  return path.split(/[\\/]/).pop()?.replace(/\.json$/i, "") || "level";
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "level";
}

function titleFromId(value: string): string {
  return value
    .replace(/\.json$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
