import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFileList } from "mhfu-extract/src/container/filelist.js";
import { Edits } from "../src/edits.js";
import type { GameData } from "../src/game/load.js";
import { jalTo } from "../src/patches/mips.js";
import { OFFLINE_CALLS, disableOnline, offlineReport } from "../src/patches/no-online.js";

const VADDR = 0x08804000;
const CODE = 0x100;
const SIZE = 0x1000;
/** The module info, the import table, its NIDs and stubs (vaddrs in the segment). */
const INFO = VADDR + 0x800;
const IMPORTS = VADDR + 0x840;
const NIDS = VADDR + 0x880;
const STUBS = VADDR + 0x8c0;
const OTHER_NID = 0x12345678;
const SWITCH_STUB = STUBS;
const OTHER_STUB = STUBS + 8;
const INIT_STUB = STUBS + 16;
const NOP = 0;
const at = (vaddr: number) => CODE + vaddr - VADDR;

/** An EBOOT importing the switch, another function and `sceNetInit`, with calls at `code`. */
function eboot(code: Record<number, number>): Buffer {
  const elf = Buffer.alloc(CODE + SIZE);
  elf.writeUInt32LE(0x464c457f, 0);
  elf.writeUInt32LE(0x34, 0x1c);
  elf.writeUInt16LE(1, 0x2c);
  elf.writeUInt32LE(1, 0x34);
  elf.writeUInt32LE(CODE, 0x38);
  elf.writeUInt32LE(VADDR, 0x3c);
  elf.writeUInt32LE(at(INFO), 0x40); // p_paddr: the module info's file offset
  elf.writeUInt32LE(SIZE, 0x44);
  elf.writeUInt32LE(IMPORTS, at(INFO) + 0x2c);
  elf.writeUInt32LE(IMPORTS + 0x14, at(INFO) + 0x30);
  elf[at(IMPORTS) + 8] = 5; // entry size in words
  elf.writeUInt16LE(3, at(IMPORTS) + 10);
  elf.writeUInt32LE(NIDS, at(IMPORTS) + 12);
  elf.writeUInt32LE(STUBS, at(IMPORTS) + 16);
  [OFFLINE_CALLS[0].nid, OTHER_NID, OFFLINE_CALLS[1].nid].forEach((nid, k) =>
    elf.writeUInt32LE(nid, at(NIDS) + k * 4),
  );
  for (const [vaddr, word] of Object.entries(code)) elf.writeUInt32LE(word, at(Number(vaddr)));
  return elf;
}

const LOBBY = [...loadFileList("eu")].find(([, p]) => p === "overlay/lobby_task.ovl")![0];
const QUEST = [...loadFileList("eu")].find(([, p]) => p.startsWith("quest/"))?.[0] ?? 0;

function setUp(ebootCode: Record<number, number>, files: Map<number, Buffer>) {
  const game = {
    eboot: eboot(ebootCode),
    dataBin: { read: (i: number) => files.get(i) ?? Buffer.alloc(16) },
  } as unknown as GameData;
  return { game, edits: new Edits(game) };
}

test("every call to the switch and sceNetInit is cut, in the EBOOT and overlays", () => {
  const lobby = Buffer.alloc(0x40);
  lobby.writeUInt32LE(jalTo(SWITCH_STUB), 0x10);
  lobby.writeUInt32LE(jalTo(INIT_STUB), 0x20);
  lobby.writeUInt32LE(jalTo(OTHER_STUB), 0x30);
  // A non-overlay file with the same words isn't touched.
  const quest = Buffer.from(lobby);
  const { game, edits } = setUp(
    {
      [VADDR + 0x10]: jalTo(SWITCH_STUB),
      [VADDR + 0x14]: NOP,
      [VADDR + 0x20]: jalTo(OTHER_STUB),
      [VADDR + 0x30]: jalTo(INIT_STUB),
    },
    new Map([
      [LOBBY, lobby],
      [QUEST, quest],
    ]),
  );
  const result = disableOnline(game.eboot, "eu", 1 << 20, edits);
  assert.ok(typeof result !== "string", String(result));
  assert.equal(result.eboot, 2);
  assert.deepEqual([...result.overlays], [["overlay/lobby_task.ovl", 2]]);

  const out = edits.eboot();
  assert.equal(out.readUInt32LE(at(VADDR + 0x10)), 0x24020000); // li v0, 0: the switch is off
  assert.equal(out.readUInt32LE(at(VADDR + 0x20)), jalTo(OTHER_STUB));
  assert.equal(out.readUInt32LE(at(VADDR + 0x30)), 0x3c028041); // lui v0, 0x8041: an error
  const ovl = edits.files.get(LOBBY)!;
  assert.equal(ovl.readUInt32LE(0x10), 0x24020000);
  assert.equal(ovl.readUInt32LE(0x20), 0x3c028041);
  assert.equal(ovl.readUInt32LE(0x30), jalTo(OTHER_STUB));
  assert.equal(edits.files.has(QUEST), false);
  assert.match(offlineReport(result).summary!, /Online play: off \(4 calls\)/);
});

test("an EBOOT without the imports, or without calls, is left alone", () => {
  const { game, edits } = setUp({}, new Map());
  assert.equal(
    disableOnline(game.eboot, "eu", 1 << 20, edits),
    "the EBOOT never calls the network imports",
  );
  const bare = Buffer.from(game.eboot);
  bare.writeUInt32LE(OTHER_NID, at(NIDS));
  assert.equal(
    disableOnline(bare, "eu", 1 << 20, new Edits({ ...game, eboot: bare })),
    "the EBOOT doesn't import sceWlanGetSwitchState",
  );
  assert.equal(edits.changedEboot(), null);
  assert.match(offlineReport("x").summary!, /not turned off \(x\)/);
});
