import { describe, expect, it } from "vitest";
import {
  applyRecoilKick,
  createRecoilOffset,
  updateRecoilRecovery,
} from "../../src/core/entities/weapons/RecoilController";
import type { RecoilPattern } from "../../src/data/weapons/weaponTypes";

const PATTERN: RecoilPattern = {
  verticalKickMin: 0.01,
  verticalKickMax: 0.02,
  horizontalKickRange: 0.006,
  recoverySpeed: 8,
};

const PATTERN_WITH_CLIMB: RecoilPattern = {
  ...PATTERN,
  patternCurve: [1, 2, 3],
};

function fixedRng(value: number) {
  return () => value;
}

describe("applyRecoilKick", () => {
  it("kicks pitch upward within [verticalKickMin, verticalKickMax]", () => {
    const offset = createRecoilOffset();
    applyRecoilKick(offset, PATTERN, fixedRng(0.5));
    expect(offset.pitch).toBeCloseTo(0.015, 5); // midpoint of min/max at rng=0.5
  });

  it("kicks horizontally within +/- horizontalKickRange", () => {
    const offset = createRecoilOffset();
    applyRecoilKick(offset, PATTERN, fixedRng(1));
    expect(offset.yaw).toBeCloseTo(PATTERN.horizontalKickRange, 5);

    const offsetMin = createRecoilOffset();
    applyRecoilKick(offsetMin, PATTERN, fixedRng(0));
    expect(offsetMin.yaw).toBeCloseTo(-PATTERN.horizontalKickRange, 5);
  });

  it("accumulates across repeated shots", () => {
    const offset = createRecoilOffset();
    applyRecoilKick(offset, PATTERN, fixedRng(0.5));
    const afterOne = offset.pitch;
    applyRecoilKick(offset, PATTERN, fixedRng(0.5));
    expect(offset.pitch).toBeCloseTo(afterOne * 2, 5);
  });

  it("scales each shot by the pattern curve entry for the current shot index, then holds the last entry", () => {
    const offset = createRecoilOffset();
    applyRecoilKick(offset, PATTERN_WITH_CLIMB, fixedRng(0.5)); // shot 0, multiplier 1
    const base = offset.pitch;
    applyRecoilKick(offset, PATTERN_WITH_CLIMB, fixedRng(0.5)); // shot 1, multiplier 2
    applyRecoilKick(offset, PATTERN_WITH_CLIMB, fixedRng(0.5)); // shot 2, multiplier 3
    applyRecoilKick(offset, PATTERN_WITH_CLIMB, fixedRng(0.5)); // shot 3, past curve end -> holds at 3

    expect(offset.pitch).toBeCloseTo(base * (1 + 2 + 3 + 3), 5);
    expect(offset.shotIndex).toBe(4);
  });
});

describe("updateRecoilRecovery", () => {
  it("holds the offset steady (no decay) while the trigger is still held", () => {
    const offset = createRecoilOffset();
    applyRecoilKick(offset, PATTERN, fixedRng(0.5));
    const peak = offset.pitch;

    for (let i = 0; i < 60; i++) {
      updateRecoilRecovery(offset, PATTERN, 1 / 60, true);
    }

    expect(offset.pitch).toBe(peak);
  });

  it("decays the offset back toward zero once the trigger is released", () => {
    const offset = createRecoilOffset();
    applyRecoilKick(offset, PATTERN, fixedRng(0.5));
    const peak = offset.pitch;

    for (let i = 0; i < 60; i++) {
      updateRecoilRecovery(offset, PATTERN, 1 / 60, false);
    }

    expect(Math.abs(offset.pitch)).toBeLessThan(peak);
    expect(Math.abs(offset.pitch)).toBeLessThan(0.001);
  });

  it("settles fully to zero given enough time and resets the shot index for the next pattern", () => {
    const offset = createRecoilOffset();
    applyRecoilKick(offset, PATTERN, fixedRng(0.5));

    for (let i = 0; i < 600; i++) {
      updateRecoilRecovery(offset, PATTERN, 1 / 60, false);
    }

    expect(offset.pitch).toBeCloseTo(0, 5);
    expect(offset.pitchVelocity).toBeCloseTo(0, 5);
    expect(offset.shotIndex).toBe(0);
  });
});
