/**
 * A tiny synthetic disc for tests: an ISO 9660 image with PARAM.SFO, a plain
 * ELF-magic EBOOT.BIN with a few recipes, and an encrypted DATA.BIN holding
 * three quests, `game_task.ovl` and a `game_sub.ovl` with reward tables.
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
  rewards: FixtureReward[][];
  gathering?: FixtureGathering;
}

/**
 * Gathering points: item tables as `[value, item]` pairs (or the index of
 * an earlier table, to point at the same data), and the tables each area's
 * nodes use.
 */
export interface FixtureGathering {
  tables: ([value: number, item: number][] | number)[];
  areas: Record<number, number[]>;
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
        nodes.writeUInt16LE(3, i * 24 + 20); // mining
      });
      nodes.writeUInt32LE(0xbf800000, used.length * 24);
      areas.writeUInt32LE(place(nodes), Number(area) * 4);
    }
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
}

/**
 * Blademaster weapons. Model ID = index. Great Sword rarity 1: 1, 3, 9
 * (2 is in no tree; 7 comes from rust shards); rarity 2: 4, 5. Long Sword
 * rarity 1: 6; rarity 2: 8 (an upgrade from Great Sword 3, as the game has).
 */
export const FIXTURE_WEAPONS: FixtureWeapon[] = [
  { index: 1, type: "great-sword", rarity: 0 },
  { index: 2, type: "great-sword", rarity: 0 },
  { index: 3, type: "great-sword", rarity: 0 },
  { index: 4, type: "great-sword", rarity: 1 },
  { index: 5, type: "great-sword", rarity: 1 },
  { index: 6, type: "long-sword", rarity: 0 },
  { index: 7, type: "great-sword", rarity: 0 },
  { index: 8, type: "long-sword", rarity: 1 },
  { index: 9, type: "great-sword", rarity: 0 },
];

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
    buf.writeUInt16LE(w.index, weapons + w.index * WEAPON_BM_ENTRY_SIZE);
    buf[weapons + w.index * WEAPON_BM_ENTRY_SIZE + 2] = w.rarity;
    buf[models + w.index] = WEAPON_TYPE_NAMES.indexOf(w.type);
  }

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

export const QUEST_INDICES = [4759, 4760, 4761, 4762, 4763];
export const GAME_TASK_INDEX = 51;
export const GAME_SUB_INDEX = 56;
export const LOBBY_TASK_INDEX = 50;

/**
 * Low Rank 1★: quests 1001 (monster 1, mines item 120) and 10102 (a Village
 * quest with only gathering points); Low Rank 2★: quest 10101 (monster 2);
 * High Rank 6★: quest 2001 (monster 1). Items 1xx are Low Rank, 2xx High
 * Rank. Every Village and Guild quest has gathering points.
 */
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
    gathering: {
      tables: [
        [
          [10, 130],
          [20, 131],
        ],
      ],
      areas: { 0: [0] },
    },
    monsters: [2],
    rewards: [[{ chance: 100, itemId: 113, amount: 3 }]],
  },
  {
    questId: 2001,
    rank: 2,
    stars: 6,
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
    gathering: { tables: [[[10, 998]]], areas: { 0: [0] } },
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
      areas: { 1: [0] },
    },
    monsters: [1],
    rewards: [],
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
}

export function buildFixtureDisc(options: FixtureDiscOptions = {}): Buffer {
  const files = new Map<number, Buffer>();
  FIXTURE_QUESTS.forEach((q, i) =>
    files.set(QUEST_INDICES[i]!, buildQuestEntry(buildQuestPayload(q))),
  );
  files.set(GAME_TASK_INDEX, ovlHeader("game_task.ovl", 0x09a5a580, 0x100));
  files.set(GAME_SUB_INDEX, buildGameSub(FIXTURE_CARVES, FIXTURE_CAPTURES));
  files.set(LOBBY_TASK_INDEX, buildLobbyTask().buf);
  files.set(22, Buffer.from("stored raw"));
  const dataBin = buildDataBin(QUEST_INDICES.at(-1)! + 2, files, JP_RAW);
  return buildIso([
    { path: "PSP_GAME/PARAM.SFO", data: buildSfo("ULJM05500") },
    { path: "PSP_GAME/SYSDIR/EBOOT.BIN", data: fixtureEboot(options) },
    { path: "PSP_GAME/USRDIR/DATA.BIN", data: dataBin },
  ]);
}
