import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_OBJECTS } from "../src/blob/demo-object.js";
import { BLOB_MAGIC, HEADER, decodeObjects, linkBlob } from "../src/blob/link.js";
import { Edits } from "../src/edits.js";
import type { GameData, LoadedOverlay } from "../src/game/load.js";
import {
  BLOB_DEVICE_PATH,
  BLOB_ISO_PATH,
  NIDS,
  REASON,
  STATUS,
  addCodeLoader,
  assembleLoader,
  findImports,
  findSites,
  type Imports,
} from "../src/patches/code-loader.js";
import {
  CARD_BYTES,
  CARDS,
  COMPACT_SIGNATURE,
  COMPACT_WORDS,
  GAME_CARDS,
  GuildCardSpace,
  SAVE_INIT_SIGNATURE,
  guildCardSpace,
} from "../src/patches/guild-card-space.js";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import {
  HOOK,
  MENU,
  PAD_READ_SIGNATURE,
  assembleHooks,
  assemblePickHook,
  findPadSites,
  type MenuSites,
} from "../src/patches/game-hooks.js";
import { PICKER_SIGNATURE, poogieObjects } from "../src/patches/poogie-luck.js";
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

const demoObjects = () => decodeObjects(DEMO_OBJECTS);
const demo = () => linkBlob(demoObjects(), BLOB, {}, ROOM);

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

test("rf_init may use the O32 argument area in the loader's frame", () => {
  const blob = demo();
  const { cpu, loader } = machine(blob.image);
  const buffer = saveFile(cpu, 0);
  let ran = false;
  // An O32 callee may store $a0-$a3 at its caller's sp+0..15.
  cpu.native.set(blob.image.readUInt32LE(HEADER.init), (c) => {
    const sp = c.reg[29]! >>> 0;
    for (let k = 0; k < 16; k += 4) c.setU32(sp + k, 0xdeadbeef);
    ran = true;
    return 0;
  });
  for (const r of [16, 17, 18, 19]) cpu.reg[r] = 0x2000 + r;
  cpu.reg[29] = 0x09fff000;
  cpu.call(loader.afterLoad, [SAVE + 0x4a0, buffer, 0x6a938]);
  assert.ok(ran);
  for (const r of [16, 17, 18, 19]) assert.equal(cpu.reg[r], 0x2000 + r);
  assert.equal(cpu.reg[2]! >>> 0, SAVE + 0x4a0, "memcpy's result is still passed through");
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

/**
 * A small EBOOT with everything the patch looks for, laid out as the game's:
 * the compaction, the save's setup and its one caller, seven card loops (one
 * with the free count), the two save loads, the new character's clear, and
 * the imports. `arenas` gives each caller of the save setup its arena.
 */
function syntheticGame(arenas: number[] = [0x08a8c500], s0Between = false) {
  const VADDR = 0x08804000;
  const OFFSET = 0x100;
  const elf = Buffer.alloc(OFFSET + 0x1000);
  elf.writeUInt32LE(0x464c457f, 0);
  elf.writeUInt32LE(0x34, 0x1c);
  elf.writeUInt16LE(1, 0x2c);
  elf.writeUInt32LE(1, 0x34); // PT_LOAD
  elf.writeUInt32LE(OFFSET, 0x34 + 4);
  elf.writeUInt32LE(VADDR, 0x34 + 8);
  elf.writeUInt32LE(OFFSET + 0x100, 0x34 + 12); // p_paddr: the module info
  elf.writeUInt32LE(0x1000, 0x34 + 16);
  const put = (at: number, words: readonly number[]) =>
    words.forEach((w, k) => elf.writeUInt32LE(w >>> 0, OFFSET + at + k * 4));
  const vaddr = (at: number) => VADDR + at;
  const jal = (target: number) => (0x0c000000 | ((target >>> 2) & 0x03ffffff)) >>> 0;
  const memcpy = vaddr(0x0);
  const memset = vaddr(0x10);

  // Imports: one library with the loader's five NIDs.
  const nids = Object.values(NIDS);
  put(0x100 + 0x2c, [vaddr(0x140), vaddr(0x154)]);
  elf[OFFSET + 0x140 + 8] = 5;
  elf.writeUInt16LE(nids.length, OFFSET + 0x140 + 10);
  put(0x140 + 12, [vaddr(0x160), vaddr(0x180)]);
  put(0x160, nids);
  const stubs = Object.fromEntries(
    Object.keys(NIDS).map((name, k) => [name, vaddr(0x180 + k * 8)]),
  ) as Imports;

  // The save setup stores its argument in the save pointer global.
  const savePointer = 0x089cc438;
  const saveInit = vaddr(0x200);
  const init = [...SAVE_INIT_SIGNATURE];
  init[4] = 0x3c020000 | ((savePointer + 0x8000) >>> 16);
  init[5] = 0xac500000 | (savePointer & 0xffff);
  put(0x200, init);
  arenas.forEach((arena, k) => {
    const inArena = SAVE - 0x08a8c500;
    put(0x240 + k * 0x20, [
      0x3c100000 | ((arena + 0x8000) >>> 16), // lui s0
      0x26100000 | (arena & 0xffff), // addiu s0, s0
      s0Between ? 0x02208021 : 0, // move s0, s1
      0x3c010000 | (inArena >>> 16), // lui at
      0x34210000 | (inArena & 0xffff), // ori at, at
      jal(saveInit),
      0x02012021, // addu a0, s0, at
    ]);
  });
  // A caller of another shape (its pointer in a register) is passed over.
  put(0x2e0, [0x02202021, jal(saveInit), 0]); // move a0, s1; jal; nop

  // Seven card loops; the first has the free count after it.
  for (let k = 0; k < 7; k++) {
    put(0x300 + k * 0x20, [0x2a020060, 0x26731078]); // slti v0, s0, 96; addiu s3, s3, 4216
  }
  put(0x308, [0x24020060]); // addiu v0, zero, 96

  // The sites, each in a function of its own that keeps $ra on the stack.
  const fn = (at: number, site: number[]) =>
    put(at, [
      0x27bdfff8, // addiu sp, sp, -8
      0xafbf0004, // sw ra, 4(sp)
      ...site,
      0x8fbf0004, // lw ra, 4(sp)
      0x03e00008, // jr ra
      0x27bd0008, // addiu sp, sp, 8
    ]);
  const loadSites = [0x400, 0x440];
  for (const at of loadSites) fn(at, [0x24451000, 0x3c020006, jal(memcpy), 0x3446a938]);
  fn(0x480, [0x26044a58, 0x00002821, jal(memset), 0x34462d00]);

  // The compaction: its signature, then its last two words.
  put(0x800, COMPACT_SIGNATURE);
  put(0x800 + (COMPACT_WORDS - 2) * 4, [0x03e00008, 0x27bd0040]);

  const gameSub = Buffer.alloc(0x40);
  gameSub.writeUInt32LE(0x2a020060, 0x10);
  gameSub.writeUInt32LE(0x26731078, 0x14);
  const sub: LoadedOverlay = { index: 7, ovl: {} as LoadedOverlay["ovl"] };
  const game = { eboot: elf, dataBin: { read: () => gameSub } } as unknown as GameData;
  return {
    elf,
    edits: new Edits(game),
    sub,
    VADDR,
    OFFSET,
    memcpy,
    memset,
    stubs,
    loadSites: loadSites.map(vaddr),
    newGameSite: vaddr(0x480),
  };
}

test("addCodeLoader patches the sites to load the blob it adds to the disc", () => {
  const g = syntheticGame();
  const report = addCodeLoader(g.elf, g.sub, g.edits, { objects: demoObjects() });
  assert.match(report.summary ?? "", /: on /, report.summary);
  assert.equal(report.applied, true);
  assert.equal(report.kept, 3);
  // The blob's room stops short of the last slot, randomfu's save data.
  assert.match(report.summary ?? "", new RegExp(` of ${(GAME_CARDS - 4) * CARD_BYTES} bytes`));
  const file = g.edits.discFiles.get(BLOB_ISO_PATH)!;
  assert.ok(file, "the blob is added to the disc");

  // The patched EBOOT and game_sub: three cards kept everywhere.
  const eboot = g.edits.eboot();
  for (let k = 0; k < 7; k++) {
    assert.equal(eboot.readUInt32LE(g.OFFSET + 0x300 + k * 0x20) & 0xffff, 3);
  }
  assert.equal(eboot.readUInt32LE(g.OFFSET + 0x308) & 0xffff, 3, "the free count");
  assert.equal(g.edits.files.get(7)!.readUInt32LE(0x10) & 0xffff, 3, "game_sub's loop");

  // Run the patched code: each site makes the game's call, then loads the blob.
  const cpu = new Cpu();
  cpu.write(g.VADDR, eboot.subarray(g.OFFSET, g.OFFSET + 0x1000));
  const arg = (k: number) => cpu.reg[4 + k]! >>> 0;
  cpu.native.set(g.memcpy, (c) => (c.write(arg(0), c.bytes(arg(1), arg(2))), arg(0)));
  cpu.native.set(g.memset, (c) => (c.fill(arg(0), arg(2), arg(1)), arg(0)));
  cpu.native.set(g.stubs.sceIoOpen, (c) => (c.string(arg(0)) === BLOB_DEVICE_PATH ? 3 : -1));
  cpu.native.set(g.stubs.sceIoRead, (c) => {
    const n = Math.min(file.length, arg(2));
    c.write(arg(1), file.subarray(0, n));
    return n;
  });
  for (const name of [
    "sceIoClose",
    "sceKernelDcacheWritebackAll",
    "sceKernelIcacheInvalidateAll",
  ]) {
    cpu.native.set(g.stubs[name as keyof Imports], () => 0);
  }

  for (const site of g.loadSites) {
    const buffer = 0x08b00000;
    cpu.fill(buffer, 0x100, 0);
    cpu.setU32(buffer + 0x1000 + ZENNY - 0x4a0, 500);
    cpu.reg[2] = buffer; // the site adds 0x1000
    cpu.call(site, [SAVE + 0x4a0]);
    assert.equal(cpu.u32(SAVE + ZENNY), 1500, `site 0x${site.toString(16)}`);
    assert.equal(cpu.u32(BLOB + HEADER.magic), BLOB_MAGIC);
  }

  cpu.fill(BLOB, 0x40, 0xff);
  cpu.reg[2] = 0x00060000; // the clear's size comes from v0 | 0x2D00
  cpu.reg[16] = SAVE; // the site's s0
  cpu.call(g.newGameSite);
  assert.equal(cpu.u32(SAVE + CARDS), 0, "the cards were cleared");
  assert.equal(cpu.u32(BLOB + HEADER.magic), BLOB_MAGIC, "then the blob loaded");
});

test("addCodeLoader patches nothing unless every save setup call agrees on the arena", () => {
  for (const [why, g] of [
    ["two arenas", syntheticGame([0x08a8c500, 0x08a90000])],
    ["s0 written in between", syntheticGame([0x08a8c500], true)],
  ] as const) {
    const report = addCodeLoader(g.elf, g.sub, g.edits, { objects: demoObjects() });
    assert.match(report.summary ?? "", /not applied/, why);
    assert.equal(g.edits.discFiles.size, 0, why);
    assert.ok(g.edits.eboot().equals(g.elf), why);
  }
});

test("addCodeLoader with only the pad hook and the picker: Poogie's luck needs no HUD code", () => {
  const g = syntheticGame();
  const at = (offset: number) => g.OFFSET + offset;
  PAD_READ_SIGNATURE.forEach((w, k) => g.elf.writeUInt32LE(w, at(0xd80 + k * 4)));
  const ctrlRead = g.VADDR + 0xd00;
  g.elf.writeUInt32LE(0x0c000000 | (ctrlRead >>> 2), at(0xd80 + 0x14)); // padRead's jal
  PICKER_SIGNATURE.forEach((w, k) => g.elf.writeUInt32LE(w, at(0xe00 + k * 4)));
  const pads = findPadSites(g.elf);
  assert.ok(typeof pads !== "string", String(pads));
  assert.equal(pads.ctrlRead, ctrlRead);
  const picker = g.VADDR + 0xe00;
  const report = addCodeLoader(g.elf, g.sub, g.edits, {
    objects: [...decodeObjects(RUNTIME_OBJECTS), ...poogieObjects()],
    hooks: { sites: pads, pick: { picker, prologue: [0x27bdffe0, 0xafbf001c] } },
    externs: { rf_pick_rand: 0x088900c4, rf_pick_rng: 0x08a631a0, rf_poogie_test_rolls: 1 },
  });
  assert.equal(report.applied, true, report.summary);
  const pickAt = Number(/picker (0x[0-9a-f]+)/.exec(report.summary ?? "")?.[1]);
  const eboot = g.edits.eboot();
  assert.equal(eboot.readUInt32LE(at(0xe00)), 0x08000000 | (pickAt >>> 2), "j stub");
  assert.equal(eboot.readUInt32LE(at(0xe04)), 0, "nop");
  const ctrlCall = eboot.readUInt32LE(at(0xd80 + 0x14));
  assert.equal(ctrlCall >>> 26, 0x03);
  assert.notEqual(
    ((ctrlCall & 0x03ffffff) << 2) | 0x08000000,
    ctrlRead,
    "the pad call goes to a stub",
  );
  assert.equal(g.edits.files.size, 1, "only game_sub (the card loop) changes, not game_task");
});

test("addCodeLoader points lobby_task's quest card call at a stub that runs hook 6", () => {
  const g = syntheticGame();
  const at = (offset: number) => g.OFFSET + offset;
  PAD_READ_SIGNATURE.forEach((w, k) => g.elf.writeUInt32LE(w, at(0xd80 + k * 4)));
  const ctrlRead = g.VADDR + 0xd00;
  g.elf.writeUInt32LE(0x0c000000 | (ctrlRead >>> 2), at(0xd80 + 0x14)); // padRead's jal
  const pads = findPadSites(g.elf);
  assert.ok(typeof pads !== "string", String(pads));
  // lobby_task: any DATA.BIN file reads as the synthetic game_sub; the call is at +0x20.
  const lobbyTask: LoadedOverlay = { index: 9, ovl: {} as LoadedOverlay["ovl"] };
  const card = 0x09a8ca40;
  const report = addCodeLoader(g.elf, g.sub, g.edits, {
    objects: decodeObjects(RUNTIME_OBJECTS),
    hooks: { sites: pads, questCard: { call: 0x20, card, lobbyTask } },
  });
  assert.equal(report.applied, true, report.summary);
  const target = (w: number) => (((w & 0x03ffffff) << 2) | 0x08000000) >>> 0;
  const eboot = g.edits.eboot();
  const call = g.edits.overlay(lobbyTask).readUInt32LE(0x20);
  assert.equal(call >>> 26, 0x03, "a jal");
  const stub = (vaddr: number) => (k: number) => eboot.readUInt32LE(at(vaddr - g.VADDR + k * 4));
  // A stub: addiu sp; sw ra; jal target; sw a0; sw v0; lw a0; jal dispatch; addiu a1, zero, hook.
  const cardStub = stub(target(call));
  assert.equal(target(cardStub(2)), card, "the card stub calls the card");
  assert.equal(cardStub(7), 0x24050000 | HOOK.questCard, "and dispatches hook 6");
  const padStub = stub(target(eboot.readUInt32LE(at(0xd80 + 0x14))));
  assert.equal(target(padStub(2)), ctrlRead, "the pad call keeps its own stub");
  assert.equal(padStub(7), 0x24050000 | HOOK.pad);
});

test("addCodeLoader takes nothing when other features left too little room", () => {
  for (const [why, take] of [
    ["no slots", (space: GuildCardSpace) => space.allocateSlots(null)],
    ["too few cave words", (space: GuildCardSpace) => space.allocateCave(space.freeCaveWords - 10)],
  ] as const) {
    const g = syntheticGame();
    const space = guildCardSpace(g.elf, g.sub, g.edits);
    assert.ok(typeof space !== "string");
    take(space);
    const before = Buffer.from(g.edits.eboot());
    const caveWords = space.freeCaveWords;
    const slots = space.freeSlots;
    const report = addCodeLoader(g.elf, g.sub, g.edits, { objects: demoObjects() });
    assert.equal(report.applied, false, why);
    assert.match(report.summary ?? "", /not applied/, why);
    assert.equal(g.edits.discFiles.size, 0, why);
    assert.ok(g.edits.eboot().equals(before), `${why}: the EBOOT is as the other feature left it`);
    assert.equal(space.freeCaveWords, caveWords, why);
    assert.deepEqual(space.freeSlots, slots, why);
  }
});

test("the cave holds the loader with every hook, or with the START menus and the default hooks and call", () => {
  const g = syntheticGame();
  const space = guildCardSpace(g.elf, g.sub, g.edits);
  assert.ok(typeof space !== "string");
  const free = space.freeCaveWords;
  const imports = Object.fromEntries(
    Object.keys(NIDS).map((name, k) => [name, 0x08900000 + k * 8]),
  ) as unknown as Imports;
  const loader = assembleLoader(0, {
    ...{ saveStruct: 0x09999c60, blob: 0x099a1820, room: 0x60000, build: 1 },
    ...{ memcpy: 0x08800000, memset: 0x08800010, imports },
  }).code.length;
  const pick = assemblePickHook(0, 0x099a1820, { picker: 0x08872654, prologue: [0, 0] }).length;
  const call = (target: number) => ({ call: 0x08810000, target });
  const menus: MenuSites[] = [MENU.quest, MENU.village].map((menu) => ({
    ...{ menu, entry: 11, placeholder: 0x78, label: call(0x09a63198) },
    ...{ select: call(0x08849120), run: call(0x08849214), draw: call(0x0883fad4) },
  }));
  const base = [HOOK.questFrame, HOOK.hud, HOOK.pad, HOOK.rewards].map((hook) => ({
    hook,
    target: 0x08840000 + hook * 0x100,
  }));
  const words = (o: { card?: boolean; load?: boolean; hit?: boolean; menus?: boolean }) =>
    loader +
    pick +
    assembleHooks(
      0,
      0x099a1820,
      o.card ? [...base, { hook: HOOK.questCard, target: 0x09a8ca40 }] : base,
      o.load ? 0x08870aec : undefined,
      o.hit ? 0x09c44f08 : undefined,
      o.menus ? menus : [],
      // Send All to Item Box's label call, on by default with the menus.
      o.menus ? [call(0x08810100)] : [],
    ).code.length;
  // randomize leaves the menus (and the features only they turn on) out when they don't fit.
  const all = words({ card: true, load: true, hit: true });
  assert.ok(all <= free, `every option on but the menus: ${all} of ${free} words`);
  const defaults = words({ hit: true, menus: true });
  assert.ok(
    defaults <= free,
    `Poogie's luck, the START menus and Send All: ${defaults} of ${free} words`,
  );
});
