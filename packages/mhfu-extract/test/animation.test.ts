import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bone } from "../src/models/ahi.js";
import {
  bindMatrices,
  buildClips,
  eulerToQuat,
  invertAffine,
  keepKeys,
  multiplyMatrices,
  type Quat,
} from "../src/models/animation.js";
import type { Motion, MotionChannel } from "../src/models/motion.js";

const close = (actual: readonly number[], expected: readonly number[], epsilon = 1e-9) =>
  assert.ok(
    actual.every((c, k) => Math.abs(c - expected[k]!) < epsilon),
    `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
  );

/** Hamilton product a * b (apply b, then a). */
const multiply = ([ax, ay, az, aw]: Quat, [bx, by, bz, bw]: Quat): Quat => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];

test("eulerToQuat applies X, then Y, then Z", () => {
  const h = Math.SQRT1_2;
  close(eulerToQuat([Math.PI / 2, 0, 0]), [h, 0, 0, h]);
  const [x, y, z] = [0.3, -1.1, 2.5];
  const axis = (k: number, a: number): Quat => {
    const q: Quat = [0, 0, 0, Math.cos(a / 2)];
    q[k] = Math.sin(a / 2);
    return q;
  };
  close(eulerToQuat([x, y, z]), multiply(axis(2, z), multiply(axis(1, y), axis(0, x))));
});

test("keepKeys keeps only the keys linear interpolation can't rebuild", () => {
  const lerp = (a: readonly number[], b: readonly number[], t: number) => [
    a[0]! + (b[0]! - a[0]!) * t,
  ];
  const error = (a: readonly number[], b: readonly number[]) => Math.abs(a[0]! - b[0]!);
  const line = [0, 1, 2, 3, 4].map((v) => [v]);
  assert.deepEqual(keepKeys(line, error, lerp, 0.01), [0, 4]);
  const kink = [0, 1, 2, 1, 0].map((v) => [v]);
  assert.deepEqual(keepKeys(kink, error, lerp, 0.01), [0, 2, 4]);
  assert.deepEqual(keepKeys(kink, error, lerp, 5), [0, 4]);
});

test("bindMatrices give each bone's model-space frame", () => {
  const bones: Bone[] = [
    { id: 0, parent: -1, scale: [1, 1, 1], rotation: [0, 0, 0], translation: [0, 10, 0], part: 0 },
    {
      id: 1,
      parent: 0,
      scale: [2, 2, 2],
      rotation: [0, Math.PI / 2, 0],
      translation: [5, 0, 0],
      part: 0,
    },
  ];
  const [, child] = bindMatrices(bones);
  close(child!.slice(12, 15), [5, 10, 0]);
  const identity = multiplyMatrices(child!, invertAffine(child!));
  close(identity, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
});

const BONES: Bone[] = [
  { id: 0, parent: -1, scale: [1, 1, 1], rotation: [0, 0, 0], translation: [0, 0, 0], part: 0 },
  { id: 1, parent: 0, scale: [1, 1, 1], rotation: [0, 0, 0], translation: [0, 0, 10], part: 0 },
  { id: 2, parent: 1, scale: [1, 1, 1], rotation: [0, 0, 0], translation: [0, 0, 10], part: 1 },
];

/** A channel straight from its first key to its last (tangents on the slope). */
const channel = (
  property: MotionChannel["property"],
  axis: 0 | 1 | 2,
  [[f0, v0], [f1, v1]]: [[number, number], [number, number]],
): MotionChannel => {
  const slope = (v1 - v0) / (f1 - f0);
  return {
    property,
    axis,
    keys: [
      { frame: f0, value: v0, tangentIn: slope, tangentOut: slope },
      { frame: f1, value: v1, tangentIn: slope, tangentOut: slope },
    ],
  };
};
const motion = (frames: number, bones: MotionChannel[][]): Motion => ({
  loop: true,
  loopStart: 6,
  frames,
  bones,
});

test("buildClips plays each part's motions in the same slot together, on that part's bones", () => {
  const body = motion(30, [
    // Bone 0: a channel that never leaves the bind pose adds no track.
    [
      channel("translation", 0, [
        [0, 0],
        [30, 0],
      ]),
    ],
    // Bone 1: a turn about y, and a constant lift (one key).
    [
      channel("rotation", 1, [
        [0, 0],
        [30, Math.PI / 2],
      ]),
      channel("translation", 1, [
        [0, 5],
        [30, 5],
      ]),
    ],
  ]);
  const head = motion(15, [
    [
      channel("scale", 0, [
        [0, 1],
        [15, 2],
      ]),
    ],
  ]);
  const clips = buildClips(BONES, [[null, body], [], [null, head], []]);
  assert.equal(clips.length, 1);
  const [clip] = clips;
  assert.equal(clip!.slot, 1);
  assert.equal(clip!.duration, 0.5);
  assert.equal(clip!.loopStart, 0.1);
  assert.deepEqual(
    clip!.tracks.map((t) => `${t.bone} ${t.path}`),
    ["1 translation", "1 rotation", "2 scale"],
  );
  const lift = clip!.tracks.find((t) => t.path === "translation")!;
  assert.deepEqual(lift.values, [0, 5, 10]);
  // A steady turn needs keys between its ends: linear quaternion
  // interpolation isn't a steady turn at 90 degrees.
  const turn = clip!.tracks.find((t) => t.path === "rotation")!;
  assert.ok(turn.times.length > 2 && turn.times.length < 31);
  close(turn.values.slice(-4), eulerToQuat([0, Math.PI / 2, 0]), 1e-6);
  // The head's scale holds its last key once its shorter motion ends.
  const grow = clip!.tracks.find((t) => t.path === "scale")!;
  assert.deepEqual(grow.times, [0, 0.25, 0.5]);
  assert.deepEqual(grow.values.slice(3), [2, 1, 1, 2, 1, 1]);
});

test("buildClips leaves out a part's motion whose bone count isn't the part's", () => {
  const wrong = motion(10, [
    [],
    [],
    [
      channel("rotation", 0, [
        [0, 0],
        [10, 1],
      ]),
    ],
  ]);
  assert.deepEqual(buildClips(BONES, [[wrong]]), []);
});
