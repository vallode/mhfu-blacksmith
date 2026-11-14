import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_OBJECTS } from "../src/blob/demo-object.js";
import {
  BLOB_HEADER_BYTES,
  BLOB_MAGIC,
  HEADER,
  linkBlob,
  type LinkedBlob,
} from "../src/blob/link.js";
import { LINK_TEST_OBJECTS } from "./link-test-object.js";
import { Cpu } from "./mips-cpu.js";

const objects = (list: readonly { name: string; base64: string }[]) =>
  list.map((o) => ({ name: o.name, data: Buffer.from(o.base64, "base64") }));

const BASE = 0x099a1820;
const SAVE = 0x09999c60;
const SCE_IO_CLOSE = 0x0890de70;

function run(blob: LinkedBlob) {
  const cpu = new Cpu();
  cpu.write(BASE, blob.image);
  cpu.native.set(SCE_IO_CLOSE, () => 0);
  return cpu;
}

test("the header carries the magic, size, entry points and a build id", () => {
  const blob = linkBlob(objects(LINK_TEST_OBJECTS), BASE, { sceIoClose: SCE_IO_CLOSE });
  const header = (field: number) => blob.image.readUInt32LE(field);
  assert.equal(header(HEADER.magic), BLOB_MAGIC);
  assert.equal(header(HEADER.size), blob.image.length);
  assert.equal(header(HEADER.init), blob.symbols.get("rf_init"));
  assert.equal(header(HEADER.hooks), blob.symbols.get("rf_hook0"));
  assert.equal(header(HEADER.hooks + 4), 0, "no rf_hook1");
  assert.notEqual(blob.build, 0);
  assert.equal(header(HEADER.build), blob.build);
  assert.ok(blob.symbols.get("rf_init")! >= BASE + BLOB_HEADER_BYTES);
});

test("linked code runs at its address: data, read-only data, zeroed data, calls and pointers", () => {
  const blob = linkBlob(objects(LINK_TEST_OBJECTS), BASE, { sceIoClose: SCE_IO_CLOSE });
  const cpu = run(blob);
  const init = blob.symbols.get("rf_init")!;
  // reason 1: helper(1) = 1 * 3 + table[1] = 23, + 'f' + calls
  cpu.call(init, [1, SAVE, BASE]);
  assert.equal(cpu.u32(SAVE + 0x10), 23 + 0x66 + 1);
  cpu.call(init, [0, SAVE, BASE]);
  assert.equal(cpu.u32(SAVE + 0x10), 10 + 0x66 + 2);
  assert.deepEqual(
    cpu.calls.map((c) => [c.address, c.args[0]]),
    [
      [SCE_IO_CLOSE, 1],
      [SCE_IO_CLOSE, 0],
    ],
  );
  assert.equal(cpu.call(blob.symbols.get("rf_hook0")!, [5]), 2 + 5);
});

test("the same object links at another address", () => {
  const eu = linkBlob(objects(LINK_TEST_OBJECTS), BASE, { sceIoClose: SCE_IO_CLOSE });
  const jp = linkBlob(objects(LINK_TEST_OBJECTS), 0x0999d560, { sceIoClose: 0x0890b918 });
  assert.equal(jp.image.length, eu.image.length);
  assert.notEqual(jp.build, eu.build);
  const cpu = new Cpu();
  cpu.write(0x0999d560, jp.image);
  cpu.native.set(0x0890b918, () => 0);
  cpu.call(jp.symbols.get("rf_init")!, [1, SAVE, 0x0999d560]);
  assert.equal(cpu.u32(SAVE + 0x10), 23 + 0x66 + 1);
});

test("the demo adds 1000 zenny after a save load and nothing for a new game", () => {
  const blob = linkBlob(objects(DEMO_OBJECTS), BASE);
  const cpu = new Cpu();
  cpu.write(BASE, blob.image);
  cpu.setU32(SAVE + 0x696f0, 8526);
  cpu.call(blob.symbols.get("rf_init")!, [0, SAVE, BASE]);
  assert.equal(cpu.u32(SAVE + 0x696f0), 9526);
  cpu.call(blob.symbols.get("rf_init")!, [1, SAVE, BASE]);
  assert.equal(cpu.u32(SAVE + 0x696f0), 9526);
});

test("undefined symbols and blobs too big for their room are errors", () => {
  assert.throws(() => linkBlob(objects(LINK_TEST_OBJECTS), BASE), /sceIoClose is undefined/);
  assert.throws(() => linkBlob(objects(DEMO_OBJECTS), BASE, {}, BLOB_HEADER_BYTES), /room for 64/);
});
