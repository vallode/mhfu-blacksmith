import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_OBJECTS } from "../src/blob/demo-object.js";
import { BLOB_MAGIC, HEADER, linkBlob } from "../src/blob/link.js";
import {
  BLOB_DEVICE_PATH,
  NIDS,
  REASON,
  STATUS,
  assembleLoader,
  findImports,
  findSites,
  type Imports,
} from "../src/patches/code-loader.js";
import { CARD_BYTES, CARDS, GAME_CARDS } from "../src/patches/guild-card-space.js";
import { Cpu } from "./mips-cpu.js";

const SAVE = 0x09999c60;
const BLOB = SAVE + CARDS + 3 * CARD_BYTES;
const ROOM = (GAME_CARDS - 3) * CARD_BYTES;
const LOADER = 0x08901b8c;
const MEMCPY = 0x0880c084;
const MEMSET = 0x0880c464;
const ZENNY = 0x696f0;
const IMPORTS: Imports = {
  sceIoOpen: 0x0890de90,
  sceIoRead: 0x0890de60,
  sceIoClose: 0x0890de70,
  sceKernelDcacheWritebackAll: 0x0890e070,
  sceKernelIcacheInvalidateAll: 0x0890e080,
};

const demo = () =>
  linkBlob(
    DEMO_OBJECTS.map((o) => ({ name: o.name, data: Buffer.from(o.base64, "base64") })),
    BLOB,
    {},
    ROOM,
  );

/** The loader in a CPU whose disc holds `file` (null: no file) and whose memcpy and memset work. */
function machine(file: Buffer | null, build = demo().build) {
  const cpu = new Cpu();
  const loader = assembleLoader(LOADER, {
    saveStruct: SAVE,
    blob: BLOB,
    room: ROOM,
    build,
    memcpy: MEMCPY,
    memset: MEMSET,
    imports: IMPORTS,
  });
  cpu.load(LOADER, loader.code);
  const arg = (k: number) => cpu.reg[4 + k]! >>> 0;
  cpu.native.set(MEMCPY, (c) => {
    c.write(arg(0), c.bytes(arg(1), arg(2)));
    return arg(0);
  });
  cpu.native.set(MEMSET, (c) => {
    c.fill(arg(0), arg(2), arg(1));
    return arg(0);
  });
  const opened: string[] = [];
  cpu.native.set(IMPORTS.sceIoOpen, (c) => {
    opened.push(c.string(arg(0)));
    return file && c.string(arg(0)) === BLOB_DEVICE_PATH && arg(1) === 1 ? 3 : -1;
  });
  cpu.native.set(IMPORTS.sceIoRead, (c) => {
    assert.equal(arg(0), 3);
    const n = Math.min(file!.length, arg(2));
    c.write(arg(1), file!.subarray(0, n));
    return n;
  });
  cpu.native.set(IMPORTS.sceIoClose, () => 0);
  cpu.native.set(IMPORTS.sceKernelDcacheWritebackAll, () => 0);
  cpu.native.set(IMPORTS.sceKernelIcacheInvalidateAll, () => 0);
  return { cpu, loader, opened };
}

/** A save's character data with `zenny`, and the old Guild Card bytes in the blob's room. */
function saveFile(cpu: Cpu, zenny: number): number {
  const buffer = 0x08b00000;
  cpu.fill(buffer, 0x100, 0);
  cpu.setU32(buffer + ZENNY - 0x4a0, zenny);
  cpu.fill(buffer + CARDS - 0x4a0 + 3 * CARD_BYTES, 64, 0x5a);
  return buffer;
}

const nativeCalls = (cpu: Cpu) =>
  cpu.calls.map(
    (c) => Object.entries({ ...IMPORTS, MEMCPY, MEMSET }).find(([, a]) => a === c.address)?.[0],
  );

test("after a save load the loader copies the save, then loads the blob and runs it", () => {
  const blob = demo();
  const { cpu, loader } = machine(blob.image);
  cpu.reg[2] = 0;
  const buffer = saveFile(cpu, 8526);
  // The site: memcpy(save + 0x4A0, buffer, 0x6A938), with the loader in its place.
  const v0 = cpu.call(loader.afterLoad, [SAVE + 0x4a0, buffer, 0x6a938]);
  assert.equal(v0, SAVE + 0x4a0, "memcpy's result is passed through");
  assert.equal(cpu.u32(SAVE + ZENNY), 8526 + 1000, "the demo ran after the copy");
  assert.deepEqual(cpu.bytes(BLOB, blob.image.length), blob.image);
  assert.deepEqual(nativeCalls(cpu), [
    "MEMCPY",
    "sceIoOpen",
    "sceIoRead",
    "sceIoClose",
    "sceKernelDcacheWritebackAll",
    "sceKernelIcacheInvalidateAll",
  ]);
  assert.deepEqual(cpu.calls[2]!.args, [3, BLOB, ROOM]);
  const status = (k: number) => cpu.u32(loader.status + k);
  assert.equal(status(STATUS.runs), 1);
  assert.equal(status(STATUS.reason), REASON.saveLoaded);
  assert.equal(status(STATUS.open), 3);
  assert.equal(status(STATUS.read), blob.image.length);

  // Loading again reads the blob again over whatever the save held.
  cpu.calls.length = 0;
  cpu.call(loader.afterLoad, [SAVE + 0x4a0, buffer, 0x6a938]);
  assert.equal(cpu.u32(SAVE + ZENNY), 8526 + 1000);
  assert.equal(nativeCalls(cpu).length, 6);
  assert.equal(status(STATUS.runs), 2);
});

test("callee-saved registers and the stack survive the loader", () => {
  const { cpu, loader } = machine(demo().image);
  const buffer = saveFile(cpu, 0);
  for (const r of [16, 17, 18, 19, 20, 21, 22, 23, 30]) cpu.reg[r] = 0x1000 + r;
  cpu.reg[29] = 0x09fff000;
  cpu.call(loader.afterLoad, [SAVE + 0x4a0, buffer, 0x6a938]);
  for (const r of [16, 17, 18, 19, 20, 21, 22, 23, 30]) assert.equal(cpu.reg[r], 0x1000 + r);
  assert.equal(cpu.reg[29], 0x09fff000);
});

test("a new game clears the cards, then loads the blob with its own reason", () => {
  const blob = demo();
  const { cpu, loader } = machine(blob.image);
  cpu.setU32(SAVE + ZENNY, 300);
  cpu.call(loader.afterNewGame, [SAVE + CARDS, 0, GAME_CARDS * CARD_BYTES]);
  assert.equal(cpu.u32(SAVE + ZENNY), 300, "the demo only acts on save loads");
  assert.equal(cpu.u32(BLOB + HEADER.magic), BLOB_MAGIC);
  assert.equal(nativeCalls(cpu)[0], "MEMSET");
  assert.equal(REASON.newGame, 1);
});

test("a missing, stale, cut or oversized file leaves no blob behind", () => {
  const blob = demo();
  const cut = blob.image.subarray(0, blob.image.length - 4);
  const stale = Buffer.from(blob.image);
  stale.writeUInt32LE((blob.build ^ 1) >>> 0, HEADER.build);
  const big = Buffer.concat([blob.image, Buffer.alloc(ROOM)]);
  for (const [why, file] of [
    ["missing", null],
    ["stale", stale],
    ["cut", cut],
    ["oversized", big],
  ] as const) {
    const { cpu, loader } = machine(file, blob.build);
    const buffer = saveFile(cpu, 100);
    cpu.write(BLOB, blob.image); // a blob from before the load: must not survive
    cpu.call(loader.afterLoad, [SAVE + 0x4a0, buffer, 0x6a938]);
    assert.equal(cpu.u32(BLOB + HEADER.magic), 0, why);
    assert.equal(cpu.u32(SAVE + ZENNY), 100, why);
    assert.equal(cpu.u32(loader.status + STATUS.open), file ? 3 : 0xffffffff, why);
    assert.equal(
      cpu.u32(loader.status + STATUS.read),
      file ? Math.min(file.length, ROOM) : 0xffffffff,
      why,
    );
  }
});

test("save load and new game sites are found by their arguments", () => {
  const code = Buffer.alloc(0x100);
  const put = (at: number, words: number[]) =>
    words.forEach((w, k) => code.writeUInt32LE(w >>> 0, at + k * 4));
  const jal = (t: number) => (0x0c000000 | (t >>> 2)) >>> 0;
  put(0x10, [0x24451000, 0x3c020006, jal(MEMCPY), 0x3446a938]); // load
  put(0x30, [0x24441000, 0x3c020006, jal(MEMCPY), 0x3446a938]); // save: a0 is the buffer
  put(0x50, [0x26044a58, 0x00002821, jal(MEMSET), 0x34462d00]); // new game
  put(0x70, [0x24451000, 0x3c020006, jal(MEMCPY), 0x3446a938]);
  assert.deepEqual(findSites(code), { loads: [0x18, 0x78], newGame: [0x58] });
});

test("imports are found by NID through the module info", () => {
  const VADDR = 0x08804000;
  const elf = Buffer.alloc(0x400);
  elf.writeUInt32LE(0x464c457f, 0);
  elf.writeUInt32LE(0x34, 0x1c);
  elf.writeUInt32LE(0x100, 0x34 + 12); // p_paddr: the module info's file offset
  const segment = { offset: 0x100, vaddr: VADDR, size: 0x300 };
  const v = (offset: number) => VADDR + offset - 0x100;
  elf.writeUInt32LE(v(0x140), 0x100 + 0x2c); // stub table
  elf.writeUInt32LE(v(0x140 + 2 * 20), 0x100 + 0x30);
  const library = (at: number, nids: number[], nidsAt: number, stubs: number) => {
    elf[at + 8] = 5;
    elf.writeUInt16LE(nids.length, at + 10);
    elf.writeUInt32LE(v(nidsAt), at + 12);
    elf.writeUInt32LE(stubs, at + 16);
    nids.forEach((nid, k) => elf.writeUInt32LE(nid, nidsAt + k * 4));
  };
  library(0x140, [NIDS.sceIoRead, NIDS.sceIoOpen], 0x200, 0x0890de60);
  library(0x154, [NIDS.sceKernelIcacheInvalidateAll], 0x210, 0x0890e080);
  const stubs = findImports(elf, segment);
  assert.equal(stubs.get(NIDS.sceIoRead), 0x0890de60);
  assert.equal(stubs.get(NIDS.sceIoOpen), 0x0890de68);
  assert.equal(stubs.get(NIDS.sceKernelIcacheInvalidateAll), 0x0890e080);
});
