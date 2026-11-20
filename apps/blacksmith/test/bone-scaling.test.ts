import assert from "node:assert/strict";
import { test } from "node:test";
import { hierarchicalPose, type BoneLocal, type Quat } from "../src/lib/bone-scaling";

const NONE: Quat = [0, 0, 0, 1];
/** A quarter turn about x: y goes to z. */
const QUARTER_X: Quat = [Math.SQRT1_2, 0, 0, Math.SQRT1_2];

function close(actual: ArrayLike<number>, expected: number[]): void {
  assert.equal(actual.length, expected.length);
  expected.forEach((e, i) =>
    assert.ok(Math.abs(actual[i]! - e) < 1e-9, `[${i}] ${actual[i]} ≠ ${e}`),
  );
}

test("a child's scale undoes its ancestor's along its own axes, even when turned", () => {
  // Bone 0 squashed along z, bone 1 turned a quarter about x, bone 2 stretched back.
  const bones: BoneLocal[] = [
    { parent: -1, position: [0, 0, 0], quaternion: NONE, scale: [1, 1, 0.5] },
    { parent: 0, position: [0, 0, -10], quaternion: QUARTER_X, scale: [1, 1, 1] },
    { parent: 1, position: [0, 0, -10], quaternion: NONE, scale: [1, 1, 2] },
  ];
  const pose = hierarchicalPose(bones);
  // Bone 1 sits where the squashed parent puts it.
  close(pose.subarray(16, 32).subarray(12, 15), [0, 0, -5]);
  // Bone 2: turned as bone 1, unscaled (0.5 * 2), not skewed; placed
  // 10 * 0.5 along bone 1's own -z, which the turn points along +y.
  close(pose.subarray(32, 48), [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 5, -5, 1]);
});

test("without scale it is the usual chain of transforms", () => {
  const bones: BoneLocal[] = [
    { parent: -1, position: [1, 2, 3], quaternion: QUARTER_X, scale: [1, 1, 1] },
    { parent: 0, position: [0, 4, 0], quaternion: QUARTER_X, scale: [1, 1, 1] },
  ];
  const pose = hierarchicalPose(bones);
  // Two quarter turns about x: y to -y, z to -z; the child's offset turns to +z.
  close(pose.subarray(16, 32), [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 1, 2, 7, 1]);
});

test("a bone listed before its parent is refused", () => {
  const bones: BoneLocal[] = [
    { parent: 1, position: [0, 0, 0], quaternion: NONE, scale: [1, 1, 1] },
    { parent: -1, position: [0, 0, 0], quaternion: NONE, scale: [1, 1, 1] },
  ];
  assert.throws(() => hierarchicalPose(bones), /before its parent/);
});
