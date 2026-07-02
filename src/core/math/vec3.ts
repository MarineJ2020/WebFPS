import type { Vec3 } from "../entities/Entity";

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function distance(a: Vec3, b: Vec3): number {
  return length(subtract(a, b));
}

/** Signed yaw (radians) that would make an entity at `from` face `to`, ignoring elevation. */
export function yawTowards(from: Vec3, to: Vec3): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

/** Signed pitch (radians, positive = looking up) that would make an entity at `from` face `to`. */
export function pitchTowards(from: Vec3, to: Vec3): number {
  const horizontalDistance = Math.hypot(to.x - from.x, to.z - from.z);
  return Math.atan2(to.y - from.y, horizontalDistance);
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a) || 1;
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

/** Forward direction for a look orientation, matching THREE's 'YXZ' Euler order (yaw then pitch). */
export function forwardVectorFromYawPitch(yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  return {
    x: -cosPitch * Math.sin(yaw),
    y: Math.sin(pitch),
    z: -cosPitch * Math.cos(yaw),
  };
}
