import assert from "node:assert/strict";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import type { Clip } from "../src/models/animation.js";
import { MOTION_PACK_MAGIC, packMotions } from "../src/models/motion-pack.js";

test("packMotions writes the header, then frame deltas, rotations and vectors as deltas", () => {
  const clip: Clip = {
    slot: 3,
    duration: 10,
    loop: true,
    loopStart: 0.5,
    tracks: [
      { bone: 4, path: "rotation", times: [0, 1], values: [0, 0, 0, 1, 0, 1, 0, 0] },
      { bone: 4, path: "translation", times: [0, 10], values: [1, 2, 3, 1, 2, 2] },
    ],
  };
  const bytes = gunzipSync(packMotions([clip]));
  let at = 0;
  const u8 = () => bytes.readUInt8(at++);
  const u16 = () => ((at += 2), bytes.readUInt16LE(at - 2));
  const s16 = () => ((at += 2), bytes.readInt16LE(at - 2));

  assert.equal(bytes.subarray(0, 4).toString("latin1"), MOTION_PACK_MAGIC);
  at = 4;
  assert.equal(u16(), 1); // clips
  assert.deepEqual([u16(), u16(), u8(), u16(), u16()], [3, 300, 1, 15, 2]);
  assert.deepEqual([u8(), u8(), u16()], [4, 1, 2]); // bone 4, rotation, 2 keys
  assert.deepEqual([u8(), u8(), u16()], [4, 0, 2]); // bone 4, translation, 2 keys
  // Frames: 0 then 30 for the rotation; 0 then 300 (255 + u16) for the translation.
  assert.deepEqual([u8(), u8(), u8(), u8(), u16()], [0, 30, 0, 255, 300]);
  // Rotations, in 1/0x7fff, each the change from the key before.
  assert.deepEqual(Array.from({ length: 8 }, s16), [0, 0, 0, 0x7fff, 0, 0x7fff, 0, -0x7fff]);
  // Translations, in 1/16 units.
  assert.deepEqual(Array.from({ length: 6 }, s16), [16, 32, 48, 0, 0, -16]);
  assert.equal(at, bytes.length);
});
