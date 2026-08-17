import assert from "node:assert/strict";
import { test } from "node:test";
import { BinaryReader, readPointer, vaddrToOffset } from "../src/binary/reader.js";

test("BinaryReader reads little-endian integers", () => {
  const buf = Buffer.from([0x01, 0x02, 0xff, 0x7f, 0x00, 0x00, 0x80, 0x3f]);
  const r = new BinaryReader(buf);
  assert.equal(r.u8(0), 0x01);
  assert.equal(r.u16(0), 0x0201);
  assert.equal(r.s8(2), -1);
  assert.equal(r.u32(0), 0x7fff0201);
  assert.equal(r.f32(4), 1);
});

test("BinaryReader throws on out-of-bounds reads", () => {
  const r = new BinaryReader(Buffer.alloc(4));
  assert.throws(() => r.u32(2), RangeError);
  assert.throws(() => r.u8(-1), RangeError);
});

test("BinaryReader.fixedString trims at first NUL", () => {
  const buf = Buffer.from("abc\0\0\0");
  const r = new BinaryReader(buf);
  assert.equal(r.fixedString(0, 6), "abc");
});

test("BinaryReader.cString reads until NUL or maxLength", () => {
  const buf = Buffer.from("hello\0world");
  const r = new BinaryReader(buf);
  assert.equal(r.cString(0), "hello");
  assert.equal(r.cString(6), "world");
});

test("vaddrToOffset and readPointer resolve against a base address", () => {
  const base = 0x08801a4c;
  assert.equal(vaddrToOffset(0x08804000, base), 0x25b4);

  const buf = Buffer.alloc(8);
  buf.writeUInt32LE(0x08804000, 0);
  const r = new BinaryReader(buf);
  assert.equal(readPointer(r, 0, base), 0x25b4);
});
