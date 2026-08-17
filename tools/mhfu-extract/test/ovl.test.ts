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
