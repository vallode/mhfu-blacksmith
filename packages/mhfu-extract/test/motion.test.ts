import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isMotionBank,
  partMotions,
  readMotionBank,
  sampleChannel,
  type MotionKey,
} from "../src/models/motion.js";

/** [value, frame, tangent in, tangent out], raw. */
type RawKey = [number, number, number, number];
/** Channel bit (0-8) -> keys. */
type RawBone = Map<number, RawKey[]>;

function u32s(...values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => buf.writeUInt32LE(v >>> 0, i * 4));
  return buf;
}

function channel(bit: number, keys: RawKey[]): Buffer {
  const body = Buffer.alloc(keys.length * 8);
  keys.forEach(([value, frame, tin, tout], k) => {
    body.writeInt16LE(value, k * 8);
    body.writeUInt16LE(frame, k * 8 + 2);
    body.writeInt16LE(tin, k * 8 + 4);
    body.writeInt16LE(tout, k * 8 + 6);
  });
  return Buffer.concat([u32s(0x80120000 | (1 << bit), keys.length, 12 + body.length), body]);
}

function motion(bones: RawBone[], loop = 1, loopStart = 0): Buffer {
  const records = bones.map((bone) => {
    const bits = [...bone.keys()].sort((a, b) => a - b);
    const body = Buffer.concat(bits.map((bit) => channel(bit, bone.get(bit)!)));
    const mask = bits.reduce((m, bit) => m | (1 << bit), 0);
    return Buffer.concat([u32s(0x80000000 | mask, bits.length, 12 + body.length), body]);
  });
  const head = Buffer.alloc(0x14);
  head.writeUInt32LE(0x80000002, 0);
  head.writeUInt32LE(bones.length, 4);
  head.writeUInt32LE(0x14 + records.reduce((n, r) => n + r.length, 0), 8);
  head.writeUInt32LE(loop, 0x0c);
  head.writeFloatLE(loopStart, 0x10);
  return Buffer.concat([head, ...records]);
}

/** A bank as monster packages store it: (count, offset) pairs, 0-terminated, then the tables, then the motions. */
function bank(tables: (Buffer | null)[][]): Buffer {
  let at = (tables.length + 1) * 8;
  const directory: number[] = [];
  for (const table of tables) {
    directory.push(table.length, at);
    at += table.length * 4;
  }
  directory.push(0, at);
  const offsets: number[] = [];
  const bodies: Buffer[] = [];
  for (const table of tables)
    for (const m of table) {
      if (!m) offsets.push(0xffffffff);
      else {
        offsets.push(at);
        bodies.push(m);
        at += m.length;
      }
    }
  return Buffer.concat([u32s(...directory), u32s(...offsets), ...bodies]);
}

const BODY = motion(
  [
    new Map(), // a bone the motion leaves at its bind pose
    new Map([
      [
        4,
        [
          [0x1000, 0, 0, 0],
          [-0x2000, 30, 0, 0],
        ] as RawKey[],
      ], // rotation y: pi/2 -> -pi
      [
        7,
        [
          [1411, 0, 0, 0],
          [1411, 30, 0, 0],
        ] as RawKey[],
      ], // translation y: 88.1875
    ]),
  ],
  1,
  10,
);
const HEAD = motion([
  new Map([
    [
      0,
      [
        [16, 0, 0, 0],
        [32, 30, 0, 0],
      ] as RawKey[],
    ],
  ]),
]);

test("readMotionBank reads tables, empty slots and each motion's header", () => {
  const buf = bank([[null, BODY], [null], [null, HEAD], [null]]);
  assert.ok(isMotionBank(buf));
  const tables = readMotionBank(buf);
  assert.deepEqual(
    tables.map((t) => t.length),
    [2, 1, 2, 1],
  );
  assert.equal(tables[0]![0], null);
  const body = tables[0]![1]!;
  assert.equal(body.loop, true);
  assert.equal(body.loopStart, 10);
  assert.equal(body.frames, 30);
  assert.equal(body.bones.length, 2);
  assert.deepEqual(body.bones[0], []);
});

test("channels decode to radians, model units and scale factors", () => {
  const tables = readMotionBank(bank([[BODY], [null], [HEAD], [null]]));
  const [rotation, translation] = tables[0]![0]!.bones[1]!;
  assert.equal(rotation!.property, "rotation");
  assert.equal(rotation!.axis, 1);
  assert.deepEqual(
    rotation!.keys.map((k) => k.value),
    [Math.PI / 2, -Math.PI],
  );
  assert.equal(translation!.property, "translation");
  assert.equal(translation!.axis, 1);
  assert.equal(translation!.keys[0]!.value, 1411 / 16);
  const [scale] = tables[2]![0]!.bones[0]!;
  assert.equal(scale!.property, "scale");
  assert.equal(scale!.axis, 0);
  assert.deepEqual(
    scale!.keys.map((k) => k.value),
    [1, 2],
  );
});

test("partMotions numbers a part's motions across its two tables", () => {
  const tables = readMotionBank(bank([[BODY], [null, BODY], [HEAD], [null]]));
  assert.equal(partMotions(tables, 0).length, 3);
  assert.equal(partMotions(tables, 0)[1], null);
  assert.equal(partMotions(tables, 1).length, 2);
  assert.deepEqual(partMotions(tables, 2), []);
});

test("isMotionBank rejects other package entries", () => {
  assert.equal(isMotionBank(u32s(0xc0000000, 0, 0x20, 0, 2, 0x14, 0, 0)), false);
  assert.equal(isMotionBank(Buffer.from("pmo\x001.0\x00\x00\x00\x00\x00\x00\x00\x00\x00")), false);
  assert.equal(isMotionBank(u32s(1, 16, 0, 20, 0x12345678)), false);
});

test("readMotionBank rejects a bone record that overruns its size", () => {
  const broken = Buffer.from(BODY);
  broken.writeUInt32LE(4, 0x14 + 8); // first bone claims 4 bytes, less than its header
  assert.throws(() => readMotionBank(bank([[broken]])), /bone 0 ends/);
});

test("sampleChannel interpolates with Hermite tangents and holds outside the keys", () => {
  const key = (frame: number, value: number, tangent = 0): MotionKey => ({
    frame,
    value,
    tangentIn: tangent,
    tangentOut: tangent,
  });
  const flat = [key(0, 0), key(10, 10)];
  assert.equal(sampleChannel(flat, -5), 0);
  assert.equal(sampleChannel(flat, 5), 5); // smoothstep midpoint
  assert.ok(sampleChannel(flat, 2) < 2); // eases in
  assert.equal(sampleChannel(flat, 20), 10);
  // Tangents equal to the slope make it linear.
  const linear = [key(0, 0, 1), key(10, 10, 1)];
  assert.ok(Math.abs(sampleChannel(linear, 2) - 2) < 1e-9);
});
