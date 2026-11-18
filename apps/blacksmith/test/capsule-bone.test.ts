import { test } from "node:test";
import assert from "node:assert/strict";
import { capsuleBone, type BindSkin } from "../src/lib/capsule-bone";

/** Vertices along the x axis: x 0–9 on bone 0, 10–19 shared 3:1 by bones 1 and 2. */
function skin(): BindSkin {
  const positions: number[] = [];
  const bones: number[] = [];
  const weights: number[] = [];
  for (let x = 0; x < 20; x++) {
    positions.push(x, 0, 0);
    if (x < 10) {
      bones.push(0, 0, 0, 0);
      weights.push(1, 0, 0, 0);
    } else {
      bones.push(1, 2, 0, 0);
      weights.push(0.75, 0.25, 0, 0);
    }
  }
  return { positions, bones, weights };
}

test("capsuleBone picks the bone carrying most of the mesh inside the capsule", () => {
  assert.equal(capsuleBone(skin(), [0, 0, 0], [4, 0, 0], 1), 0);
  assert.equal(capsuleBone(skin(), [12, 1, 0], [18, 1, 0], 2), 1);
  // Across the seam: 6 vertices of bone 0 against 6 shared ones (4.5 to bone 1).
  assert.equal(capsuleBone(skin(), [4, 0, 0], [15, 0, 0], 0.5), 0);
});

test("capsuleBone falls back to the nearest vertex, and null without any", () => {
  assert.equal(capsuleBone(skin(), [30, 5, 0], [40, 5, 0], 1), 1);
  assert.equal(
    capsuleBone({ positions: [], bones: [], weights: [] }, [0, 0, 0], [1, 0, 0], 1),
    null,
  );
});
