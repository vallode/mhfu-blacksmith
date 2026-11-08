import assert from "node:assert/strict";
import { test } from "node:test";
import { OVL_HEADER_SIZE, OvlFormatError, parseOvl } from "../src/container/ovl.js";
import {
  GAME_TASK_JP,
  HITZONE_POINTERS_OFFSET,
  locateMonsterChunks,
  MONSTER_CHUNK_SIZE,
  readMonsterChunks,
  TOLERANCE_OFFSET,
} from "../src/monsters/hitzones.js";
import { monsterAddressSpace } from "../src/monsters/overlays.js";
import {
  CAP_BREAK_ENTRY_SIZE,
  CAPTURE_TYPE,
  CARVE_INDEX_COUNT,
  CARVE_INDEX_SIZE,
  GAME_SUB_JP,
  isCompleteList,
  locateCapBreakTables,
  locateCarveTables,
  readCapBreakTables,
  readCarveTables,
  readRewardList,
} from "../src/monsters/rewards.js";

const LOAD_BASE = 0x09a5a580;

/** Builds a synthetic MWo3-framed buffer: header + `dataSize` bytes of mapped image. */
function buildOvl(
  options: { name?: string; loadBase?: number; loadEnd?: number; dataSize?: number } = {},
): Buffer {
  const {
    name = "game_task.ovl",
    loadBase = LOAD_BASE,
    loadEnd = loadBase + 0x1000,
    dataSize = 0x200,
  } = options;
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
  const ovl = parseOvl(
    buildOvl({ name: "game_task.ovl", loadBase: 0x09a5a580, loadEnd: 0x09c0c16c }),
  );
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
  const ovl = parseOvl(
    buildOvl({ loadBase: 0x09a5a580, dataSize: Math.max(felyneOffset, mosswineOffset) + 24 }),
  );

  const felyneBytes = Buffer.from("787878646464640a64646464640000640000006464646400", "hex");
  const mosswineBytes = Buffer.from("969678646464640a00646464640000640000006464646400", "hex");
  felyneBytes.copy(ovl.reader.buf, felyneOffset);
  mosswineBytes.copy(ovl.reader.buf, mosswineOffset);

  assert.equal(ovl.vaddrToOffset(0x09bc0419), felyneOffset);
  assert.equal(ovl.vaddrToOffset(0x09bc0289), mosswineOffset);
  assert.ok(
    ovl.reader.buf.subarray(felyneOffset, felyneOffset + felyneBytes.length).equals(felyneBytes),
  );
  assert.ok(
    ovl.reader.buf
      .subarray(mosswineOffset, mosswineOffset + mosswineBytes.length)
      .equals(mosswineBytes),
  );
});

test("known real reward bytes: Giaprey (monster ID 35) low-rank body carve table in game_sub.ovl", () => {
  // Published low-rank body carve table (52% Giaprey Scale/ItemID 340, 30%
  // Giaprey Hide/342, 18% Sm Monster Bone/281, 0xffff terminator), confirmed
  // byte-for-byte against a real decrypted JP game_sub.ovl at this exact file
  // offset. No static pointer/index-table entry referencing this address
  // could be found anywhere in the file.
  const giapreyOffset = 0xbb458;
  const ovl = parseOvl(
    buildOvl({ name: "game_sub.ovl", loadBase: 0x09c14280, dataSize: giapreyOffset + 24 }),
  );

  const giapreyBytes = Buffer.from("340054011e00560112001901ffff00000a00210231001402", "hex");
  giapreyBytes.copy(ovl.reader.buf, giapreyOffset);

  assert.equal(ovl.vaddrToOffset(0x09ccf658), giapreyOffset);
  assert.ok(
    ovl.reader.buf
      .subarray(giapreyOffset, giapreyOffset + giapreyBytes.length)
      .equals(giapreyBytes),
  );

  const entries: Array<{ chance: number; itemId: number }> = [];
  for (let offset = giapreyOffset; ovl.reader.buf.readUInt16LE(offset) !== 0xffff; offset += 4) {
    entries.push({
      chance: ovl.reader.buf.readUInt16LE(offset),
      itemId: ovl.reader.buf.readUInt16LE(offset + 2),
    });
  }
  assert.deepEqual(entries, [
    { chance: 52, itemId: 340 }, // Giaprey Scale
    { chance: 30, itemId: 342 }, // Giaprey Hide
    { chance: 18, itemId: 281 }, // Sm Monster Bone
  ]);
});

// --- Monster tables (src/monsters/) -----------------------------------------
//
// Synthetic overlays laid out as the vendored hexpats describe, using the
// real bytes above: Giaprey's carve list and Felyne's hitzone row. Each test
// also places the tables at a shifted file offset, as EU tables can be.

const GAME_SUB_LOAD = GAME_SUB_JP.loadBase;
const GIAPREY_CARVE = Buffer.from("340054011e00560112001901ffff", "hex");
const GIAPREY_VADDR = 0x09ccf658;
const subOffset = (vaddr: number) => vaddr - GAME_SUB_LOAD + 0x80;

/** game_sub.ovl with every monster's low- and high-rank body carves pointing at Giaprey's list, tables shifted by `shift` bytes. */
function buildGameSub(shift = 0): Buffer {
  const buf = buildOvl({
    name: "game_sub.ovl",
    loadBase: GAME_SUB_LOAD,
    dataSize: subOffset(GAME_SUB_JP.capBreakIndex) + shift + 0x2000,
  });
  // Each monster gets its own copy of Giaprey's list (a shift that only
  // reaches a few lists doesn't count), monster i's at pointer index i.
  // Giaprey's own (index 34) sits at the real address.
  const pointers = subOffset(GAME_SUB_JP.carvePointers) + shift;
  const index = subOffset(GAME_SUB_JP.carveIndex) + shift;
  buf.fill(0xff, index, index + CARVE_INDEX_COUNT * CARVE_INDEX_SIZE);
  for (let i = 0; i < CARVE_INDEX_COUNT; i++) {
    const listVaddr = GIAPREY_VADDR + shift + (i - 34) * 16;
    GIAPREY_CARVE.copy(buf, subOffset(listVaddr));
    buf.writeUInt32LE(listVaddr, pointers + i * 4);
    buf.writeUInt16LE(i, index + i * CARVE_INDEX_SIZE + 2); // body, low
    buf.writeUInt16LE(i, index + i * CARVE_INDEX_SIZE + 4); // body, high
  }
  // Cap/break: 60 capture entries, entry i's low-rank index i -> its own list.
  const rewards = [
    [45, 100, 1],
    [35, 200, 1],
    [20, 340, 2],
  ];
  const capPointers = subOffset(GAME_SUB_JP.capBreakPointers) + shift;
  const capIndex = subOffset(GAME_SUB_JP.capBreakIndex) + shift;
  for (let i = 0; i < 60; i++) {
    const listOffset = capPointers - 60 * 24 + i * 24;
    rewards.forEach(([chance, item, amount], r) => {
      buf.writeUInt16LE(chance!, listOffset + r * 6);
      buf.writeUInt16LE(item!, listOffset + r * 6 + 2);
      buf.writeUInt16LE(amount!, listOffset + r * 6 + 4);
    });
    buf.writeUInt16LE(0xffff, listOffset + rewards.length * 6);
    buf.writeUInt32LE(GAME_SUB_LOAD - 0x80 + listOffset, capPointers + i * 4);
    const at = capIndex + i * CAP_BREAK_ENTRY_SIZE;
    buf.writeUInt8(77, at); // Giadrome
    buf.writeUInt8(CAPTURE_TYPE, at + 1);
    buf.fill(0xff, at + 2, at + CAP_BREAK_ENTRY_SIZE);
    buf.writeUInt16LE(i, at + 4); // low rank
  }
  buf.writeUInt8(0xff, capIndex + 60 * CAP_BREAK_ENTRY_SIZE);
  return buf;
}

for (const shift of [0, 0x2b04]) {
  test(`carve and cap/break tables are located and read (shift 0x${shift.toString(16)})`, () => {
    const ovl = parseOvl(buildGameSub(shift));
    const carves = locateCarveTables(ovl);
    assert.ok(carves);
    assert.equal(carves.shift, shift);
    const tables = readCarveTables(ovl, carves.pointers, carves.index);
    assert.equal(tables.length, 89);
    const giaprey = tables[34]!;
    assert.equal(giaprey.emId, 35);
    assert.deepEqual(giaprey.body.low?.entries, [
      { chance: 52, itemId: 340 },
      { chance: 30, itemId: 342 },
      { chance: 18, itemId: 281 },
    ]);
    assert.equal(giaprey.body.low?.pointer, GIAPREY_VADDR + shift);
    assert.equal(giaprey.tail.low, undefined);

    const capBreak = locateCapBreakTables(ovl, { hint: carves.shift });
    assert.ok(capBreak);
    assert.equal(capBreak.shift, shift);
    const caps = readCapBreakTables(ovl, capBreak.pointers, capBreak.index);
    assert.equal(caps.length, 60);
    assert.equal(caps[0]!.emId, 77);
    assert.equal(caps[0]!.type, CAPTURE_TYPE);
    assert.deepEqual(caps[0]!.ranks.low?.entries, [
      { chance: 45, itemId: 100, amount: 1 },
      { chance: 35, itemId: 200, amount: 1 },
      { chance: 20, itemId: 340, amount: 2 },
    ]);
  });
}

test("readRewardList rejects lists that run on or hold impossible values", () => {
  const ovl = parseOvl(
    buildOvl({ name: "game_sub.ovl", loadBase: GAME_SUB_LOAD, dataSize: 0x400 }),
  );
  const at = OVL_HEADER_SIZE;
  ovl.reader.buf.writeUInt16LE(150, at); // chance > 100
  assert.equal(readRewardList(ovl, GAME_SUB_LOAD, false), null);
  ovl.reader.buf.writeUInt16LE(0xffff, at);
  assert.deepEqual(readRewardList(ovl, GAME_SUB_LOAD, false), []);
  assert.equal(isCompleteList([]), false);
  // A pointer outside the overlay (another file's address range).
  assert.equal(readRewardList(ovl, 0x08900000, false), null);
});

const GAME_TASK_LOAD = GAME_TASK_JP.loadBase;
const taskOffset = (vaddr: number) => vaddr - GAME_TASK_LOAD + 0x80;
/** Felyne's row: part byte (assumed 1), then the real fixture bytes from cut to KO. */
const FELYNE_ROW = Buffer.from("01787878646464640a64", "hex");
const FELYNE_ROW_VADDR = 0x09bc0418;
const HITZONE_TBL_VADDR = 0x09bc0000;

/** game_task.ovl whose 90 chunks all point (via one HitzoneTbl) at Felyne's row; chunk array shifted by `shift`. */
function buildGameTask(shift = 0): Buffer {
  const buf = buildOvl({
    name: "game_task.ovl",
    loadBase: GAME_TASK_LOAD,
    dataSize: Math.max(
      taskOffset(GAME_TASK_JP.monsterChunks) + shift + 90 * MONSTER_CHUNK_SIZE,
      taskOffset(FELYNE_ROW_VADDR) + 0x40,
    ),
  });
  FELYNE_ROW.copy(buf, taskOffset(FELYNE_ROW_VADDR));
  // A zero u16 after the row ends the list.
  buf.writeUInt32LE(FELYNE_ROW_VADDR, taskOffset(HITZONE_TBL_VADDR));
  const chunks = taskOffset(GAME_TASK_JP.monsterChunks) + shift;
  for (let emId = 0; emId < 90; emId++) {
    const base = chunks + emId * MONSTER_CHUNK_SIZE;
    buf.writeFloatLE(1, base + 0x40);
    buf.writeUInt32LE(HITZONE_TBL_VADDR, base + HITZONE_POINTERS_OFFSET);
    // Paralysis initial / KO initial / poison increase, to pin the layout.
    buf.writeUInt16LE(150, base + TOLERANCE_OFFSET);
    buf.writeUInt16LE(100 + emId, base + TOLERANCE_OFFSET + 10);
    buf.writeUInt16LE(75, base + TOLERANCE_OFFSET + 52);
  }
  return buf;
}

for (const shift of [0, 0x2f60]) {
  test(`monster chunks are located and hitzones followed through HitzoneTbl (shift 0x${shift.toString(16)})`, () => {
    const ovl = parseOvl(buildGameTask(shift));
    const location = locateMonsterChunks(ovl);
    assert.ok(location);
    assert.equal(location.shift, shift);
    const space = monsterAddressSpace({ gameTask: ovl, gameSub: ovl, em: new Map() });
    const chunks = readMonsterChunks(ovl, location.offset, space);
    assert.equal(chunks.length, 90);
    const felyne = chunks[9]!;
    assert.equal(felyne.hitzones.length, 1);
    assert.equal(felyne.hitzones[0]!.rowsPointer, FELYNE_ROW_VADDR);
    assert.deepEqual(felyne.hitzones[0]!.rows, [
      {
        part: 1,
        values: {
          cut: 120,
          bash: 120,
          shot: 120,
          fire: 100,
          water: 100,
          ice: 100,
          thunder: 100,
          dragon: 10,
          ko: 100,
        },
      },
    ]);
    assert.equal(felyne.tolerances.paralysis.initial, 150);
    assert.equal(felyne.tolerances.ko.initial, 109);
    assert.equal(felyne.tolerances.poison.increase, 75);
  });
}

test("monsterAddressSpace prefers the monster's own emXX.ovl for a shared load slot", () => {
  const task = parseOvl(buildOvl({ loadBase: GAME_TASK_LOAD }));
  const slot = 0x09c80000;
  const em01 = parseOvl(buildOvl({ name: "em01.ovl", loadBase: slot }));
  const em11 = parseOvl(buildOvl({ name: "em11.ovl", loadBase: slot }));
  const em = new Map([
    [1, em01],
    [11, em11],
  ]);
  const space = monsterAddressSpace({ gameTask: task, gameSub: task, em });
  assert.equal(space(GAME_TASK_LOAD + 4, 1)?.file, "game_task.ovl");
  assert.equal(space(slot + 4, 1)?.file, "em01.ovl");
  assert.equal(space(slot + 4, 11)?.file, "em11.ovl");
  // A monster with no em file of its own: two files map the address, so no answer.
  assert.equal(space(slot + 4, 37), null);
  assert.equal(space(0x08900000, 1), null);
});
