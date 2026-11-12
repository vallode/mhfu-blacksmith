/**
 * A tiny synthetic disc for tests: an ISO 9660 image with PARAM.SFO, a plain
 * ELF-magic EBOOT.BIN with a few recipes, and an encrypted DATA.BIN holding
 * five quests, a `game_task.ovl` with monster chunks and hitzones, and a
 * `game_sub.ovl` with reward tables.
 * No game data: every value is made up.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GAME_TAG_KEYS, TYPE01_TAG_KEYS } from "mhfu-extract/src/container/prx.js";
import { encryptGameEboot } from "mhfu-extract/test/prx-fixture.js";
import { encryptDataBinBlock } from "mhfu-extract/src/container/databin.js";
import {
  CAP_BREAK_POINTER_COUNT,
  CAPTURE_TYPE,
  CARVE_INDEX_COUNT,
  CARVE_INDEX_SIZE,
  CARVE_POINTER_COUNT,
} from "mhfu-extract/src/monsters/rewards.js";
import {
  BASE_HP_OFFSET,
  GAME_TASK_JP,
  HITZONE_POINTER_OFFSET,
  HITZONE_ROW_SIZE,
  MONSTER_CHUNK_COUNT,
  MONSTER_CHUNK_SIZE,
  MULTIPLIER_SET_OFFSET,
  TOLERANCE_OFFSET,
} from "mhfu-extract/src/monsters/hitzones.js";
import { encryptQuestBlock, questHash, QUEST_MAGIC } from "mhfu-extract/src/quests/mib.js";
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { equipmentCreateLayout, equipmentUpgradeLayout } from "mhfu-extract/src/tables/recipes.js";
import { WEAPON_TYPE_NAMES } from "mhfu-extract/src/tables/weapons.js";
import {
  ARMOR_ENTRY_SIZE,
  DECO_SKILL_ENTRY_SIZE,
  EQUIP_CREATE_ENTRY_SIZE,
  EQUIP_UPGRADE_ENTRY_SIZE,
  ITEM_ENTRY_SIZE,
  JP_BASE_ADDRESS,
  WEAPON_BM_ENTRY_SIZE,
  WEAPON_GUN_ENTRY_SIZE,
  tableOffset,
} from "mhfu-extract/src/tables/offsets.js";
import { ARMOR_POINTER_INDEX, ARMOR_SLOTS, type ArmorSlot } from "mhfu-extract/src/tables/armor.js";

export const SECTOR = 2048;

export function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "randomfu-test-"));
}

// ---------------------------------------------------------------- ISO 9660

export interface IsoFile {
  path: string; // e.g. "PSP_GAME/USRDIR/DATA.BIN"
  data: Buffer;
}

function both32(buf: Buffer, offset: number, value: number): void {
  buf.writeUInt32LE(value, offset);
  buf.writeUInt32BE(value, offset + 4);
}

function dirRecord(name: Buffer, lba: number, size: number, isDir: boolean): Buffer {
  const length = 33 + name.length + (name.length % 2 === 0 ? 1 : 0);
  const rec = Buffer.alloc(length);
  rec[0] = length;
  both32(rec, 2, lba);
  both32(rec, 10, size);
  rec[25] = isDir ? 2 : 0;
  rec.writeUInt16LE(1, 28);
  rec.writeUInt16BE(1, 30);
  rec[32] = name.length;
  name.copy(rec, 33);
  return rec;
}

/** Builds an image with one directory sector per directory and each file sector-aligned. */
export function buildIso(files: IsoFile[]): Buffer {
  const dirs = new Map<string, { lba: number; children: string[] }>();
  const dirOf = (p: string) => p.split("/").slice(0, -1).join("/");
  const ensureDir = (d: string): void => {
    if (dirs.has(d)) return;
    dirs.set(d, { lba: 0, children: [] });
    if (d !== "") {
      ensureDir(dirOf(d));
      dirs.get(dirOf(d))!.children.push(d);
    }
  };
  ensureDir("");
  for (const f of files) {
    ensureDir(dirOf(f.path));
    dirs.get(dirOf(f.path))!.children.push(f.path);
  }

  let next = 18;
  for (const d of dirs.values()) d.lba = next++;
  const fileLba = new Map<string, number>();
  for (const f of files) {
    fileLba.set(f.path, next);
    next += Math.max(1, Math.ceil(f.data.length / SECTOR));
  }

  const image = Buffer.alloc(next * SECTOR);
  const pvd = image.subarray(16 * SECTOR, 17 * SECTOR);
  pvd[0] = 1;
  pvd.write("CD001", 1, "latin1");
  pvd[6] = 1;
  both32(pvd, 80, next);
  dirRecord(Buffer.from([0]), dirs.get("")!.lba, SECTOR, true).copy(pvd, 156);
  const term = image.subarray(17 * SECTOR, 18 * SECTOR);
  term[0] = 255;
  term.write("CD001", 1, "latin1");

  const fileByPath = new Map(files.map((f) => [f.path, f]));
  for (const [d, { lba, children }] of dirs) {
    const parent = dirs.get(d === "" ? "" : dirOf(d))!;
    const records = [
      dirRecord(Buffer.from([0]), lba, SECTOR, true),
      dirRecord(Buffer.from([1]), parent.lba, SECTOR, true),
      ...children.map((child) => {
        const name = child.split("/").at(-1)!;
        const file = fileByPath.get(child);
        return file
          ? dirRecord(
              Buffer.from(`${name};1`, "latin1"),
              fileLba.get(child)!,
              file.data.length,
              false,
            )
          : dirRecord(Buffer.from(name, "latin1"), dirs.get(child)!.lba, SECTOR, true);
      }),
    ];
    Buffer.concat(records).copy(image, lba * SECTOR);
  }
  for (const f of files) f.data.copy(image, fileLba.get(f.path)! * SECTOR);
  return image;
}

/** Wraps an image as an uncompressed-block CSO. */
export function buildCso(iso: Buffer): Buffer {
  const blocks = Math.ceil(iso.length / SECTOR);
  const header = Buffer.alloc(0x18 + (blocks + 1) * 4);
  header.write("CISO", 0, "latin1");
  header.writeUInt32LE(0x18, 4);
  header.writeBigUInt64LE(BigInt(iso.length), 8);
  header.writeUInt32LE(SECTOR, 16);
  header[20] = 1;
  for (let i = 0; i <= blocks; i++) {
    header.writeUInt32LE(((header.length + i * SECTOR) | 0x80000000) >>> 0, 0x18 + i * 4);
  }
  return Buffer.concat([header, iso]);
}

// ---------------------------------------------------------------- PARAM.SFO

export function buildSfo(discId: string): Buffer {
  const key = Buffer.from("DISC_ID\0", "latin1");
  const value = Buffer.alloc(16);
  value.write(discId, 0, "utf8");
  const keyTable = 0x14 + 16;
  const dataTable = keyTable + 8;
  const buf = Buffer.alloc(dataTable + value.length);
  buf.writeUInt32LE(0x46535000, 0);
  buf.writeUInt32LE(0x101, 4);
  buf.writeUInt32LE(keyTable, 8);
  buf.writeUInt32LE(dataTable, 12);
  buf.writeUInt32LE(1, 16);
  buf.writeUInt16LE(0, 0x14);
  buf.writeUInt16LE(0x0204, 0x16);
  buf.writeUInt32LE(discId.length + 1, 0x18);
  buf.writeUInt32LE(16, 0x1c);
  buf.writeUInt32LE(0, 0x20);
  key.copy(buf, keyTable);
  value.copy(buf, dataTable);
  return buf;
}

// ---------------------------------------------------------------- quests

export interface FixtureReward {
  chance: number;
  itemId: number;
  amount: number;
}

export interface FixtureQuest {
  questId: number;
  rank: number;
  stars: number;
  monsters: number[];
  /** Each large monster's difficulty level (`power`); 0 if not given. */
  powers?: number[];
  /** Small monsters: `[emID, quantity]`, in one table. */
  small?: [number, number][];
  /** `MonSizeModifier`, the quest's monster size in percent; 100 if not given. */
  sizePercent?: number;
  rewards: FixtureReward[][];
  gathering?: FixtureGathering;
  /**
   * Quest text by `LangPTRs` slot (for renaming tests): six strings (title, goal, fail, details,
   * monsters, client) for a block of its own, the number of an earlier slot
   * to share its block, or null for none. Strings are packed back to back.
   */
  slots?: (FixtureText | number | null)[];
  /** Supply box entries, `[item, amount]`. */
  supplies?: [item: number, amount: number][];
  terms?: { fee: number; reward: number; penalty: number; minutes: number };
  /** Makes it a delivery quest for this item. */
  delivery?: { itemId: number; amount: number };
  /** Quest text: English (three slots) and one other language (the other four). */
  text?: { title: string; goal: string; otherGoal: string };
}

export type FixtureText = [string, string, string, string, string, string];

/**
 * Gathering points: item tables as `[value, item]` pairs (or the index of
 * an earlier table, to point at the same data), and the tables each area's
 * nodes use.
 */
export interface FixtureGathering {
  tables: ([value: number, item: number][] | number)[];
  areas: Record<number, number[]>;
}

/** Every fixture node can be gathered this many times at least (header +22), twice that at most. */
export const FIXTURE_GATHERS = 3;

/** Snowy Mountains (Day): 10 areas. */
const GATHERING_MAP = 11;

/** A plaintext `.mib`: header, RewardTBL and item lists, one LargeMonTable. Odd length on purpose. */
export function buildQuestPayload(q: FixtureQuest): Buffer {
  const parts: Buffer[] = [];
  let at = 0x80;
  const place = (buf: Buffer): number => {
    const offset = at;
    parts.push(buf);
    at += buf.length;
    return offset;
  };
  /** A NUL-terminated string on a 4-byte boundary, zero-padded to the next one. */
  const placeString = (text: string): number => {
    if (at % 4) place(Buffer.alloc(4 - (at % 4)));
    const bytes = Buffer.from(text, "utf8");
    return place(Buffer.concat([bytes, Buffer.alloc(4 - (bytes.length % 4))]));
  };

  let stringTablePtr = 0;
  if (q.text) {
    const block = (goal: string) => {
      const ptrs = [q.text!.title, goal, "Fail", "Details", "Monsters", "Client"].map(placeString);
      const buf = Buffer.alloc(24);
      ptrs.forEach((ptr, i) => buf.writeUInt32LE(ptr, i * 4));
      return place(buf);
    };
    const english = block(q.text.goal);
    const other = block(q.text.otherGoal);
    const langs = Buffer.alloc(28);
    [english, english, other, other, other, other, english].forEach((ptr, i) =>
      langs.writeUInt32LE(ptr, i * 4),
    );
    stringTablePtr = place(langs);
  }
  let suppliesPtr = 0;
  if (q.supplies) {
    const list = Buffer.alloc(q.supplies.length * 4 + 4);
    q.supplies.forEach(([item, amount], i) => {
      list.writeUInt16LE(item, i * 4);
      list.writeUInt16LE(amount, i * 4 + 2);
    });
    list.writeUInt16LE(q.questId, q.supplies.length * 4 + 2);
    suppliesPtr = place(list);
  }

  const itemPtrs = q.rewards.map((items) => {
    const list = Buffer.alloc(items.length * 6 + 6);
    items.forEach((it, i) => {
      list.writeUInt16LE(it.chance, i * 6);
      list.writeUInt16LE(it.itemId, i * 6 + 2);
      list.writeUInt16LE(it.amount, i * 6 + 4);
    });
    list.writeUInt16LE(0xffff, items.length * 6);
    return place(list);
  });
  const tbl = Buffer.alloc(q.rewards.length * 8 + 8);
  itemPtrs.forEach((ptr, i) => {
    tbl.writeUInt16LE(i === 0 ? 0x8000 : 0x8001, i * 8);
    tbl.writeUInt32LE(ptr, i * 8 + 4);
  });
  tbl.writeUInt16LE(0xffff, q.rewards.length * 8);
  const rewardsPtr = place(tbl);

  const data = Buffer.alloc(q.monsters.length * 60 + 2);
  q.monsters.forEach((id, i) => {
    data.writeUInt16LE(id, i * 60);
    data[i * 60 + 4] = 1;
    data[i * 60 + 5] = q.powers?.[i] ?? 0;
  });
  data.writeInt16LE(-1, q.monsters.length * 60);
  const dataPtr = place(data);
  const preload = [...new Set(q.monsters)];
  const loads = Buffer.alloc(preload.length * 4 + 4);
  preload.forEach((id, i) => loads.writeUInt16LE(id, i * 4));
  loads.writeInt16LE(-1, preload.length * 4);
  const loadsPtr = place(loads);
  const table = Buffer.alloc(32);
  table.writeUInt32LE(1, 0);
  table.writeUInt32LE(loadsPtr, 8);
  table.writeUInt32LE(dataPtr, 12);
  const largeMonPtr = place(table);
  let smallMonPtr = 0;
  if (q.small) {
    const smallData = Buffer.alloc(q.small.length * 60 + 2);
    q.small.forEach(([id, quantity], i) => {
      smallData.writeUInt16LE(id, i * 60);
      smallData[i * 60 + 4] = quantity;
    });
    smallData.writeUInt16LE(0xffff, q.small.length * 60);
    const smallDataPtr = place(smallData);
    const smallTable = Buffer.alloc(20);
    smallTable.writeUInt16LE(1, 0); // stage
    smallTable.writeUInt32LE(smallDataPtr, 12);
    const smallTablePtr = place(smallTable);
    const index = Buffer.alloc(8);
    index.writeUInt32LE(smallTablePtr, 0);
    smallMonPtr = place(index);
  }
  let gatheringLocPtr = 0;
  let gatheringItemsPtr = 0;
  if (q.gathering) {
    const tablePtrs: number[] = [];
    for (const table of q.gathering.tables) {
      if (typeof table === "number") {
        tablePtrs.push(tablePtrs[table]!);
        continue;
      }
      const t = Buffer.alloc(table.length * 4 + 4);
      table.forEach(([value, item], k) => {
        t.writeUInt16LE(value, k * 4);
        t.writeUInt16LE(item, k * 4 + 2);
      });
      t.writeUInt16LE(0xffff, table.length * 4);
      tablePtrs.push(place(t));
    }
    const list = Buffer.alloc(tablePtrs.length * 4 + 4);
    tablePtrs.forEach((ptr, i) => list.writeUInt32LE(ptr, i * 4));
    gatheringItemsPtr = place(list);
    const areas = Buffer.alloc(10 * 4);
    for (const [area, used] of Object.entries(q.gathering.areas)) {
      const nodes = Buffer.alloc(used.length * 24 + 4);
      used.forEach((table, i) => {
        nodes.writeFloatLE(100 + i, i * 24);
        nodes.writeUInt16LE(table, i * 24 + 16);
        nodes.writeUInt16LE(FIXTURE_GATHERS * 2, i * 24 + 18);
        nodes.writeUInt16LE(3, i * 24 + 20); // mining
        nodes.writeUInt16LE(FIXTURE_GATHERS, i * 24 + 22);
      });
      nodes.writeUInt32LE(0xbf800000, used.length * 24);
      areas.writeUInt32LE(place(nodes), Number(area) * 4);
    }
    gatheringLocPtr = place(areas);
  }
  let stringPtrTbl = 0;
  if (q.slots) {
    const own = q.slots.map((t) =>
      Array.isArray(t) ? t.map((str) => place(Buffer.from(`${str}\0`, "utf8"))) : null,
    );
    const blocks = own.map((ptrs) => {
      if (!ptrs) return 0;
      const block = Buffer.alloc(24);
      ptrs.forEach((ptr, i) => block.writeUInt32LE(ptr, i * 4));
      return place(block);
    });
    const table = Buffer.alloc(28);
    q.slots.forEach((t, i) => {
      const block = typeof t === "number" ? blocks[t]! : t ? blocks[i]! : 0;
      table.writeUInt32LE(block, i * 4);
    });
    stringPtrTbl = place(table);
  }
  place(Buffer.from([0x55])); // odd length

  const header = Buffer.alloc(0x80);
  QUEST_MAGIC.copy(header, 0);
  header.writeUInt32LE(suppliesPtr, 8);
  header.writeUInt32LE(rewardsPtr, 12);
  header.writeUInt32LE(largeMonPtr, 20);
  header.writeUInt32LE(smallMonPtr, 24);
  header.writeUInt32LE(gatheringLocPtr, 28);
  header.writeUInt32LE(gatheringItemsPtr, 36);
  header.writeUInt32LE(q.sizePercent ?? 100, 0x38);
  header[68] = q.rank;
  if (q.delivery) {
    header[76] = 2;
    header.writeUInt16LE(q.delivery.itemId, 112);
    header.writeUInt16LE(q.delivery.amount, 114);
  }
  if (q.terms) {
    header.writeUInt32LE(q.terms.fee, 80);
    header.writeUInt32LE(q.terms.reward, 84);
    header.writeUInt32LE(q.terms.penalty, 88);
    header.writeUInt32LE(q.terms.minutes * 1800, 92);
  }
  header.writeUInt32LE(stringPtrTbl || stringTablePtr, 96);
  header.writeUInt16LE(q.questId, 100);
  header[102] = q.stars;
  header[104] = GATHERING_MAP;
  // TargetID: the first monster, unless it's a delivery quest's item (written above).
  if (!q.delivery) header.writeUInt16LE(q.monsters[0] ?? 0, 112);
  // Objective slots: one names the monster, the other an item with the same number.
  header.writeUInt32LE(1, 0x28);
  header.writeUInt16LE(q.monsters[0] ?? 0, 0x2c);
  header.writeUInt32LE(2, 0x30);
  header.writeUInt16LE(q.monsters[0] ?? 0, 0x34);
  return Buffer.concat([header, ...parts]);
}

/** The DATA.BIN entry for a quest: seeds, then the XOR-ciphered size/hash/payload and padding. */
export function buildQuestEntry(payload: Buffer, sectors = 1): Buffer {
  const body = Buffer.alloc(sectors * SECTOR - 8);
  for (let i = 0; i < body.length; i++) body[i] = (i * 31 + 7) & 0xff; // non-zero padding
  body.writeUInt32LE(payload.length, 0);
  questHash(payload, "jp").copy(body, 4);
  payload.copy(body, 24);
  return encryptQuestBlock(body, [0x1234, 0x0, 0xbeef, 0x4321]);
}

// ---------------------------------------------------------------- overlays

export const SUB_LOAD = 0x09c19000;

function ovlHeader(name: string, loadBase: number, dataSize: number): Buffer {
  const buf = Buffer.alloc(0x80 + dataSize);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(loadBase, 8);
  buf.writeUInt32LE(loadBase + buf.length, 0x1c);
  buf.write(name, 0x20, "latin1");
  return buf;
}

export const TASK_LOAD = 0x09a5a580;

/** Hitzone row values (cut, bash, shot, fire, water, ice, thunder, dragon, KO), all different. */
export function fixtureHitzone(emId: number, table: number, row: number): number[] {
  return Array.from({ length: 9 }, (_, c) => ((emId * 7 + table * 31 + row * 11 + c * 5) % 97) + 1);
}

/**
 * Monster chunks with hitzone tables: monster -> number of tables. Pink
 * Rathian (37) shares Rathian's (1); every other chunk points at one filler
 * table, as non-monsters do on the disc.
 */
export const FIXTURE_HITZONE_TABLES: Record<number, number> = { 1: 2, 2: 1, 16: 1 };
export const FIXTURE_SHARED_HITZONES: Record<number, number> = { 37: 1 };
export const FILLER_HITZONE = 0;

/** Stat multiplier sets as on the disc: 2 the Fatalis trio, 3 the siege monsters, 1 the rest. */
export function fixtureMultiplierSet(emId: number): number {
  if ([2, 36, 71].includes(emId)) return 2;
  if ([7, 50, 55, 58, 72, 76, 88].includes(emId)) return 3;
  return 1;
}

/** Base HP: 100 + emID, so every chunk counts as a monster. */
export const fixtureHp = (emId: number) => 100 + emId;

/** Tolerance fields (+0x110) set on every monster: paralysis initial/increase, poison initial/increase. */
export const FIXTURE_TOLERANCES = { paralysis: [150, 100], poison: [180, 75] } as const;

/** `game_task.ovl` with `MonChunk[90]` at JP's file offset. */
export function buildGameTask(): Buffer {
  const chunks = GAME_TASK_JP.monsterChunks - GAME_TASK_JP.loadBase;
  let at = chunks + MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE;
  const tables: { emId: number; at: number; count: number }[] = [];
  for (const [emId, count] of [[FILLER_HITZONE, 1], ...Object.entries(FIXTURE_HITZONE_TABLES)]) {
    tables.push({ emId: Number(emId), at, count: Number(count) });
    // count pointers + terminator, then count tables of 7 rows + a zero u16.
    at += (Number(count) + 1) * 4 + Number(count) * (7 * HITZONE_ROW_SIZE + 4);
  }
  const buf = ovlHeader("game_task.ovl", TASK_LOAD, at - 0x80);
  const vaddr = (offset: number) => TASK_LOAD + offset;
  const listOf = new Map<number, number>();
  for (const { emId, at: list, count } of tables) {
    listOf.set(emId, list);
    let rows = list + (count + 1) * 4;
    for (let t = 0; t < count; t++) {
      buf.writeUInt32LE(vaddr(rows), list + t * 4);
      for (let r = 0; r < 7; r++) {
        const row = rows + r * HITZONE_ROW_SIZE;
        buf[row] = 100 - r * 10;
        fixtureHitzone(emId, t, r).forEach((v, c) => (buf[row + 1 + c] = v));
      }
      rows += 7 * HITZONE_ROW_SIZE + 4;
    }
  }
  for (let emId = 0; emId < MONSTER_CHUNK_COUNT; emId++) {
    const chunk = chunks + emId * MONSTER_CHUNK_SIZE;
    buf.writeFloatLE(1, chunk + 0x40);
    buf.writeUInt16LE(fixtureHp(emId), chunk + BASE_HP_OFFSET);
    buf.writeInt8(fixtureMultiplierSet(emId), chunk + MULTIPLIER_SET_OFFSET);
    const owner = FIXTURE_SHARED_HITZONES[emId] ?? emId;
    buf.writeUInt32LE(
      vaddr(listOf.get(owner) ?? listOf.get(FILLER_HITZONE)!),
      chunk + HITZONE_POINTER_OFFSET,
    );
    const tol = chunk + TOLERANCE_OFFSET;
    buf.writeUInt16LE(FIXTURE_TOLERANCES.paralysis[0], tol);
    buf.writeUInt16LE(FIXTURE_TOLERANCES.paralysis[1], tol + 8);
    buf.writeUInt16LE(FIXTURE_TOLERANCES.poison[0], tol + 40);
    buf.writeUInt16LE(FIXTURE_TOLERANCES.poison[1], tol + 52);
  }
  return buf;
}

export interface CarveListSpec {
  emId: number;
  kind: 0 | 1 | 2; // body, tail, shiny
  rank: number; // REWARD_RANKS index
  entries: { chance: number; itemId: number }[];
}

export interface CaptureListSpec {
  emId: number;
  rank: number;
  entries: { chance: number; itemId: number; amount: number }[];
}

/** `game_sub.ovl` with the two pointer tables, their index tables and the given lists. */
export function buildGameSub(carves: CarveListSpec[], captures: CaptureListSpec[]): Buffer {
  const carvePointers = 0x80;
  const carveIndex = carvePointers + CARVE_POINTER_COUNT * 4;
  const capPointers = carveIndex + CARVE_INDEX_COUNT * CARVE_INDEX_SIZE + 4;
  const capIndex = capPointers + CAP_BREAK_POINTER_COUNT * 4;
  const lists = capIndex + (captures.length + 1) * 14 + 2;
  const buf = ovlHeader("game_sub.ovl", SUB_LOAD, lists + 0x1000);
  const vaddr = (offset: number) => SUB_LOAD + offset;

  let at = lists;
  const empty = at;
  buf.writeUInt16LE(0xffff, at);
  at += 4;
  const placeList = (
    entries: { chance: number; itemId: number; amount?: number }[],
    stride: number,
  ) => {
    const start = at;
    for (const e of entries) {
      buf.writeUInt16LE(e.chance, at);
      buf.writeUInt16LE(e.itemId, at + 2);
      if (stride === 6) buf.writeUInt16LE(e.amount!, at + 4);
      at += stride;
    }
    buf.writeUInt16LE(0xffff, at);
    at += stride;
    return start;
  };

  for (let i = 0; i < CARVE_POINTER_COUNT; i++)
    buf.writeUInt32LE(vaddr(empty), carvePointers + i * 4);
  buf.fill(0xff, carveIndex, carveIndex + CARVE_INDEX_COUNT * CARVE_INDEX_SIZE);
  carves.forEach((spec, n) => {
    const pointer = n + 1;
    buf.writeUInt32LE(vaddr(placeList(spec.entries, 4)), carvePointers + pointer * 4);
    const slot = carveIndex + (spec.emId - 1) * CARVE_INDEX_SIZE + spec.kind * 14 + spec.rank * 2;
    buf.writeUInt16LE(pointer, slot);
  });
  buf.fill(0xff, carveIndex + CARVE_INDEX_COUNT * CARVE_INDEX_SIZE, capPointers);

  for (let i = 0; i < CAP_BREAK_POINTER_COUNT; i++)
    buf.writeUInt32LE(vaddr(empty), capPointers + i * 4);
  buf.fill(0xff, capIndex, lists);
  captures.forEach((spec, n) => {
    const pointer = n + 1;
    buf.writeUInt32LE(vaddr(placeList(spec.entries, 6)), capPointers + pointer * 4);
    const entry = capIndex + n * 14;
    buf[entry] = spec.emId;
    buf[entry + 1] = CAPTURE_TYPE;
    buf.writeUInt16LE(pointer, entry + 2 + spec.rank * 2);
  });
  buf[capIndex + captures.length * 14] = 0xff;
  return buf;
}

// ---------------------------------------------------------------- EBOOT

export interface FixtureRecipe {
  /** Index in the head armor section. */
  index: number;
  /** Sets the entry's `Hide` byte (meaning unknown; starter gear has it set). */
  hide?: boolean;
  materials: { itemId: number; quantity: number }[];
}

export const EBOOT_SIZE = 2_000_000;
/** Where the fixture's armor arrays go (the JP EBOOT finds them through a pointer table). */
const ARMOR_ARRAYS = 1_850_000;

/** EBOOT offset of a piece's `ArmorValues` entry. */
export function armorValueAt(slot: ArmorSlot, index: number): number {
  return ARMOR_ARRAYS + ARMOR_SLOTS.indexOf(slot) * 20_000 + index * ARMOR_ENTRY_SIZE;
}

export interface FixturePrices {
  blademaster: [index: number, price: number][];
  armorHead: [index: number, price: number][];
  decoration: [index: number, price: number][];
}

export const FIXTURE_PRICES: FixturePrices = {
  blademaster: [
    [1, 200],
    [3, 1000],
  ],
  armorHead: [[1, 300]],
  decoration: [[0, 1600]],
};

export interface FixtureWeapon {
  index: number;
  type: "great-sword" | "long-sword";
  /** Raw rarity (shown as rarity + 1). */
  rarity: number;
  /** Raw attack (shown times the class modifier / 100). */
  attack: number;
  affinity: number;
  /** Element (eleType, eleValue) or status (statusType, statusValue), raw: a tenth of the shown value. */
  element?: [number, number];
  status?: [number, number];
}

/**
 * Blademaster weapons. Model ID = index. Great Sword rarity 1: 1, 3, 9
 * (2 is in no tree; 7 comes from rust shards); rarity 2: 4, 5. Long Sword
 * rarity 1: 6; rarity 2: 8 (an upgrade from Great Sword 3, as the game has).
 */
export const FIXTURE_WEAPONS: FixtureWeapon[] = [
  { index: 1, type: "great-sword", rarity: 0, attack: 60, affinity: 0 },
  { index: 2, type: "great-sword", rarity: 0, attack: 70, affinity: 0, element: [1, 12] },
  { index: 3, type: "great-sword", rarity: 0, attack: 80, affinity: -10 },
  { index: 4, type: "great-sword", rarity: 1, attack: 100, affinity: 10, element: [2, 20] },
  { index: 5, type: "great-sword", rarity: 1, attack: 110, affinity: 0, status: [1, 15] },
  { index: 6, type: "long-sword", rarity: 0, attack: 70, affinity: 0 },
  { index: 7, type: "great-sword", rarity: 0, attack: 90, affinity: 5, element: [3, 25] },
  { index: 8, type: "long-sword", rarity: 1, attack: 90, affinity: 15, status: [3, 30] },
  { index: 9, type: "great-sword", rarity: 0, attack: 75, affinity: 0 },
];

/** Gunner weapons outside the smithy trees: bows, model ID 20 + index. */
export const FIXTURE_GUNNER_WEAPONS = [
  { index: 1, rarity: 0, attack: 20, affinity: 0, element: [5, 8] },
  { index: 2, rarity: 1, attack: 30, affinity: 10, element: [1, 12] },
] as const;

/** `WepClassMod`, in table order (Great Sword first). */
export const FIXTURE_CLASS_MODIFIERS = [480, 130, 520, 230, 140, 120, 140, 480, 520, 230, 120];

type Materials = { itemId: number; quantity: number }[];

/** Great Sword/Long Sword create entries, in order: [weapon, materials]. */
export const FIXTURE_WEAPON_CREATE: [number, Materials][] = [
  [1, [{ itemId: 100, quantity: 1 }]],
  [3, [{ itemId: 101, quantity: 2 }]],
  [6, [{ itemId: 110, quantity: 1 }]],
  [9, [{ itemId: 104, quantity: 1 }]],
];
export const FIXTURE_RUST_CREATE: [number, Materials][] = [[7, [{ itemId: 300, quantity: 1 }]]];

/** Upgrade entries by weapon: materials to make it by upgrading, and what it upgrades into. */
export const FIXTURE_UPGRADES: { index: number; craft: Materials; targets: number[] }[] = [
  { index: 1, craft: [], targets: [4] },
  { index: 3, craft: [], targets: [5, 8] },
  { index: 4, craft: [{ itemId: 102, quantity: 1 }], targets: [] },
  { index: 5, craft: [{ itemId: 103, quantity: 2 }], targets: [] },
  { index: 8, craft: [{ itemId: 103, quantity: 1 }], targets: [] },
];

function writeMaterials(buf: Buffer, at: number, materials: Materials): void {
  materials.forEach((m, k) => {
    buf.writeUInt16LE(m.itemId, at + k * 4);
    buf.writeUInt16LE(m.quantity, at + k * 4 + 2);
  });
}

/** Prices: the store's real ones (which randomfu checks for), plus a few more shop items. */
export const FIXTURE_ITEM_PRICES: [number, number][] = [
  [163, 20],
  [7, 66],
  [11, 60],
  [153, 80],
  [21, 300],
  [22, 250],
  [144, 60],
  [145, 160],
  [164, 20],
  [167, 50],
  [97, 10],
];
export const FIXTURE_ITEM_STACKS: [number, number][] = [
  [7, 10],
  [153, 20],
  [163, 10],
  [11, 10],
  [21, 5],
  [22, 5],
];

export function buildEboot(
  recipes: FixtureRecipe[],
  prices: FixturePrices = FIXTURE_PRICES,
): Buffer {
  const buf = Buffer.alloc(EBOOT_SIZE);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(buf, 0);
  const reader = new BinaryReader(buf);
  const { offset } = equipmentCreateLayout(reader).head;
  for (const r of recipes) {
    const at = offset + r.index * EQUIP_CREATE_ENTRY_SIZE;
    buf[at + 1] = r.hide ? 1 : 0;
    buf.writeUInt16LE(r.index, at + 2);
    r.materials.forEach((m, k) => {
      buf.writeUInt16LE(m.itemId, at + 4 + k * 4);
      buf.writeUInt16LE(m.quantity, at + 6 + k * 4);
    });
  }

  const create = equipmentCreateLayout(reader);
  const createAt = (section: keyof typeof create, entries: [number, Materials][]) =>
    entries.forEach(([weapon, materials], i) => {
      const at = create[section].offset + i * EQUIP_CREATE_ENTRY_SIZE;
      buf.writeUInt16LE(weapon, at + 2);
      writeMaterials(buf, at + 4, materials);
    });
  createAt("greatSwordLongSword", FIXTURE_WEAPON_CREATE);
  createAt("ancientRustBlademaster", FIXTURE_RUST_CREATE);
  const upgrade = equipmentUpgradeLayout(reader).blademaster.offset;
  for (const u of FIXTURE_UPGRADES) {
    const at = upgrade + u.index * EQUIP_UPGRADE_ENTRY_SIZE;
    writeMaterials(buf, at, u.craft);
    u.targets.forEach((t, k) => buf.writeUInt16LE(t, at + 16 + k * 2));
  }
  const weapons = tableOffset("weaponsBlademaster");
  const models = tableOffset("modelToWeaponType");
  for (const w of FIXTURE_WEAPONS) {
    const at = weapons + w.index * WEAPON_BM_ENTRY_SIZE;
    buf.writeUInt16LE(w.index, at);
    buf[at + 2] = w.rarity;
    buf.writeUInt16LE(w.attack, at + 10);
    buf.writeInt8(w.affinity, at + 13);
    if (w.element) [buf[at + 14], buf[at + 15]] = w.element;
    if (w.status) [buf[at + 16], buf[at + 17]] = w.status;
    buf[models + w.index] = WEAPON_TYPE_NAMES.indexOf(w.type);
  }
  for (const gun of FIXTURE_GUNNER_WEAPONS) {
    const at = tableOffset("weaponsGunner") + gun.index * WEAPON_GUN_ENTRY_SIZE;
    buf.writeUInt16LE(20 + gun.index, at);
    buf[at + 2] = gun.rarity;
    buf.writeUInt16LE(gun.attack, at + 8);
    buf.writeInt8(gun.affinity, at + 13);
    [buf[at + 17], buf[at + 18]] = gun.element;
    buf[models + 20 + gun.index] = WEAPON_TYPE_NAMES.indexOf("bow");
  }
  FIXTURE_CLASS_MODIFIERS.forEach((mod, i) =>
    buf.writeUInt32LE(mod, tableOffset("weaponClassModifiers") + i * 4),
  );

  ARMOR_SLOTS.forEach((slot, i) => {
    const array = ARMOR_ARRAYS + i * 20_000;
    buf.writeUInt32LE(
      JP_BASE_ADDRESS + array,
      tableOffset("armorValuePointers") + ARMOR_POINTER_INDEX[slot] * 4,
    );
  });
  // Item table: buy prices at +12 for the general store's items (and a sell price at +8),
  // carry limits at +3.
  const items = tableOffset("itemTable");
  for (const [id, price] of FIXTURE_ITEM_PRICES) {
    buf.writeUInt32LE(price, items + id * ITEM_ENTRY_SIZE + 12);
    buf.writeUInt32LE(Math.floor(price / 10), items + id * ITEM_ENTRY_SIZE + 8);
  }
  for (const [id, stack] of FIXTURE_ITEM_STACKS) buf[items + id * ITEM_ENTRY_SIZE + 3] = stack;

  for (const a of FIXTURE_ARMOR) {
    const at = armorValueAt(a.slot, a.index);
    buf.writeUInt16LE(a.hunterType & 1 ? a.index : 0, at); // male model
    buf.writeUInt16LE(a.hunterType & 2 ? a.index : 0, at + 2); // female model
    buf[at + 4] = a.hunterType;
    buf[at + 5] = a.rarity;
    (FIXTURE_ARMOR_SKILLS[`${a.slot}:${a.index}`] ?? []).forEach(([tree, points], k) => {
      buf[at + 30 + k * 2] = tree;
      buf.writeInt8(points, at + 31 + k * 2);
    });
  }
  // One decoration per tree, +1 each, after the table's dummy entry.
  const decoSkills = tableOffset("decorationSkills") + DECO_SKILL_ENTRY_SIZE;
  FIXTURE_DECORATION_TREES.forEach((tree, i) => {
    const at = decoSkills + i * DECO_SKILL_ENTRY_SIZE;
    buf[at] = 1;
    buf[at + 8] = tree;
    buf[at + 9] = 1;
  });
  for (const [slot, entries] of Object.entries(FIXTURE_ARMOR_CREATE)) {
    for (const [entry, piece, materials] of entries) {
      const at = create[slot as ArmorSlot].offset + entry * EQUIP_CREATE_ENTRY_SIZE;
      buf.writeUInt16LE(piece, at + 2);
      writeMaterials(buf, at + 4, materials);
    }
  }
  const bm = tableOffset("weaponsBlademaster");
  for (const [i, price] of prices.blademaster)
    buf.writeUInt32LE(price, bm + i * WEAPON_BM_ENTRY_SIZE + 4);
  for (const [i, price] of prices.armorHead) buf.writeUInt32LE(price, armorValueAt("head", i) + 8);
  const deco = tableOffset("decorationValues");
  for (const [i, price] of prices.decoration)
    buf.writeUInt32LE(price, deco + i * ITEM_ENTRY_SIZE + 12);
  return buf;
}

// ---------------------------------------------------------------- shops

export const LOBBY_LOAD = 0x09a5f200;

/** Shop lists in the fixture's lobby_task.ovl, by name. */
export const FIXTURE_SHOP_LISTS: Record<string, number[]> = {
  village1: [163, 7, 11, 153, 21, 22, 144],
  village2: [163, 7, 11, 153, 21, 22, 144, 97, 300],
  empty: [],
  granny1: [164, 167, 165],
  granny2: [168, 169, 166, 170],
  guild1: [7, 11, 153, 156],
  guild2: [7, 11, 153, 156, 38],
  special1: [223],
  special2: [223, 224, 865],
};

/** Tables in order, as the EU disc has them: village, granny (sharing a Guild list), Guild, special. */
export const FIXTURE_SHOP_TABLES: string[][] = [
  ["village1", "village2", "empty"],
  ["granny1", "granny2", "guild2"],
  ["guild1", "guild2"],
  ["special1", "special2"],
];

/** `lobby_task.ovl` with the shop lists (0xFFFF-ended) and their pointer tables. */
export function buildLobbyTask(): {
  buf: Buffer;
  listAt: Record<string, number>;
  tablesAt: number;
} {
  const buf = ovlHeader("lobby_task.ovl", LOBBY_LOAD, 0x1000);
  buf.fill(0x77, 0x80); // not items, not pointers
  const listAt: Record<string, number> = {};
  let at = 0x200;
  for (const [name, items] of Object.entries(FIXTURE_SHOP_LISTS)) {
    listAt[name] = at;
    items.forEach((v, i) => buf.writeUInt16LE(v, at + i * 2));
    buf.writeUInt16LE(0xffff, at + items.length * 2);
    at += items.length * 2 + 2;
    if (at % 4 !== 0) {
      buf.writeUInt16LE(0xffff, at); // the EU lists are 4-byte aligned, padded with 0xFFFF
      at += 2;
    }
  }
  const tablesAt = 0x600;
  let p = tablesAt;
  for (const table of FIXTURE_SHOP_TABLES) {
    for (const name of table) {
      buf.writeUInt32LE(LOBBY_LOAD + listAt[name]!, p);
      p += 4;
    }
    buf.writeUInt32LE(0, p);
    p += 4;
  }
  return { buf, listAt, tablesAt };
}

// ---------------------------------------------------------------- quest board

/** JP DATA.BIN indices of `mission_jpn/level1.mib` and `level2.mib`. */
export const BOARD_INDICES = [5310, 5311];

/**
 * A board file (`level*.mib`, see src/game/board.ts): record offsets, then
 * per quest a 0x34-byte copy of its header's display section (quest file
 * 0x4c-0x7f, with the offset of its `LangPTRs` in place of the quest's),
 * its strings back to back, its `StringPTRs` blocks and its `LangPTRs`.
 * A quest's `text` gives the same blocks as its quest file.
 */
export function buildBoardFile(quests: FixtureQuest[]): Buffer {
  const parts: Buffer[] = [];
  let at = quests.length * 4;
  const place = (buf: Buffer): number => {
    parts.push(buf);
    at += buf.length;
    return at - buf.length;
  };
  const table = Buffer.alloc(quests.length * 4);
  for (const [i, q] of quests.entries()) {
    const header = Buffer.alloc(0x34);
    const recordAt = place(header);
    table.writeUInt32LE(recordAt, i * 4);
    buildQuestPayload(q).copy(header, 0, 0x4c, 0x80);
    const fromText = (goal: string): FixtureText => [
      q.text!.title,
      goal,
      "Fail",
      "Details",
      "Monsters",
      "Client",
    ];
    const text =
      q.slots ??
      (q.text ? [fromText(q.text.goal), 0, fromText(q.text.otherGoal), 2, 2, 2, 0] : null) ??
      FIXTURE_TEXT[q.questId] ??
      [];
    const own = text.map((t) =>
      Array.isArray(t) ? t.map((str) => place(Buffer.from(`${str}\0`, "utf8"))) : null,
    );
    const blocks = own.map((ptrs) => {
      if (!ptrs) return 0;
      const block = Buffer.alloc(24);
      ptrs.forEach((ptr, k) => block.writeUInt32LE(ptr, k * 4));
      return place(block);
    });
    const langs = Buffer.alloc(28);
    text.forEach((t, k) =>
      langs.writeUInt32LE(typeof t === "number" ? blocks[t]! : t ? blocks[k]! : 0, k * 4),
    );
    header.writeUInt32LE(place(langs), 0x14);
  }
  return Buffer.concat([table, ...parts]);
}

// ---------------------------------------------------------------- DATA.BIN

/**
 * DATA.BIN with `count` files of one sector each, except those given:
 * encrypted like the retail discs, or plain like FUComplete's.
 */
export function buildDataBin(
  count: number,
  files: Map<number, Buffer>,
  raw: ReadonlySet<number>,
  encrypted = true,
): Buffer {
  const lengths = Array.from({ length: count }, (_, i) =>
    Math.max(1, Math.ceil((files.get(i)?.length ?? SECTOR) / SECTOR)),
  );
  const tocSectors = Math.ceil(((count + 1) * 4) / SECTOR);
  const toc = Buffer.alloc(tocSectors * SECTOR);
  let lba = tocSectors;
  const starts: number[] = [];
  for (let i = 0; i < count; i++) {
    starts.push(lba);
    toc.writeUInt32LE(lba, i * 4);
    lba += lengths[i]!;
  }
  toc.writeUInt32LE(lba, count * 4);
  const out = Buffer.alloc(lba * SECTOR);
  (encrypted ? encryptDataBinBlock(toc, 0) : toc).copy(out, 0);
  for (let i = 0; i < count; i++) {
    const plain = Buffer.alloc(lengths[i]! * SECTOR);
    files.get(i)?.copy(plain);
    const enc = !encrypted || raw.has(i) ? plain : encryptDataBinBlock(plain, starts[i]!);
    enc.copy(out, starts[i]! * SECTOR);
  }
  return out;
}

// ---------------------------------------------------------------- the disc

export const QUEST_INDICES = [4759, 4760, 4761, 4762, 4763];
/** Where the text disc puts `FIXTURE_TEXT_QUEST`. */
export const TEXT_QUEST_INDEX = 4764;
export const GAME_TASK_INDEX = 51;
export const GAME_SUB_INDEX = 56;
export const LOBBY_TASK_INDEX = 50;

/**
 * Low Rank 1★: quests 1001 (monster 1, mines item 120) and 10102 (a Village
 * quest with only gathering points, and monsters 1 and 37); Low Rank 2★:
 * quest 10101 (monster 2);
 * High Rank 6★: quest 2001 (monster 1). Items 1xx are Low Rank, 2xx High
 * Rank. Every Village and Guild quest has gathering points.
 *
 * Supply boxes hold items 14x (and a Map, 863, and Paw Pass Ticket, 927,
 * which are quest-only items). 10102 is a delivery quest for item 126,
 * which its gathering points give; 10101 is a Paw Pass Ticket delivery,
 * with the ticket in its supply box.
 */
const FAIL_EN = "Reward Zero\nTime Over";
const FAIL_DE = "Keine Belohnung\nZeit um";
const en = (title: string, goal: string, details: string, monsters: string): FixtureText => [
  title,
  goal,
  FAIL_EN,
  details,
  monsters,
  "A Hunter",
];
const de = (title: string, goal: string, details: string, monsters: string): FixtureText => [
  title,
  goal,
  FAIL_DE,
  details,
  monsters,
  "Ein Jäger",
];

/**
 * Invented quest text (not the game's) in an English slot (1, shared by 0
 * and 6) and a German-style slot (2). German puts "die" before Rathian and
 * "den" before the other two, so Rathian swaps keep their German text.
 * Quest 1001 has its own copy of the English text in slot 0, as room to
 * repack into; 2001's only room is its monster list, the same in both.
 */
export const FIXTURE_TEXT: Record<number, (FixtureText | number | null)[]> = {
  1001: [
    en(
      "The Queen of the Land",
      "Hunt the Rathian",
      "The Rathian has\nbeen seen nearby.",
      "Rathian\nVelociprey",
    ),
    en(
      "The Queen of the Land",
      "Hunt the Rathian",
      "The Rathian has\nbeen seen nearby.",
      "Rathian\nVelociprey",
    ),
    de("Die Königin", "Jage die Rathian", "Die Rathian wurde\ngesehen.", "Rathian\nVelociprey"),
    null,
    null,
    null,
    1,
  ],
  10101: [
    1,
    en(
      "Black Dragon",
      "Slay the Fatalis before\nit flies away",
      "A black dragon was seen\nover the mountains.",
      "Fatalis",
    ),
    de(
      "Schwarzer Drache",
      "Erlege den Fatalis bevor\ner wegfliegt",
      "Ein schwarzer Drache wurde\nüber den Bergen gesehen.",
      "Fatalis",
    ),
    null,
    null,
    null,
    1,
  ],
  2001: [
    1,
    en("Rathian Returns", "Hunt the Rathian", "She's back.", "Rathian\nVelociprey"),
    de("Rathian kehrt zurück", "Jage die Rathian", "Sie ist zurück.", "Rathian\nVelociprey"),
    null,
    null,
    null,
    1,
  ],
  20001: [1, en("Training", "Hunt the Rathian", "Practice.", "Rathian"), null, null, null, null, 1],
  20002: [
    1,
    en("Pink Queen", "Hunt the Pink Rathian", "A rare one.", "Pink Rathian\nVelociprey"),
    de("Rosa Königin", "Jage den Rosa Rathian", "Selten.", "Rosa Rathian\nVelociprey"),
    null,
    null,
    null,
    1,
  ],
};

export const FIXTURE_QUESTS: FixtureQuest[] = [
  {
    questId: 1001,
    rank: 1,
    stars: 1,
    // Table 1 (item 121) is used by no node, so it doesn't count. Table 3 is
    // table 0 again, so its two slots are read once. Table 2's item 0 isn't an item.
    gathering: {
      tables: [
        [
          [10, 120],
          [30, 122],
        ],
        [[10, 121]],
        [
          [20, 123],
          [40, 0],
        ],
        0,
      ],
      areas: { 0: [0, 0], 3: [2, 3] },
    },
    supplies: [
      [863, 1],
      [863, 1],
      [140, 3],
      [140, 3],
      [141, 2],
    ],
    terms: { fee: 100, reward: 1200, penalty: 400, minutes: 50 },
    monsters: [1],
    powers: [3],
    small: [
      [16, 5],
      [69, 99],
    ],
    rewards: [
      [
        { chance: 60, itemId: 110, amount: 1 },
        { chance: 40, itemId: 111, amount: 2 },
      ],
      [{ chance: 100, itemId: 112, amount: 1 }],
    ],
  },
  {
    questId: 10101,
    rank: 1,
    stars: 2,
    gathering: {
      tables: [
        [
          [10, 130],
          [20, 131],
        ],
      ],
      areas: { 0: [0] },
    },
    supplies: [
      [927, 1],
      [142, 4],
    ],
    terms: { fee: 200, reward: 2400, penalty: 800, minutes: 50 },
    delivery: { itemId: 927, amount: 1 },
    monsters: [2],
    powers: [6],
    small: [[16, 2]],
    rewards: [[{ chance: 100, itemId: 113, amount: 3 }]],
  },
  {
    questId: 2001,
    rank: 2,
    stars: 6,
    sizePercent: 110,
    gathering: {
      tables: [
        [
          [50, 220],
          [50, 221],
        ],
        [[100, 222]],
      ],
      areas: { 0: [0], 2: [1] },
    },
    supplies: [[240, 5]],
    terms: { fee: 0, reward: 6000, penalty: 2000, minutes: 35 },
    monsters: [1],
    powers: [12],
    small: [[16, 8]],
    rewards: [
      [
        { chance: 70, itemId: 210, amount: 1 },
        { chance: 30, itemId: 211, amount: 1 },
      ],
    ],
  },
  // Training School: never shuffled.
  {
    questId: 20001,
    rank: 0,
    stars: 1,
    gathering: { tables: [[[10, 998]]], areas: { 0: [0] } },
    supplies: [[997, 1]],
    terms: { fee: 10, reward: 100, penalty: 30, minutes: 20 },
    monsters: [1],
    rewards: [[{ chance: 100, itemId: 999, amount: 1 }]],
  },
  {
    questId: 10102,
    rank: 1,
    stars: 1,
    gathering: {
      tables: [
        [
          [25, 124],
          [25, 125],
          [50, 126],
        ],
      ],
      areas: { 1: [0, 0, 0, 0] },
    },
    supplies: [
      [143, 2],
      [144, 1],
    ],
    terms: { fee: 50, reward: 300, penalty: 100, minutes: 20 },
    delivery: { itemId: 126, amount: 4 },
    text: {
      title: "Fixture Delivery",
      goal: "Deliver 4 of the fixture's own things",
      otherGoal: "Kurz",
    },
    // Two kinds of large monster: only variant swaps change it.
    monsters: [1, 37],
    powers: [4, 4],
    rewards: [],
  },
];

/**
 * Pink Rathian on its own, so the text tests can learn its name (10102's
 * text is the delivery tests'). A Training School quest, so no shuffle
 * changes it. Only on the text disc (`buildFixtureDisc({ text: true })`).
 */
export const FIXTURE_TEXT_QUEST: FixtureQuest = {
  questId: 20002,
  rank: 0,
  stars: 1,
  supplies: [[997, 1]],
  terms: { fee: 10, reward: 100, penalty: 30, minutes: 20 },
  monsters: [37],
  powers: [4],
  rewards: [],
};

export const FIXTURE_CARVES: CarveListSpec[] = [
  {
    emId: 1,
    kind: 0,
    rank: 1,
    entries: [
      { chance: 50, itemId: 100 },
      { chance: 50, itemId: 101 },
    ],
  },
  {
    emId: 2,
    kind: 0,
    rank: 1,
    entries: [
      { chance: 80, itemId: 102 },
      { chance: 20, itemId: 103 },
    ],
  },
  { emId: 1, kind: 0, rank: 2, entries: [{ chance: 100, itemId: 200 }] },
  // Monster 3 is in no quest: its list is left alone.
  { emId: 3, kind: 0, rank: 1, entries: [{ chance: 100, itemId: 150 }] },
];

export const FIXTURE_CAPTURES: CaptureListSpec[] = [
  { emId: 1, rank: 1, entries: [{ chance: 100, itemId: 104, amount: 2 }] },
];

export const FIXTURE_RECIPES: FixtureRecipe[] = [
  {
    index: 1,
    hide: true,
    materials: [
      { itemId: 100, quantity: 2 },
      { itemId: 102, quantity: 1 },
    ],
  },
  {
    index: 2,
    materials: [
      { itemId: 101, quantity: 1 },
      { itemId: 103, quantity: 3 },
      { itemId: 110, quantity: 1 },
    ],
  },
  {
    index: 3,
    materials: [
      { itemId: 200, quantity: 1 },
      { itemId: 104, quantity: 1 },
      { itemId: 300, quantity: 5 },
    ],
  },
  {
    index: 4,
    materials: [
      { itemId: 120, quantity: 4 },
      { itemId: 102, quantity: 2 },
    ],
  },
];

export interface FixtureArmor {
  slot: ArmorSlot;
  index: number;
  /** `HunterType` bits: 1 male, 2 female, 4 Blademaster, 8 Gunner (15 = anyone). */
  hunterType: number;
  /** Raw rarity (shown as rarity + 1). */
  rarity: number;
}

/**
 * Armor pieces (`ArmorValues`). Head: anyone at rarity 1 (1, 2, 5; 9 is in
 * no create entry) and rarity 2 (3, 4); male-only 6 and 8, female-only 7;
 * 10 and 11 have no `HunterType` bits. Chest, rarity 1: Blademaster 1 and
 * 3, Gunner 2 and 4, anyone 5. Legs, rarity 3: anyone 1, 2, 3. Model IDs
 * are the index, or 0 for the sex that can't wear it.
 */
const pieces = (slot: ArmorSlot, rows: [index: number, hunterType: number, rarity: number][]) =>
  rows.map(([index, hunterType, rarity]): FixtureArmor => ({ slot, index, hunterType, rarity }));

export const FIXTURE_ARMOR: FixtureArmor[] = [
  ...pieces("head", [
    [1, 15, 0],
    [2, 15, 0],
    [3, 15, 1],
    [4, 15, 1],
    [5, 15, 0],
    [6, 13, 1],
    [7, 14, 1],
    [8, 13, 1],
    [9, 15, 0],
    [10, 0, 0],
    [11, 0, 0],
  ]),
  ...pieces("chest", [
    [1, 7, 0],
    [2, 11, 0],
    [3, 7, 0],
    [4, 11, 0],
    [5, 15, 0],
  ]),
  ...pieces("leg", [
    [1, 15, 2],
    [2, 15, 2],
    [3, 15, 2],
  ]),
];

/**
 * Armor create entries besides `FIXTURE_RECIPES` (head entries 1-4, which
 * make pieces 1-4), by slot: [entry, piece, materials]. Head piece 5 and
 * chest piece 3 have a second recipe.
 */
export const FIXTURE_ARMOR_CREATE: Partial<Record<ArmorSlot, [number, number, Materials][]>> = {
  head: [
    [5, 5, [{ itemId: 111, quantity: 1 }]],
    [6, 6, [{ itemId: 112, quantity: 1 }]],
    [7, 7, [{ itemId: 113, quantity: 2 }]],
    [8, 8, [{ itemId: 101, quantity: 1 }]],
    [9, 5, [{ itemId: 110, quantity: 2 }]],
    [10, 10, [{ itemId: 100, quantity: 1 }]],
    [11, 11, [{ itemId: 100, quantity: 3 }]],
  ],
  chest: [
    [0, 1, [{ itemId: 100, quantity: 1 }]],
    [1, 2, [{ itemId: 101, quantity: 1 }]],
    [2, 3, [{ itemId: 102, quantity: 1 }]],
    [3, 4, [{ itemId: 103, quantity: 1 }]],
    [4, 5, [{ itemId: 104, quantity: 1 }]],
    [5, 3, [{ itemId: 110, quantity: 1 }]],
  ],
  leg: [
    [0, 1, [{ itemId: 111, quantity: 1 }]],
    [1, 2, [{ itemId: 112, quantity: 1 }]],
    [2, 3, [{ itemId: 113, quantity: 1 }]],
  ],
};

/** Skill trees the fixture uses (`SkillID`). */
export const TREE = {
  torsoUp: 1,
  health: 9,
  sharpness: 11,
  guard: 16,
  reload: 20,
  recoil: 21,
  hunger: 33,
  attack: 35,
  defense: 36,
  protection: 37,
  gathering: 52,
  fate: 55,
  stamina: 65,
  edgemaster: 92,
} as const;

/**
 * Armor skills (`ArmorValue` +30): [tree, points] per entry, [0, 0] for an
 * empty one. Sharpness and Guard are only on Blademaster pieces, Reload and
 * Recoil only on Gunner ones; the rest are on both or on pieces anyone can
 * wear; Health, Stamina, Fate and Protection only on pieces anyone can
 * wear. Edgemaster has no decoration; Gathering is only on one. Head 7
 * (female only) has Torso Up; head 8 has a 0-point Protection entry; leg 1
 * lists Defense twice, alone in its rarity's negative entries, so no
 * shuffle can avoid the repeat. Head 9 (in no create entry) and 10 (no
 * `HunterType` bits) have skills that must stay.
 */
export const FIXTURE_ARMOR_SKILLS: Record<string, [tree: number, points: number][]> = {
  "head:1": [
    [TREE.attack, 2],
    [TREE.defense, 1],
    [0, 0],
    [TREE.health, -1],
  ],
  "head:2": [
    [TREE.health, 3],
    [TREE.stamina, 2],
    [TREE.hunger, -2],
  ],
  "head:5": [
    [TREE.defense, 2],
    [TREE.fate, 1],
  ],
  "head:9": [[TREE.attack, 10]],
  "head:3": [
    [TREE.protection, 3],
    [TREE.attack, -2],
  ],
  "head:4": [
    [TREE.stamina, 4],
    [TREE.edgemaster, 2],
    [TREE.fate, -1],
  ],
  "head:6": [[TREE.health, 2]],
  "head:7": [[TREE.torsoUp, 1]],
  "head:8": [
    [TREE.defense, 3],
    [TREE.hunger, -1],
    [TREE.protection, 0],
  ],
  "head:10": [[TREE.attack, 5]],
  "chest:1": [
    [TREE.sharpness, 2],
    [TREE.attack, 1],
    [TREE.hunger, -1],
  ],
  "chest:3": [
    [TREE.guard, 3],
    [TREE.defense, 1],
  ],
  "chest:2": [
    [TREE.reload, 2],
    [TREE.recoil, 1],
    [TREE.hunger, -1],
  ],
  "chest:4": [
    [TREE.reload, 1],
    [TREE.attack, 2],
    [TREE.defense, -1],
  ],
  "chest:5": [
    [TREE.edgemaster, 3],
    [TREE.defense, 1],
  ],
  "leg:1": [
    [TREE.attack, 3],
    [TREE.defense, -2],
    [TREE.defense, -1],
  ],
  "leg:2": [
    [TREE.health, 3],
    [TREE.fate, 2],
  ],
  "leg:3": [
    [TREE.protection, 2],
    [TREE.edgemaster, 2],
  ],
};

/** Trees with a decoration: every tree above but Torso Up and Edgemaster, and Gathering. */
export const FIXTURE_DECORATION_TREES: number[] = Object.values(TREE).filter(
  (t) => t !== TREE.torsoUp && t !== TREE.edgemaster,
);

/** JP's unencrypted DATA.BIN entries (`JP_EXCEPTIONS` in mhfu-extract's databin.ts). */
export const JP_RAW = new Set([
  22, 23, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
]);

/**
 * The fixture EBOOT, plain or encrypted. A tag decryptPrx doesn't know is
 * written over a known one after encrypting, for a disc it can't open.
 */
function fixtureEboot(options: FixtureDiscOptions): Buffer {
  const elf = buildEboot(FIXTURE_RECIPES);
  if (options.ebootTag === undefined) return elf;
  const known = GAME_TAG_KEYS.has(options.ebootTag) || TYPE01_TAG_KEYS.has(options.ebootTag);
  const raw = encryptGameEboot(elf, { tag: known ? options.ebootTag : undefined, compress: true });
  if (!known) raw.writeUInt32LE(options.ebootTag, 0xd0);
  return raw;
}

export interface FixtureDiscOptions {
  /** Encrypt the EBOOT as a game EBOOT ("~PSP") with this tag, as on a real disc. */
  ebootTag?: number;
  /**
   * Quest text for the renaming tests: `FIXTURE_TEXT` in the quests that
   * have no text of their own, `FIXTURE_TEXT_QUEST`, and two quest board
   * files. Off by default, so the other tests' disc stays as it is.
   */
  text?: boolean;
}

export function buildFixtureDisc(options: FixtureDiscOptions = {}): Buffer {
  const files = new Map<number, Buffer>();
  const withText = (q: FixtureQuest): FixtureQuest =>
    options.text && !q.text ? { ...q, slots: q.slots ?? FIXTURE_TEXT[q.questId] } : q;
  FIXTURE_QUESTS.forEach((q, i) =>
    files.set(QUEST_INDICES[i]!, buildQuestEntry(buildQuestPayload(withText(q)))),
  );
  files.set(GAME_TASK_INDEX, buildGameTask());
  files.set(GAME_SUB_INDEX, buildGameSub(FIXTURE_CARVES, FIXTURE_CAPTURES));
  files.set(LOBBY_TASK_INDEX, buildLobbyTask().buf);
  files.set(22, Buffer.from("stored raw"));
  let count = QUEST_INDICES.at(-1)! + 2;
  if (options.text) {
    files.set(TEXT_QUEST_INDEX, buildQuestEntry(buildQuestPayload(withText(FIXTURE_TEXT_QUEST))));
    // Quests 2001 and 10102 (the delivery quest, with its text) are on two
    // boards, as some quests are on the disc.
    const byId = (id: number) => withText(FIXTURE_QUESTS.find((q) => q.questId === id)!);
    files.set(
      BOARD_INDICES[0]!,
      buildBoardFile([byId(1001), byId(2001), byId(10101), byId(10102)]),
    );
    files.set(BOARD_INDICES[1]!, buildBoardFile([byId(2001), byId(10102)]));
    count = BOARD_INDICES.at(-1)! + 1;
  }
  const dataBin = buildDataBin(count, files, JP_RAW);
  return buildIso([
    { path: "PSP_GAME/PARAM.SFO", data: buildSfo("ULJM05500") },
    { path: "PSP_GAME/SYSDIR/EBOOT.BIN", data: fixtureEboot(options) },
    { path: "PSP_GAME/USRDIR/DATA.BIN", data: dataBin },
  ]);
}
