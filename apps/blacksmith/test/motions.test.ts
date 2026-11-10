import assert from "node:assert/strict";
import { test } from "node:test";
import { inPlace, parseMotions, type MotionClip } from "../src/lib/motions";

/** A motions file (before gzip) as mhfu-extract's motion-pack.ts writes it. */
function motionsFile(): Uint8Array {
  const bytes: number[] = [..."MHM1"].map((c) => c.charCodeAt(0));
  const u8 = (v: number) => bytes.push(v & 0xff);
  const u16 = (v: number) => bytes.push(v & 0xff, (v >> 8) & 0xff);
  u16(1); // clips
  u16(2); // slot
  u16(60); // frames
  u8(1); // loop
  u16(0); // loop start
  u16(2); // tracks
  u8(0);
  u8(1);
  u16(2); // bone 0 rotation, 2 keys
  u8(1);
  u8(0);
  u16(2); // bone 1 translation, 2 keys
  u8(0);
  u8(30); // rotation frames 0, 30
  u8(0);
  u8(255);
  u16(300); // translation frames 0, 300
  [0, 0, 0, 0x7fff, 0, 0x7fff, 0, -0x7fff].forEach(u16); // rotation deltas
  [16, 32, -48, 0, 0, 16].forEach(u16); // translation deltas, 1/16
  return Uint8Array.from(bytes);
}

test("parseMotions reads tracks back from their delta-coded keys", () => {
  const [clip, ...rest] = parseMotions(motionsFile());
  assert.equal(rest.length, 0);
  assert.equal(clip!.slot, 2);
  assert.equal(clip!.duration, 2);
  assert.equal(clip!.loop, true);
  const [turn, move] = clip!.tracks;
  assert.equal(turn!.path, "rotation");
  assert.deepEqual([...turn!.times], [0, 1]);
  assert.deepEqual([...turn!.values], [0, 0, 0, 1, 0, 1, 0, 0]);
  assert.equal(move!.bone, 1);
  assert.deepEqual([...move!.times], [0, 10]);
  assert.deepEqual([...move!.values], [1, 2, -3, 1, 2, -2]);
});

test("parseMotions rejects another file and trailing bytes", () => {
  assert.throws(() => parseMotions(new TextEncoder().encode("glTF....")), /Not a motions file/);
  assert.throws(() => parseMotions(Uint8Array.from([...motionsFile(), 0])), /trailing/);
});

test("inPlace pins the hips' horizontal position to the bind pose, not deeper bones", () => {
  const track = (bone: number) => ({
    bone,
    path: "translation" as const,
    times: Float32Array.of(0, 1),
    values: Float32Array.of(0, 5, 0, 100, 6, 200),
  });
  const clip: MotionClip = { slot: 0, duration: 1, loop: false, tracks: [track(1), track(2)] };
  const parents = [-1, 0, 1];
  const [hips, tail] = inPlace(
    clip,
    (bone) => parents[bone]!,
    () => [3, 4, 7],
  ).tracks;
  assert.deepEqual([...hips!.values], [3, 5, 7, 3, 6, 7]);
  assert.deepEqual([...tail!.values], [0, 5, 0, 100, 6, 200]);
  assert.deepEqual([...clip.tracks[0]!.values], [0, 5, 0, 100, 6, 200], "input untouched");
});
