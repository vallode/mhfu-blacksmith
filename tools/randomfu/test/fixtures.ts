/**
 * A tiny synthetic disc for tests: an ISO 9660 image with PARAM.SFO, a plain
 * ELF-magic EBOOT.BIN with a few recipes, and an encrypted DATA.BIN holding
 * three quests, `game_task.ovl` and a `game_sub.ovl` with reward tables.
 * No game data: every value is made up.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { encryptDataBinBlock } from "../../mhfu-extract/src/container/databin.js";
import {
  CAP_BREAK_POINTER_COUNT,
  CAPTURE_TYPE,
  CARVE_INDEX_COUNT,
  CARVE_INDEX_SIZE,
  CARVE_POINTER_COUNT,
} from "../../mhfu-extract/src/monsters/rewards.js";
import { encryptQuestBlock, questHash, QUEST_MAGIC } from "../../mhfu-extract/src/quests/mib.js";
import { BinaryReader } from "../../mhfu-extract/src/binary/reader.js";
import { equipmentCreateLayout } from "../../mhfu-extract/src/tables/recipes.js";
import {
  ARMOR_ENTRY_SIZE,
  EQUIP_CREATE_ENTRY_SIZE,
  ITEM_ENTRY_SIZE,
  JP_BASE_ADDRESS,
  WEAPON_BM_ENTRY_SIZE,
  tableOffset,
} from "../../mhfu-extract/src/tables/offsets.js";
import { ARMOR_POINTER_INDEX, ARMOR_SLOTS } from "../../mhfu-extract/src/tables/armor.js";

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
  rewards: FixtureReward[][];
  /** Gathering: item tables (one item each); `nodes` lists which tables area 0's nodes use. */
  gathering?: { tables: number[]; nodes: number[] };
}

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
  });
  data.writeInt16LE(-1, q.monsters.length * 60);
  const dataPtr = place(data);
  const table = Buffer.alloc(32);
  table.writeUInt32LE(1, 0);
  table.writeUInt32LE(dataPtr, 12);
  const largeMonPtr = place(table);
  let gatheringLocPtr = 0;
  let gatheringItemsPtr = 0;
  if (q.gathering) {
    const tablePtrs = q.gathering.tables.map((item) => {
      const t = Buffer.alloc(8);
      t.writeUInt16LE(10, 0); // value
      t.writeUInt16LE(item, 2);
      t.writeUInt16LE(0xffff, 4);
      return place(t);
    });
    const list = Buffer.alloc(tablePtrs.length * 4 + 4);
    tablePtrs.forEach((ptr, i) => list.writeUInt32LE(ptr, i * 4));
    gatheringItemsPtr = place(list);
    const nodes = Buffer.alloc(q.gathering.nodes.length * 24 + 4);
    q.gathering.nodes.forEach((table, i) => {
      nodes.writeFloatLE(100 + i, i * 24);
      nodes.writeUInt16LE(table, i * 24 + 16);
      nodes.writeUInt16LE(3, i * 24 + 20); // mining
    });
    nodes.writeUInt32LE(0xbf800000, q.gathering.nodes.length * 24);
    const nodesPtr = place(nodes);
    const areas = Buffer.alloc(10 * 4);
    areas.writeUInt32LE(nodesPtr, 0);
    gatheringLocPtr = place(areas);
  }
  place(Buffer.from([0x55])); // odd length

  const header = Buffer.alloc(0x80);
  QUEST_MAGIC.copy(header, 0);
  header.writeUInt32LE(rewardsPtr, 12);
  header.writeUInt32LE(largeMonPtr, 20);
  header.writeUInt32LE(gatheringLocPtr, 28);
  header.writeUInt32LE(gatheringItemsPtr, 36);
  header[68] = q.rank;
  header.writeUInt16LE(q.questId, 100);
  header[102] = q.stars;
  header[104] = GATHERING_MAP;
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

  ARMOR_SLOTS.forEach((slot, i) => {
    const array = ARMOR_ARRAYS + i * 20_000;
    buf.writeUInt32LE(
      JP_BASE_ADDRESS + array,
      tableOffset("armorValuePointers") + ARMOR_POINTER_INDEX[slot] * 4,
    );
  });
  const bm = tableOffset("weaponsBlademaster");
  for (const [i, price] of prices.blademaster)
    buf.writeUInt32LE(price, bm + i * WEAPON_BM_ENTRY_SIZE + 4);
  for (const [i, price] of prices.armorHead)
    buf.writeUInt32LE(price, ARMOR_ARRAYS + i * ARMOR_ENTRY_SIZE + 8);
  const deco = tableOffset("decorationValues");
  for (const [i, price] of prices.decoration)
    buf.writeUInt32LE(price, deco + i * ITEM_ENTRY_SIZE + 12);
  return buf;
}

// ---------------------------------------------------------------- DATA.BIN

/** Encrypted DATA.BIN with `count` files of one sector each, except those given. */
export function buildDataBin(
  count: number,
  files: Map<number, Buffer>,
  raw: ReadonlySet<number>,
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
  encryptDataBinBlock(toc, 0).copy(out, 0);
  for (let i = 0; i < count; i++) {
    const plain = Buffer.alloc(lengths[i]! * SECTOR);
    files.get(i)?.copy(plain);
    const enc = raw.has(i) ? plain : encryptDataBinBlock(plain, starts[i]!);
    enc.copy(out, starts[i]! * SECTOR);
  }
  return out;
}

// ---------------------------------------------------------------- the disc

export const QUEST_INDICES = [4759, 4760, 4761, 4762];
export const GAME_TASK_INDEX = 51;
export const GAME_SUB_INDEX = 56;

/**
 * Low Rank 1★: quest 1001 (monster 1, mines item 120); Low Rank 2★: quest
 * 10101 (monster 2); High Rank 6★: quest 2001 (monster 1). Items 1xx are
 * Low Rank, 2xx High Rank.
 */
export const FIXTURE_QUESTS: FixtureQuest[] = [
  {
    questId: 1001,
    rank: 1,
    stars: 1,
    // Item 120 is mined here; table 1 (item 121) is used by no node, so it doesn't count.
    gathering: { tables: [120, 121], nodes: [0, 0] },
    monsters: [1],
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
    monsters: [2],
    rewards: [[{ chance: 100, itemId: 113, amount: 3 }]],
  },
  {
    questId: 2001,
    rank: 2,
    stars: 6,
    monsters: [1],
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
    monsters: [1],
    rewards: [[{ chance: 100, itemId: 999, amount: 1 }]],
  },
];

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

/** JP's unencrypted DATA.BIN entries (`JP_EXCEPTIONS` in mhfu-extract's databin.ts). */
export const JP_RAW = new Set([
  22, 23, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
]);

export function buildFixtureDisc(): Buffer {
  const files = new Map<number, Buffer>();
  FIXTURE_QUESTS.forEach((q, i) =>
    files.set(QUEST_INDICES[i]!, buildQuestEntry(buildQuestPayload(q))),
  );
  files.set(GAME_TASK_INDEX, ovlHeader("game_task.ovl", 0x09a5a580, 0x100));
  files.set(GAME_SUB_INDEX, buildGameSub(FIXTURE_CARVES, FIXTURE_CAPTURES));
  files.set(22, Buffer.from("stored raw"));
  const dataBin = buildDataBin(QUEST_INDICES.at(-1)! + 2, files, JP_RAW);
  return buildIso([
    { path: "PSP_GAME/PARAM.SFO", data: buildSfo("ULJM05500") },
    { path: "PSP_GAME/SYSDIR/EBOOT.BIN", data: buildEboot(FIXTURE_RECIPES) },
    { path: "PSP_GAME/USRDIR/DATA.BIN", data: dataBin },
  ]);
}
