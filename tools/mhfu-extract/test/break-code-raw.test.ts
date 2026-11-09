import assert from "node:assert/strict";
import { test } from "node:test";
import { findAddressRefs } from "../src/emit/break-code-raw.js";

const lui = (rt: number, imm: number) => ((0x0f << 26) | (rt << 16) | imm) >>> 0;
const iType = (op: number, rs: number, rt: number, imm: number) =>
  ((op << 26) | (rs << 21) | (rt << 16) | (imm & 0xffff)) >>> 0;
const NOP = 0;

function code(words: number[]): Buffer {
  const buf = Buffer.alloc(words.length * 4);
  words.forEach((w, i) => buf.writeUInt32LE(w, i * 4));
  return buf;
}

const RANGE = { name: "capbreakindex", start: 0x09c0fff0, end: 0x09c10100 };

test("findAddressRefs pairs a lui with the instruction that adds its low half", () => {
  const buf = code([
    NOP,
    // lui a0, 0x09c1; nop; addiu a0, a0, -0x8 -> 0x09c0fff8 (sign-extended low half)
    lui(4, 0x09c1),
    NOP,
    iType(0x09, 4, 4, -0x8),
    // lui v0, 0x09c1; lhu t0, 0x10(v0) -> 0x09c10010
    lui(2, 0x09c1),
    iType(0x25, 2, 8, 0x10),
    // lui v1, 0x09c1; addiu v1, zero, 1 (overwrites v1); addiu t1, v1, 0x10 -> no ref
    lui(3, 0x09c1),
    iType(0x09, 0, 3, 1),
    iType(0x09, 3, 9, 0x10),
    // lui a1, 0x09c2; ori a1, a1, 0 -> outside the range
    lui(5, 0x09c2),
    iType(0x0d, 5, 5, 0),
  ]);
  const refs = findAddressRefs([{ name: "overlay/em11.ovl", buf }], [RANGE]);
  assert.deepEqual(
    refs.map((r) => [r.target, r.rangeOffset, r.hiAt, r.loAt, r.op]),
    [
      ["0x09c0fff8", "0x8", "0x00000004", "0x0000000c", "addiu"],
      ["0x09c10010", "0x20", "0x00000010", "0x00000014", "lhu"],
    ],
  );
  assert.equal(refs[0]!.file, "overlay/em11.ovl");
  assert.equal(refs[0]!.range, "capbreakindex");
  // The window starts at the file's start and runs 0x200 bytes past the lui.
  assert.equal(refs[0]!.windowAt, "0x00000000");
  assert.equal(refs[0]!.window, buf.toString("hex"));
});

test("a float load into the same register number doesn't end the pair", () => {
  const buf = code([
    lui(4, 0x09c1),
    // lwc1 f4, 0(sp): writes a float register, not a0
    iType(0x31, 29, 4, 0),
    iType(0x09, 4, 4, 0x20),
  ]);
  const refs = findAddressRefs([{ name: "eboot.bin", buf }], [RANGE]);
  assert.deepEqual(
    refs.map((r) => r.target),
    ["0x09c10020"],
  );
});
