import { describe, expect, it } from "vitest";
import { canSeeTarget, type PerceptionConfig } from "../../src/core/ai/Perception";
import type { IHitscanQuery, HitResult } from "../../src/core/physics/raycast/IHitscanQuery";

const CONFIG: PerceptionConfig = {
  viewRange: 20,
  fovHalfAngleRadians: (60 * Math.PI) / 180,
  eyeHeight: 1.5,
};

function unobstructedHitscan(): IHitscanQuery {
  return { castRay: () => null };
}

function obstructedAt(distance: number): IHitscanQuery {
  const hit: HitResult = { point: { x: 0, y: 0, z: 0 }, distance };
  return { castRay: () => hit };
}

describe("canSeeTarget", () => {
  it("sees a target directly ahead, within range and unobstructed", () => {
    const selfPos = { x: 0, y: 1.5, z: 0 };
    const targetPos = { x: 0, y: 0, z: -10 }; // straight ahead at yaw=0
    const visible = canSeeTarget(selfPos, 0, targetPos, 1.5, CONFIG, unobstructedHitscan());
    expect(visible).toBe(true);
  });

  it("does not see a target beyond viewRange", () => {
    const selfPos = { x: 0, y: 1.5, z: 0 };
    const targetPos = { x: 0, y: 0, z: -25 };
    const visible = canSeeTarget(selfPos, 0, targetPos, 1.5, CONFIG, unobstructedHitscan());
    expect(visible).toBe(false);
  });

  it("does not see a target outside the field of view", () => {
    const selfPos = { x: 0, y: 1.5, z: 0 };
    const targetPos = { x: -10, y: 0, z: 0 }; // 90 degrees to the side, yaw=0 faces -z
    const visible = canSeeTarget(selfPos, 0, targetPos, 1.5, CONFIG, unobstructedHitscan());
    expect(visible).toBe(false);
  });

  it("sees a target at the edge of the field of view but not just past it", () => {
    const selfPos = { x: 0, y: 1.5, z: 0 };
    const distanceOut = 10;
    const justInsideAngle = CONFIG.fovHalfAngleRadians - 0.01;
    const justOutsideAngle = CONFIG.fovHalfAngleRadians + 0.01;

    const insideTarget = {
      x: -Math.sin(justInsideAngle) * distanceOut,
      y: 0,
      z: -Math.cos(justInsideAngle) * distanceOut,
    };
    const outsideTarget = {
      x: -Math.sin(justOutsideAngle) * distanceOut,
      y: 0,
      z: -Math.cos(justOutsideAngle) * distanceOut,
    };

    expect(canSeeTarget(selfPos, 0, insideTarget, 1.5, CONFIG, unobstructedHitscan())).toBe(true);
    expect(canSeeTarget(selfPos, 0, outsideTarget, 1.5, CONFIG, unobstructedHitscan())).toBe(false);
  });

  it("does not see a target blocked by geometry in between", () => {
    const selfPos = { x: 0, y: 1.5, z: 0 };
    const targetPos = { x: 0, y: 0, z: -10 };
    const wallInTheWay = obstructedAt(5); // something hit at half the distance to the target
    const visible = canSeeTarget(selfPos, 0, targetPos, 1.5, CONFIG, wallInTheWay);
    expect(visible).toBe(false);
  });

  it("sees the target when the only hit is the target itself at the expected distance", () => {
    const selfPos = { x: 0, y: 1.5, z: 0 };
    const targetPos = { x: 0, y: 0, z: -10 };
    const hitAtTargetDistance = obstructedAt(10);
    const visible = canSeeTarget(selfPos, 0, targetPos, 1.5, CONFIG, hitAtTargetDistance);
    expect(visible).toBe(true);
  });
});
