/**
 * Pokke Farm's gathering tables in the EBOOT: what each Mining Point,
 * Insect Thicket, Mushroom Tree and Bee Hive can give. They sit back to
 * back at EU file offset `0x19AAD0` (`0x0899C51C`), in this order: five
 * mining tables of 12 rows, five insect tables of 11, three mushroom tables
 * of 7 and three honey tables of 3. A row is `{ u16 item, u16 chance }`;
 * a table's chances add up to 100, and unused rows at its end are zero.
 *
 * The farm restock (EU `0x08855F98`, called from `game_sub.ovl` after a
 * quest, and from `edit_task.ovl` for a new hunter) rolls every table:
 * each draw takes `rand() % 100` and walks the rows, subtracting chances,
 * so a row's chance is its item's chance in percent. It draws:
 *
 * - each Mining Point and Insect Thicket: `3 + rand() % 2`, so 3 or 4;
 * - each Mushroom Tree: 3-4, 5-6 and 7-8 (`3 + 2 * level`, plus 0 or 1);
 * - each Bee Hive: its base count plus 0 or 1, the base counts being
 *   three u32s `HONEY_COUNTS_AFTER` bytes past the first table (2, 3 and 5
 *   at EU `0x0899CBFC`), read with the tables.
 *
 * The other counts are constants in the routine's code.
 *
 * The upgrades' names and what they do come from the farm's text (EU
 * DATA.BIN 4781): Mining Point +1 to +4 "expand the number of Mining
 * Points", as Insect Thicket +1 to +4 add thickets, so each table is a
 * point of its own, the first one there from the start. The Mushroom Trees
 * and Bee Hives are bought, one model after another.
 */
import type { BinaryReader } from "../binary/reader.js";
import { ITEM_COUNT } from "../shops/shops.js";

/** EU file offset of the first mining table. */
export const FARM_TABLES_EU = 0x19aad0;
export const FARM_ROW_SIZE = 4;
/** The Bee Hives' base counts, from the first table. */
export const HONEY_COUNTS_AFTER = 0x6e0;
/** No count should come near this; a bigger one isn't the counts. */
const MAX_HONEY_COUNT = 20;

export type FarmSpot = "mining" | "insects" | "mushrooms" | "honey";

export interface FarmSpotLayout {
  spot: FarmSpot;
  /** Rows per table, padding included. */
  rows: number;
  /** Each level's name and how many times the restock draws from it, at least and at most. */
  levels: { name: string; gathers: number; mostGathers: number }[];
}

const points = (base: string, gathers: number, mostGathers: number) =>
  ["", " +1", " +2", " +3", " +4"].map((s) => ({ name: base + s, gathers, mostGathers }));

/** The tables in EBOOT order. */
export const FARM_LAYOUT: readonly FarmSpotLayout[] = [
  { spot: "mining", rows: 12, levels: points("Mining Point", 3, 4) },
  { spot: "insects", rows: 11, levels: points("Insect Thicket", 3, 4) },
  {
    spot: "mushrooms",
    rows: 7,
    levels: [
      { name: "Mushroom Tree", gathers: 3, mostGathers: 4 },
      { name: "Mushroom Tree +1", gathers: 5, mostGathers: 6 },
      { name: "Mushroom Tree +2", gathers: 7, mostGathers: 8 },
    ],
  },
  {
    spot: "honey",
    rows: 3,
    // Counts read from the EBOOT: `HONEY_COUNTS_AFTER`.
    levels: [
      { name: "Prototype Bee Hive", gathers: 0, mostGathers: 0 },
      { name: "Production Bee Hive", gathers: 0, mostGathers: 0 },
      { name: "Modified Bee Hive", gathers: 0, mostGathers: 0 },
    ],
  },
];

/** All the tables' bytes. */
export const FARM_TABLES_SIZE = FARM_LAYOUT.reduce(
  (n, s) => n + s.levels.length * s.rows * FARM_ROW_SIZE,
  0,
);

export interface FarmTable {
  spot: FarmSpot;
  /** 0 for the first of the spot's tables. */
  level: number;
  name: string;
  /** File offset of the table. */
  offset: number;
  gathers: number;
  mostGathers: number;
  /** The rows with an item, in the table's order; a chance can be 0. */
  items: { item: number; chance: number }[];
}

export interface FarmTables {
  /** File offset of the first table. */
  offset: number;
  tables: FarmTable[];
}

/** The table at `offset`, or null unless its chances add up to 100 over real items and zero padding. */
function readTable(reader: BinaryReader, offset: number, rows: number): FarmTable["items"] | null {
  const items: FarmTable["items"] = [];
  let sum = 0;
  for (let r = 0; r < rows; r++) {
    const item = reader.u16(offset + r * FARM_ROW_SIZE);
    const chance = reader.u16(offset + r * FARM_ROW_SIZE + 2);
    if (item === 0) {
      if (chance !== 0) return null;
      continue;
    }
    // Padding only at the end.
    if (items.length < r || item >= ITEM_COUNT || chance > 100) return null;
    items.push({ item, chance });
    sum += chance;
  }
  return sum === 100 ? items : null;
}

/** The Bee Hives' base counts at `offset`, or null unless each is a small count, rising. */
function readHoneyCounts(reader: BinaryReader, offset: number): number[] | null {
  if (offset + 12 > reader.length) return null;
  const counts = [0, 1, 2].map((i) => reader.u32(offset + i * 4));
  const ok = counts.every((c, i) => c > 0 && c <= MAX_HONEY_COUNT && c >= (counts[i - 1] ?? 0));
  return ok ? counts : null;
}

function readTablesAt(reader: BinaryReader, offset: number): FarmTable[] | null {
  if (offset < 0 || offset + FARM_TABLES_SIZE > reader.length) return null;
  const honey = readHoneyCounts(reader, offset + HONEY_COUNTS_AFTER);
  if (!honey) return null;
  const tables: FarmTable[] = [];
  let at = offset;
  for (const { spot, rows, levels } of FARM_LAYOUT) {
    for (const [level, { name, ...counts }] of levels.entries()) {
      const items = readTable(reader, at, rows);
      if (!items) return null;
      const { gathers, mostGathers } =
        spot === "honey" ? { gathers: honey[level]!, mostGathers: honey[level]! + 1 } : counts;
      tables.push({ spot, level, name, offset: at, gathers, mostGathers, items });
      at += rows * FARM_ROW_SIZE;
    }
  }
  return tables;
}

/**
 * Finds the tables in an EBOOT: at the EU offset, or the nearest shift of
 * it (in steps of a row) where all sixteen read cleanly. Other regions'
 * EBOOTs move tables by a few KB (`eu-signatures.ts`), which `range`
 * covers.
 */
export function readFarmTables(reader: BinaryReader, range = 0x4000): FarmTables | null {
  for (let d = 0; d <= range; d += FARM_ROW_SIZE) {
    for (const shift of d === 0 ? [0] : [-d, d]) {
      const tables = readTablesAt(reader, FARM_TABLES_EU + shift);
      if (tables) return { offset: FARM_TABLES_EU + shift, tables };
    }
  }
  return null;
}
