import type { MapDefinition, MapVolume } from "./MapDefinition";

const WALL_HEIGHT = 4;
const WALL_HALF_HEIGHT = WALL_HEIGHT / 2;
const WALL_HALF_THICKNESS = 0.25;
const FLOOR_HALF_THICKNESS = 0.5;

// Room A (spawn room): x [-6,6], z [0,12].
// Corridor: x [-1.5,1.5], z [12,20].
// Room B (arena, with a ramp up to a small platform + cover blocks): x [-8,8], z [20,36].

const roomAFloor: MapVolume = {
  kind: "floor",
  halfExtents: { x: 6, y: FLOOR_HALF_THICKNESS, z: 6 },
  position: { x: 0, y: -FLOOR_HALF_THICKNESS, z: 6 },
};

const roomAWalls: MapVolume[] = [
  {
    kind: "wall",
    halfExtents: { x: 6, y: WALL_HALF_HEIGHT, z: WALL_HALF_THICKNESS },
    position: { x: 0, y: WALL_HALF_HEIGHT, z: 0 },
  },
  {
    kind: "wall",
    halfExtents: { x: WALL_HALF_THICKNESS, y: WALL_HALF_HEIGHT, z: 6 },
    position: { x: -6, y: WALL_HALF_HEIGHT, z: 6 },
  },
  {
    kind: "wall",
    halfExtents: { x: WALL_HALF_THICKNESS, y: WALL_HALF_HEIGHT, z: 6 },
    position: { x: 6, y: WALL_HALF_HEIGHT, z: 6 },
  },
  // North wall, split around the corridor opening (x in [-1.5, 1.5]).
  {
    kind: "wall",
    halfExtents: { x: 2.25, y: WALL_HALF_HEIGHT, z: WALL_HALF_THICKNESS },
    position: { x: -3.75, y: WALL_HALF_HEIGHT, z: 12 },
  },
  {
    kind: "wall",
    halfExtents: { x: 2.25, y: WALL_HALF_HEIGHT, z: WALL_HALF_THICKNESS },
    position: { x: 3.75, y: WALL_HALF_HEIGHT, z: 12 },
  },
];

const corridorFloor: MapVolume = {
  kind: "floor",
  halfExtents: { x: 1.5, y: FLOOR_HALF_THICKNESS, z: 4 },
  position: { x: 0, y: -FLOOR_HALF_THICKNESS, z: 16 },
};

const corridorWalls: MapVolume[] = [
  {
    kind: "wall",
    halfExtents: { x: WALL_HALF_THICKNESS, y: WALL_HALF_HEIGHT, z: 4 },
    position: { x: -1.5, y: WALL_HALF_HEIGHT, z: 16 },
  },
  {
    kind: "wall",
    halfExtents: { x: WALL_HALF_THICKNESS, y: WALL_HALF_HEIGHT, z: 4 },
    position: { x: 1.5, y: WALL_HALF_HEIGHT, z: 16 },
  },
];

const roomBFloor: MapVolume = {
  kind: "floor",
  halfExtents: { x: 8, y: FLOOR_HALF_THICKNESS, z: 8 },
  position: { x: 0, y: -FLOOR_HALF_THICKNESS, z: 28 },
};

const roomBWalls: MapVolume[] = [
  // South wall, split around the corridor opening.
  {
    kind: "wall",
    halfExtents: { x: 3.25, y: WALL_HALF_HEIGHT, z: WALL_HALF_THICKNESS },
    position: { x: -4.75, y: WALL_HALF_HEIGHT, z: 20 },
  },
  {
    kind: "wall",
    halfExtents: { x: 3.25, y: WALL_HALF_HEIGHT, z: WALL_HALF_THICKNESS },
    position: { x: 4.75, y: WALL_HALF_HEIGHT, z: 20 },
  },
  {
    kind: "wall",
    halfExtents: { x: WALL_HALF_THICKNESS, y: WALL_HALF_HEIGHT, z: 8 },
    position: { x: -8, y: WALL_HALF_HEIGHT, z: 28 },
  },
  {
    kind: "wall",
    halfExtents: { x: WALL_HALF_THICKNESS, y: WALL_HALF_HEIGHT, z: 8 },
    position: { x: 8, y: WALL_HALF_HEIGHT, z: 28 },
  },
  {
    kind: "wall",
    halfExtents: { x: 8, y: WALL_HALF_HEIGHT, z: WALL_HALF_THICKNESS },
    position: { x: 0, y: WALL_HALF_HEIGHT, z: 36 },
  },
];

// Ramp rising from the room B floor (y=0) up to the platform (top at y=0.6),
// spanning z [28,30]. Centered so its TOP surface (the walkable face) is flush
// with the floor at the low end and flush with the platform at the high end:
// centerY = halfZ*sin(angle) - halfY*cos(angle); totalRise = 2*halfZ*sin(angle).
const RAMP_HALF_X = 3;
const RAMP_HALF_Y = 0.1;
const RAMP_HALF_Z = 1;
const PLATFORM_HEIGHT = 0.6;
const RAMP_ANGLE = Math.asin(PLATFORM_HEIGHT / (2 * RAMP_HALF_Z));
const RAMP_CENTER_Y = RAMP_HALF_Z * Math.sin(RAMP_ANGLE) - RAMP_HALF_Y * Math.cos(RAMP_ANGLE);

const ramp: MapVolume = {
  kind: "ramp",
  halfExtents: { x: RAMP_HALF_X, y: RAMP_HALF_Y, z: RAMP_HALF_Z },
  position: { x: 0, y: RAMP_CENTER_Y, z: 29 },
  // Negative x-rotation puts the low (floor-flush) end at z=28 and the high end at z=30.
  rotation: {
    x: -Math.sin(RAMP_ANGLE / 2),
    y: 0,
    z: 0,
    w: Math.cos(RAMP_ANGLE / 2),
  },
};

const platform: MapVolume = {
  kind: "floor",
  halfExtents: { x: 3, y: 0.1, z: 3 },
  position: { x: 0, y: PLATFORM_HEIGHT - 0.1, z: 33 },
};

const coverBlocks: MapVolume[] = [
  {
    kind: "cover",
    halfExtents: { x: 0.75, y: 0.5, z: 0.75 },
    position: { x: -4, y: 0.5, z: 23 },
  },
  {
    kind: "cover",
    halfExtents: { x: 0.75, y: 0.5, z: 0.75 },
    position: { x: 4, y: 0.5, z: 25 },
  },
  {
    kind: "cover",
    halfExtents: { x: 0.75, y: 0.5, z: 0.75 },
    position: { x: -5, y: 0.5, z: 32 },
  },
];

export const BLOCKOUT_MAP_01: MapDefinition = {
  volumes: [
    roomAFloor,
    ...roomAWalls,
    corridorFloor,
    ...corridorWalls,
    roomBFloor,
    ...roomBWalls,
    ramp,
    platform,
    ...coverBlocks,
  ],
  // Vertical strips (split at x=+/-NAVMESH_HALF_DOORWAY) so every shared edge between adjacent
  // regions matches exactly - required for the navmesh to auto-connect regions. The split is
  // inset from the physical doorway (x=+/-1.5) by more than the bot capsule radius (0.35) so a
  // taut-string path hugging the doorway boundary can't clip the wall corner at the threshold.
  // The ramp/platform (z > 28) is intentionally excluded; bots are kept to the flat floor for v1.
  navMeshRegions: [
    [{ x: -6, y: 0, z: 0 }, { x: -6, y: 0, z: 12 }, { x: -0.9, y: 0, z: 12 }, { x: -0.9, y: 0, z: 0 }],
    [{ x: -0.9, y: 0, z: 0 }, { x: -0.9, y: 0, z: 12 }, { x: 0.9, y: 0, z: 12 }, { x: 0.9, y: 0, z: 0 }],
    [{ x: 0.9, y: 0, z: 0 }, { x: 0.9, y: 0, z: 12 }, { x: 6, y: 0, z: 12 }, { x: 6, y: 0, z: 0 }],
    [{ x: -0.9, y: 0, z: 12 }, { x: -0.9, y: 0, z: 20 }, { x: 0.9, y: 0, z: 20 }, { x: 0.9, y: 0, z: 12 }],
    [{ x: -8, y: 0, z: 20 }, { x: -8, y: 0, z: 28 }, { x: -0.9, y: 0, z: 28 }, { x: -0.9, y: 0, z: 20 }],
    [{ x: -0.9, y: 0, z: 20 }, { x: -0.9, y: 0, z: 28 }, { x: 0.9, y: 0, z: 28 }, { x: 0.9, y: 0, z: 20 }],
    [{ x: 0.9, y: 0, z: 20 }, { x: 0.9, y: 0, z: 28 }, { x: 8, y: 0, z: 28 }, { x: 8, y: 0, z: 20 }],
  ],
  spawnPoints: {
    player: { x: 0, y: 0.1, z: 6 },
    // Both bots patrol Room B (away from the player's Room A spawn) so they don't have
    // line-of-sight to the player immediately on spawn - they'll notice via the corridor
    // once the player actually approaches, or via gunshot noise.
    ai: [
      {
        position: { x: 6, y: 0.1, z: 22 },
        patrolPoints: [
          { x: 6, y: 0.1, z: 22 },
          { x: 6, y: 0.1, z: 27 },
        ],
      },
      {
        position: { x: -6, y: 0.1, z: 22 },
        patrolPoints: [
          { x: -6, y: 0.1, z: 22 },
          { x: -6, y: 0.1, z: 27 },
        ],
      },
    ],
  },
};
