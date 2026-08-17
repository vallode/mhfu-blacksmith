import assert from "node:assert/strict";
import { test } from "node:test";
import { OVL_HEADER_SIZE, OvlFormatError, parseOvl } from "../src/container/ovl.js";

const LOAD_BASE = 0x09a5a580;

/** Builds a synthetic MWo3-framed buffer: header + `dataSize` bytes of mapped image. */
function buildOvl(options: { name?: string; loadBase?: number; loadEnd?: number; dataSize?: number } = {}): Buffer {
  const { name = "game_task.ovl", loadBase = LOAD_BASE, loadEnd = loadBase + 0x1000, dataSize = 0x200 } = options;
  const buf = Buffer.alloc(OVL_HEADER_SIZE + dataSize);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(0x0a, 0x04); // unk1, arbitrary
  buf.writeUInt32LE(loadBase, 0x08);
  buf.writeUInt32LE(0, 0x0c); // unk2
  buf.writeUInt32LE(0, 0x10); // unk3
  buf.writeUInt32LE(0, 0x14); // unk4
  buf.writeUInt32LE(0, 0x18); // unk5
  buf.writeUInt32LE(loadEnd, 0x1c);
  buf.write(name, 0x20, "latin1");
  return buf;
}

test("parseOvl reads the MWo3 header fields", () => {
  const ovl = parseOvl(buildOvl({ name: "game_task.ovl", loadBase: 0x09a5a580, loadEnd: 0x09c0c16c }));
  assert.equal(ovl.name, "game_task.ovl");
  assert.equal(ovl.loadBase, 0x09a5a580);
  assert.equal(ovl.loadEnd, 0x09c0c16c);
});

test("parseOvl rejects buffers without the MWo3 magic", () => {
  const buf = buildOvl();
  buf.write("XXXX", 0, "latin1");
  assert.throws(() => parseOvl(buf), OvlFormatError);
});

test("vaddrToOffset maps loadBase to the first byte after the header", () => {
  const ovl = parseOvl(buildOvl({ loadBase: LOAD_BASE }));
  assert.equal(ovl.vaddrToOffset(LOAD_BASE), OVL_HEADER_SIZE);
  assert.equal(ovl.vaddrToOffset(LOAD_BASE + 0x10), OVL_HEADER_SIZE + 0x10);
});

test("isOwnVaddr distinguishes this overlay's mapped range from foreign addresses", () => {
  const dataSize = 0x200;
  const ovl = parseOvl(buildOvl({ loadBase: LOAD_BASE, dataSize }));
  assert.equal(ovl.isOwnVaddr(LOAD_BASE), true);
  assert.equal(ovl.isOwnVaddr(LOAD_BASE + dataSize - 4), true);
  // Past the end of this overlay's own image — e.g. a pointer into a sibling
  // per-monster emXX.ovl mapped at a different (typically higher) vaddr.
  assert.equal(ovl.isOwnVaddr(LOAD_BASE + dataSize + 0x10000), false);
  assert.equal(ovl.isOwnVaddr(LOAD_BASE - 0x10000), false);
});

test("fields can be read via the underlying BinaryReader at vaddr-resolved offsets", () => {
  const ovl = parseOvl(buildOvl({ loadBase: LOAD_BASE }));
  const offset = ovl.vaddrToOffset(LOAD_BASE + 0x40);
  ovl.reader.buf.writeUInt32LE(0x12345678, offset);
  assert.equal(ovl.reader.u32(offset), 0x12345678);
});

// The following two tests pin down real, hand-verified ground truth found
// during the (parked) monster hitzone/reward investigation — see README
// "Monster overlays: hitzones and rewards" for the full writeup of what was
// found and why extraction couldn't be completed. These aren't full struct
// decoders (none exist yet); they just lock in the exact real bytes/vaddrs
// so future work has confirmed data to resume from without re-deriving it.

test("known real hitzone bytes: Felyne (monster ID 9) and Mosswine (monster ID 4) in game_task.ovl", () => {
  // Published low-rank hitzone rows for both monsters, confirmed byte-for-byte
  // against a real decrypted JP game_task.ovl at these exact file offsets.
  // This flat data pool is unrelated to EnemyData.hitPtr (+0x10C in the fixed
  // 464-byte-stride monster array) — hitPtr's value for these IDs points
  // elsewhere entirely.
  const felyneOffset = 0x165f19;
  const mosswineOffset = 0x165d89;
  const ovl = parseOvl(buildOvl({ loadBase: 0x09a5a580, dataSize: Math.max(felyneOffset, mosswineOffset) + 24 }));

  const felyneBytes = Buffer.from("787878646464640a64646464640000640000006464646400", "hex");
  const mosswineBytes = Buffer.from("969678646464640a00646464640000640000006464646400", "hex");
  felyneBytes.copy(ovl.reader.buf, felyneOffset);
  mosswineBytes.copy(ovl.reader.buf, mosswineOffset);

  assert.equal(ovl.vaddrToOffset(0x09bc0419), felyneOffset);
  assert.equal(ovl.vaddrToOffset(0x09bc0289), mosswineOffset);
  assert.ok(ovl.reader.buf.subarray(felyneOffset, felyneOffset + felyneBytes.length).equals(felyneBytes));
  assert.ok(ovl.reader.buf.subarray(mosswineOffset, mosswineOffset + mosswineBytes.length).equals(mosswineBytes));
});

test("known real reward bytes: Giaprey (monster ID 35) low-rank body carve table in game_sub.ovl", () => {
  // Published low-rank body carve table (52% Giaprey Scale/ItemID 340, 30%
  // Giaprey Hide/342, 18% Sm Monster Bone/281, 0xffff terminator), confirmed
  // byte-for-byte against a real decrypted JP game_sub.ovl at this exact file
  // offset. No static pointer/index-table entry referencing this address
  // could be found anywhere in the file.
  const giapreyOffset = 0xbb458;
  const ovl = parseOvl(buildOvl({ name: "game_sub.ovl", loadBase: 0x09c14280, dataSize: giapreyOffset + 24 }));

  const giapreyBytes = Buffer.from("340054011e00560112001901ffff00000a00210231001402", "hex");
  giapreyBytes.copy(ovl.reader.buf, giapreyOffset);

  assert.equal(ovl.vaddrToOffset(0x09ccf658), giapreyOffset);
  assert.ok(ovl.reader.buf.subarray(giapreyOffset, giapreyOffset + giapreyBytes.length).equals(giapreyBytes));

  const entries: Array<{ chance: number; itemId: number }> = [];
  for (let offset = giapreyOffset; ovl.reader.buf.readUInt16LE(offset) !== 0xffff; offset += 4) {
    entries.push({ chance: ovl.reader.buf.readUInt16LE(offset), itemId: ovl.reader.buf.readUInt16LE(offset + 2) });
  }
  assert.deepEqual(entries, [
    { chance: 52, itemId: 340 }, // Giaprey Scale
    { chance: 30, itemId: 342 }, // Giaprey Hide
    { chance: 18, itemId: 281 }, // Sm Monster Bone
  ]);
});
