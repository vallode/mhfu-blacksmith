import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { DEMO_OBJECTS } from "../src/blob/demo-object.js";
import {
  BLOB_HEADER_BYTES,
  BLOB_MAGIC,
  HEADER,
  decodeObjects,
  linkBlob,
  type LinkedBlob,
} from "../src/blob/link.js";
import { COMMON_TEST_OBJECTS } from "./common-test-object.js";
import { LINK_TEST_OBJECTS } from "./link-test-object.js";
import { Cpu } from "./mips-cpu.js";

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
  const blob = linkBlob(decodeObjects(LINK_TEST_OBJECTS), BASE, { sceIoClose: SCE_IO_CLOSE });
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
  const blob = linkBlob(decodeObjects(LINK_TEST_OBJECTS), BASE, { sceIoClose: SCE_IO_CLOSE });
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
  const eu = linkBlob(decodeObjects(LINK_TEST_OBJECTS), BASE, { sceIoClose: SCE_IO_CLOSE });
  const jp = linkBlob(decodeObjects(LINK_TEST_OBJECTS), 0x0999d560, { sceIoClose: 0x0890b918 });
  assert.equal(jp.image.length, eu.image.length);
  assert.notEqual(jp.build, eu.build);
  const cpu = new Cpu();
  cpu.write(0x0999d560, jp.image);
  cpu.native.set(0x0890b918, () => 0);
  cpu.call(jp.symbols.get("rf_init")!, [1, SAVE, 0x0999d560]);
  assert.equal(cpu.u32(SAVE + 0x10), 23 + 0x66 + 1);
});

test("the demo adds 1000 zenny after a save load and nothing for a new game", () => {
  const blob = linkBlob(decodeObjects(DEMO_OBJECTS), BASE);
  const cpu = new Cpu();
  cpu.write(BASE, blob.image);
  cpu.setU32(SAVE + 0x696f0, 8526);
  cpu.call(blob.symbols.get("rf_init")!, [0, SAVE, BASE]);
  assert.equal(cpu.u32(SAVE + 0x696f0), 9526);
  cpu.call(blob.symbols.get("rf_init")!, [1, SAVE, BASE]);
  assert.equal(cpu.u32(SAVE + 0x696f0), 9526);
});

test("undefined symbols and blobs too big for their room are errors", () => {
  assert.throws(() => linkBlob(decodeObjects(LINK_TEST_OBJECTS), BASE), /sceIoClose is undefined/);
  assert.throws(
    () => linkBlob(decodeObjects(DEMO_OBJECTS), BASE, {}, BLOB_HEADER_BYTES),
    /room for 64/,
  );
});

test("a common symbol is the same object as a definition of its name, or of another common", () => {
  const blob = linkBlob(decodeObjects(COMMON_TEST_OBJECTS), BASE);
  const shared = blob.symbols.get("shared")!;
  const alsoCommon = blob.symbols.get("also_common")!;
  assert.equal(blob.image.readUInt32LE(shared - BASE), 7, "the definition, not a fresh common");
  assert.ok(alsoCommon >= BASE + BLOB_HEADER_BYTES && alsoCommon < BASE + blob.image.length);
  const cpu = run(blob);
  assert.equal(cpu.call(blob.symbols.get("rf_init")!), 7);
  cpu.setU32(alsoCommon, 5);
  assert.equal(cpu.call(blob.symbols.get("rf_init")!), 12, "both files' also_common are one");
});

test("every feature's callbacks fit a hook's room, with all of them linked", () => {
  const blob = new URL("../blob/", import.meta.url);
  const room = Number(
    /#define PER_HOOK (\d+)/.exec(readFileSync(new URL("runtime.c", blob), "utf8"))![1],
  );
  const perHook = new Map<string, number>();
  for (const file of readdirSync(blob).filter((f) => f.endsWith(".c"))) {
    const source = readFileSync(new URL(file, blob), "utf8");
    for (const [, hook] of source.matchAll(/rf_on\((RF_HOOK_\w+)/g)) {
      perHook.set(hook!, (perHook.get(hook!) ?? 0) + 1);
    }
  }
  assert.ok(perHook.size > 0);
  // rf_on drops a callback past the room without a word.
  for (const [hook, count] of perHook) assert.ok(count <= room, `${hook}: ${count} of ${room}`);
});
