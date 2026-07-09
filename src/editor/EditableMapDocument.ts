import * as THREE from "three";
import type { Vec3 } from "../core/entities/Entity";
import type { MapDefinition, VolumeKind } from "../data/maps/MapDefinition";

export type SpawnTeam = "A" | "B";
export type SpawnKind = "player" | "bot";

export interface EditableMapVolume {
  id: string;
  name: string;
  kind: VolumeKind;
  halfExtents: Vec3;
  position: Vec3;
  rotationDegrees: Vec3;
  parentId?: string;
  enabled: boolean;
  hidden: boolean;
  frozen: boolean;
}

export interface EditablePatrolPoint {
  id: string;
  position: Vec3;
}

export interface EditableAISpawn {
  id: string;
  position: Vec3;
  patrolPoints: EditablePatrolPoint[];
}

export interface EditableSpawnPoint {
  id: string;
  name: string;
  kind: SpawnKind;
  team: SpawnTeam;
  position: Vec3;
  enabled: boolean;
  hidden: boolean;
  frozen: boolean;
  patrolPoints: EditablePatrolPoint[];
}

export interface EditableNavMeshRegion {
  id: string;
  points: Vec3[];
}

export interface EditableMapDocument {
  version: 1;
  id: string;
  name: string;
  volumes: EditableMapVolume[];
  spawnPoints: {
    player: Vec3;
    ai: EditableAISpawn[];
    points: EditableSpawnPoint[];
  };
  navMeshRegions: EditableNavMeshRegion[];
}

export function editableFromMap(map: MapDefinition, name = "Untitled Map", id = createId("map")): EditableMapDocument {
  return {
    version: 1,
    id,
    name,
    volumes: map.volumes.map((volume, index) => ({
      id: createId(`volume-${index}`),
      name: `${titleCase(volume.kind)} ${index + 1}`,
      kind: volume.kind,
      halfExtents: { ...volume.halfExtents },
      position: { ...volume.position },
      rotationDegrees: quaternionToDegrees(volume.rotation),
      enabled: true,
      hidden: false,
      frozen: false,
    })),
    spawnPoints: {
      player: { ...map.spawnPoints.player },
      ai: map.spawnPoints.ai.map((spawn, spawnIndex) => ({
        id: createId(`bot-${spawnIndex}`),
        position: { ...spawn.position },
        patrolPoints: spawn.patrolPoints.map((point, pointIndex) => ({
          id: createId(`patrol-${spawnIndex}-${pointIndex}`),
          position: { ...point },
        })),
      })),
      points: [
        {
          id: createId("spawn-player"),
          name: "Team A Player Spawn",
          kind: "player",
          team: "A",
          position: { ...map.spawnPoints.player },
          enabled: true,
          hidden: false,
          frozen: false,
          patrolPoints: [],
        },
        ...map.spawnPoints.ai.map((spawn, spawnIndex) => ({
          id: createId(`spawn-bot-${spawnIndex}`),
          name: `Team B Bot Spawn ${spawnIndex + 1}`,
          kind: "bot" as const,
          team: "B" as const,
          position: { ...spawn.position },
          enabled: true,
          hidden: false,
          frozen: false,
          patrolPoints: spawn.patrolPoints.map((point, pointIndex) => ({
            id: createId(`spawn-patrol-${spawnIndex}-${pointIndex}`),
            position: { ...point },
          })),
        })),
      ],
    },
    navMeshRegions: map.navMeshRegions.map((region, index) => ({
      id: createId(`nav-${index}`),
      points: region.map((point) => ({ ...point })),
    })),
  };
}

export function mapFromEditable(
  document: EditableMapDocument,
  options: { includeDisabled?: boolean; includeHidden?: boolean } = {},
): MapDefinition {
  const spawnPoints = normalizedSpawnPoints(document);
  return {
    volumes: document.volumes
      .filter((volume) => (options.includeDisabled || volume.enabled !== false) && (options.includeHidden || volume.hidden !== true))
      .map((volume) => ({
        kind: volume.kind,
        halfExtents: { ...volume.halfExtents },
        position: { ...volume.position },
        rotation: degreesToQuaternion(volume.rotationDegrees),
      })),
    spawnPoints: {
      player: spawnPoints.player,
      ai: spawnPoints.ai,
    },
    navMeshRegions: document.navMeshRegions.map((region) => normalizeConvexRegion(region.points)),
  };
}

export function cloneEditableMapDocument(document: EditableMapDocument): EditableMapDocument {
  return JSON.parse(JSON.stringify(document)) as EditableMapDocument;
}

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function quaternionToDegrees(rotation: { x: number; y: number; z: number; w: number } | undefined): Vec3 {
  if (!rotation) return { x: 0, y: 0, z: 0 };
  const euler = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
  );
  return {
    x: THREE.MathUtils.radToDeg(euler.x),
    y: THREE.MathUtils.radToDeg(euler.y),
    z: THREE.MathUtils.radToDeg(euler.z),
  };
}

function degreesToQuaternion(degrees: Vec3): { x: number; y: number; z: number; w: number } | undefined {
  if (degrees.x === 0 && degrees.y === 0 && degrees.z === 0) return undefined;
  const quaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(degrees.x),
      THREE.MathUtils.degToRad(degrees.y),
      THREE.MathUtils.degToRad(degrees.z),
    ),
  );
  return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
}

function normalizeConvexRegion(points: Vec3[]): Vec3[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }),
    { x: 0, y: 0, z: 0 },
  );
  center.x /= points.length;
  center.y /= points.length;
  center.z /= points.length;

  return [...points]
    .sort((a, b) => Math.atan2(a.z - center.z, a.x - center.x) - Math.atan2(b.z - center.z, b.x - center.x))
    .map((point) => ({ ...point }));
}

function normalizedSpawnPoints(document: EditableMapDocument): MapDefinition["spawnPoints"] {
  const points = document.spawnPoints.points ?? [];
  if (points.length === 0) {
    return {
      player: { ...document.spawnPoints.player },
      ai: document.spawnPoints.ai.map((spawn) => ({
        position: { ...spawn.position },
        patrolPoints: spawn.patrolPoints.length
          ? spawn.patrolPoints.map((point) => ({ ...point.position }))
          : [{ ...spawn.position }],
      })),
    };
  }

  const enabled = points.filter((point) => point.enabled !== false && point.hidden !== true);
  const player =
    enabled.find((point) => point.kind === "player" && point.team === "A") ??
    enabled.find((point) => point.kind === "player") ??
    points.find((point) => point.kind === "player");

  return {
    player: player ? { ...player.position } : { ...document.spawnPoints.player },
    ai: enabled
      .filter((point) => point.kind === "bot")
      .map((point) => ({
        position: { ...point.position },
        patrolPoints: point.patrolPoints.length
          ? point.patrolPoints.map((patrolPoint) => ({ ...patrolPoint.position }))
          : [{ ...point.position }],
      })),
    points: enabled
      .filter((point) => point.kind === "player")
      .map((point) => ({
        kind: "player" as const,
        team: point.team,
        position: { ...point.position },
        enabled: point.enabled,
        hidden: point.hidden,
      })),
  };
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
