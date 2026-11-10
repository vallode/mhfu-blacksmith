/**
 * The item combination tables in `EBOOT.BIN` (see "Combinations" in the
 * README). None of them is in `eboot.hexpat`; they were found and decoded
 * from the EU disc (ULES01213) by following the game's combine code
 * (EBOOT 0x59b6c-0x5a6ec on that disc). EU file offsets:
 *
 * - `0x1a2d84` recipes: 172 records of 10 bytes, sorted by first ingredient.
 *   `u16` second ingredient, `u16` result, `u8` rate class, `u8` quantity
 *   class, `u8` the record's own index, `u8` flags, `u8` an older list
 *   number (255 on most G-rank-only recipes) and a zero byte.
 * - `0x1a343c` (straight after): per item ID, `u8` count and `u8` first
 *   record of the recipes whose lower-ID ingredient it is. The combine code
 *   looks a pair up here, lower ID first.
 * - `0x1a3e18` the Combination List: every recipe's two ingredients as `u16`
 *   pairs, in the order the in-game list shows them, ended by `0xffffffff`.
 * - Straight after it: one quantity roll per quantity class (a `u8` base,
 *   then the percent chance of each amount from the base up, summing to
 *   100), pointers to those rolls, the largest amount per class (what the
 *   Bullet Limit skill always gives), the success rate per rate class, the
 *   five Books of Combos' item IDs, and the rate bonus for owning the first
 *   0-5 of them.
 *
 * Flags, from the same code: 1 needs the Alchemy skill or the Alchemy Guide,
 * 2 always succeeds with the Bomber skill, 16 with Trap Master. 4 and 8 are
 * only read by the combine menu's drawing code.
 *
 * The success rate is the class's rate, plus the bonus for the Books of
 * Combos owned in order from 1, plus or minus the Combination skill's
 * 15/25/45 or 5/10/15, at most 100.
 *
 * Everything is found by its shape, not a fixed address, so any region's
 * EBOOT works: the recipe records are the longest run whose index byte
 * counts up from 0 that the rest agrees with, the per-item index follows
 * them, and the Combination List is the `0xffffffff`-ended run of pairs that
 * names every recipe once.
 */
import { JP_BASE_ADDRESS } from "./offsets.js";

export const RECIPE_SIZE = 10;

/** Recipe flag bits. */
export const COMBINATION_FLAGS = {
  /** Needs the Alchemy skill, or the Alchemy Guide in the box or pouch. */
  alchemy: 0x01,
  /** Always succeeds with the Bomber skill. */
  bomb: 0x02,
  /** Always succeeds with the Trap Master skill. */
  trap: 0x10,
} as const;

export interface CombinationRecipe {
  /** Position in the in-game Combination List, from 0. */
  listIndex: number;
  /** Index of its record in the recipe table. */
  record: number;
  /** In the order the Combination List shows them. */
  ingredients: [number, number];
  result: number;
  rateClass: number;
  quantityClass: number;
  flags: number;
}

/** One way a combine can turn out: `amount` items, `chance` percent of the time. */
export interface QuantityRoll {
  amount: number;
  chance: number;
}

export interface CombinationTables {
  /** In Combination List order. */
  recipes: CombinationRecipe[];
  /** Success rate (percent) per rate class. */
  rates: number[];
  /** The amounts each quantity class can give, smallest first. */
  quantities: QuantityRoll[][];
  /** The largest amount per quantity class, as the game stores it. */
  maxQuantities: number[];
  /** Item IDs of the Books of Combos, in order. */
  books: number[];
  /** Rate bonus (percent) for owning the first 0, 1, … of `books`. */
  bookBonus: number[];
  /** File offsets of each table, for the README and `--raw` readers. */
  offsets: {
    records: number;
    index: number;
    list: number;
    quantityPointers: number;
    rates: number;
    books: number;
    bookBonus: number;
  };
}

/** Item IDs stay below this; anything larger isn't an item. */
const MAX_ITEM_ID = 2048;
/** Fewer recipes than this is a coincidence, not the table. */
const MIN_RECIPES = 64;
/** More rate classes or books than these means the tail isn't the tables. */
const MAX_RATES = 16;
const MAX_BOOKS = 8;

/**
 * Candidate recipe tables: every run of 10-byte records whose index byte
 * (offset 6) counts up from 0 and whose result and second ingredient are
 * item IDs, longest first. `readCombinations` takes the first one the
 * per-item index and the Combination List agree with.
 */
export function findRecipeRecordRuns(buf: Buffer): { offset: number; count: number }[] {
  const runs: { offset: number; count: number }[] = [];
  for (let o = 0; o + RECIPE_SIZE * MIN_RECIPES <= buf.length; o += 2) {
    if (buf.readUInt8(o + 6) !== 0 || buf.readUInt8(o + 16) !== 1 || buf.readUInt8(o + 26) !== 2)
      continue;
    let n = 0;
    while (o + (n + 1) * RECIPE_SIZE <= buf.length) {
      const r = o + n * RECIPE_SIZE;
      const other = buf.readUInt16LE(r);
      const result = buf.readUInt16LE(r + 2);
      if (buf.readUInt8(r + 6) !== (n & 0xff) || other === 0 || other >= MAX_ITEM_ID) break;
      if (result === 0 || result >= MAX_ITEM_ID) break;
      n++;
    }
    if (n >= MIN_RECIPES && n <= 255) runs.push({ offset: o, count: n });
  }
  // Stable, so equal runs stay in file order.
  return runs.sort((a, b) => b.count - a.count);
}

/** The longest candidate recipe table (see `findRecipeRecordRuns`). */
export function findRecipeRecords(buf: Buffer): { offset: number; count: number } | null {
  return findRecipeRecordRuns(buf)[0] ?? null;
}

/**
 * Each record's lower-ID ingredient, from the per-item index after the
 * records: item `id`'s two bytes are how many records are its and the first
 * of them. Null unless every record is claimed exactly once.
 */
export function readRecipeIndex(buf: Buffer, offset: number, count: number): number[] | null {
  const first: number[] = Array(count).fill(-1);
  let claimed = 0;
  for (let id = 0; id < MAX_ITEM_ID && offset + id * 2 + 1 < buf.length; id++) {
    const n = buf.readUInt8(offset + id * 2);
    const start = buf.readUInt8(offset + id * 2 + 1);
    if (n === 0) continue;
    if (start + n > count) return null;
    for (let k = start; k < start + n; k++) {
      if (first[k] !== -1) return null;
      first[k] = id;
    }
    claimed += n;
    if (claimed === count) return first;
  }
  return null;
}

const pairKey = (a: number, b: number) => (a < b ? a * MAX_ITEM_ID + b : b * MAX_ITEM_ID + a);

/**
 * The Combination List: `count` `u16` pairs ended by `0xffffffff` that name
 * every recipe in `keys` (lower ID first) exactly once.
 */
export function findCombinationList(buf: Buffer, keys: ReadonlyMap<number, number>): number | null {
  const count = keys.size;
  for (let o = 0; o + count * 4 + 4 <= buf.length; o += 2) {
    if (buf.readUInt32LE(o + count * 4) !== 0xffffffff) continue;
    const seen = new Set<number>();
    let ok = true;
    for (let i = 0; i < count && ok; i++) {
      const key = pairKey(buf.readUInt16LE(o + i * 4), buf.readUInt16LE(o + i * 4 + 2));
      ok = keys.has(key) && !seen.has(key);
      seen.add(key);
    }
    if (ok) return o;
  }
  return null;
}

const align4 = (n: number) => (n + 3) & ~3;

/**
 * The tables after the Combination List's terminator: the quantity rolls,
 * the pointers to them, the largest amounts, the rates, the books and their
 * bonuses, in that order.
 */
function readTail(
  buf: Buffer,
  start: number,
  baseAddress: number,
): Omit<CombinationTables, "recipes" | "offsets"> & {
  offsets: Pick<CombinationTables["offsets"], "quantityPointers" | "rates" | "books" | "bookBonus">;
} {
  const fail = (what: string): never => {
    throw new Error(
      `Combination tables: ${what} after the Combination List (0x${start.toString(16)}).`,
    );
  };
  // Reads that stop at the end of the EBOOT instead of throwing a RangeError.
  const u8 = (p: number) =>
    p < buf.length ? buf.readUInt8(p) : fail(`the EBOOT ending at 0x${p.toString(16)}`);
  const u16 = (p: number) =>
    p + 2 <= buf.length ? buf.readUInt16LE(p) : fail(`the EBOOT ending at 0x${p.toString(16)}`);
  // The pointer table is the first word pointing back between `start` and itself.
  const pointsBack = (at: number) => {
    if (at + 4 > buf.length) return false;
    const target = buf.readUInt32LE(at) - baseAddress;
    return target >= start && target < at;
  };
  let pointers = align4(start);
  while (pointers < start + 0x100 && !pointsBack(pointers)) pointers += 4;
  if (!pointsBack(pointers)) fail("no quantity roll pointers");
  const quantities: QuantityRoll[][] = [];
  let at = pointers;
  while (pointsBack(at)) {
    let p = buf.readUInt32LE(at) - baseAddress;
    const base = u8(p++);
    const rolls: QuantityRoll[] = [];
    let total = 0;
    while (total < 100) {
      const chance = u8(p++);
      if (chance === 0) fail(`a quantity roll that doesn't reach 100% (0x${p.toString(16)})`);
      rolls.push({ amount: base + rolls.length, chance });
      total += chance;
    }
    if (total !== 100) fail(`a quantity roll over 100% (0x${p.toString(16)})`);
    quantities.push(rolls);
    at += 4;
  }
  const classes = quantities.length;
  const maxQuantities = quantities.map((_, i) => u8(at + i));
  const ratesAt = at + align4(classes);
  const rates: number[] = [];
  for (let p = ratesAt; u8(p) !== 0 && rates.length <= MAX_RATES; p++) rates.push(u8(p));
  const booksAt = align4(ratesAt + rates.length + 1);
  const books: number[] = [];
  for (let p = booksAt; u16(p) !== 0 && books.length <= MAX_BOOKS; p += 2) books.push(u16(p));
  const bonusAt = align4(booksAt + books.length * 2 + 2);
  const bookBonus = books.length <= MAX_BOOKS ? [0, ...books].map((_, i) => u8(bonusAt + i)) : [];

  if (rates.length === 0 || rates.length > MAX_RATES || rates.some((r) => r > 100))
    fail("no success rates");
  if (books.length === 0 || books.length > MAX_BOOKS) fail("no Books of Combos");
  if (bookBonus[0] !== 0 || bookBonus.some((b, i) => i > 0 && b < bookBonus[i - 1]!))
    fail("no book bonuses");
  maxQuantities.forEach((max, i) => {
    if (max !== quantities[i]?.at(-1)?.amount) fail(`a largest amount (${max}) unlike its roll`);
  });
  return {
    rates,
    quantities,
    maxQuantities,
    books,
    bookBonus,
    offsets: { quantityPointers: pointers, rates: ratesAt, books: booksAt, bookBonus: bonusAt },
  };
}

/**
 * The per-item index and the Combination List for one candidate run of
 * recipe records, or why they don't fit it.
 */
function matchRecipes(
  buf: Buffer,
  records: { offset: number; count: number },
): { indexAt: number; byKey: Map<number, number>; list: number } | string {
  const indexAt = records.offset + records.count * RECIPE_SIZE;
  const firsts = readRecipeIndex(buf, indexAt, records.count);
  if (!firsts) return `no per-item index after the recipes (0x${indexAt.toString(16)})`;
  const byKey = new Map<number, number>();
  for (let i = 0; i < records.count; i++) {
    const key = pairKey(firsts[i]!, buf.readUInt16LE(records.offset + i * RECIPE_SIZE));
    if (byKey.has(key)) return `two recipes for one pair (record ${i})`;
    byKey.set(key, i);
  }
  const list = findCombinationList(buf, byKey);
  if (list === null) return "no Combination List found";
  return { indexAt, byKey, list };
}

/**
 * Every combination table in an EBOOT. `baseAddress` maps the quantity roll
 * pointers to file offsets; JP and EU load the EBOOT at the same address.
 */
export function readCombinations(
  buf: Buffer,
  baseAddress: number = JP_BASE_ADDRESS,
): CombinationTables {
  const runs = findRecipeRecordRuns(buf);
  if (runs.length === 0) throw new Error("Combination tables: no recipe records found.");
  // The longest run is the table on the discs seen so far; if a longer
  // coincidence ever turns up, the next run the index and list agree with wins.
  let found: {
    records: (typeof runs)[number];
    indexAt: number;
    byKey: Map<number, number>;
    list: number;
  } | null = null;
  let firstError: string | null = null;
  for (const records of runs) {
    const tried = matchRecipes(buf, records);
    if (typeof tried !== "string") {
      found = { records, ...tried };
      break;
    }
    firstError ??= tried;
  }
  if (!found) throw new Error(`Combination tables: ${firstError}.`);
  const { records, indexAt, byKey, list } = found;

  const recipes: CombinationRecipe[] = [];
  for (let i = 0; i < records.count; i++) {
    const a = buf.readUInt16LE(list + i * 4);
    const b = buf.readUInt16LE(list + i * 4 + 2);
    const record = byKey.get(pairKey(a, b))!;
    const r = records.offset + record * RECIPE_SIZE;
    recipes.push({
      listIndex: i,
      record,
      ingredients: [a, b],
      result: buf.readUInt16LE(r + 2),
      rateClass: buf.readUInt8(r + 4),
      quantityClass: buf.readUInt8(r + 5),
      flags: buf.readUInt8(r + 7),
    });
  }

  const tail = readTail(buf, list + records.count * 4 + 4, baseAddress);
  for (const r of recipes) {
    if (r.rateClass >= tail.rates.length || r.quantityClass >= tail.quantities.length)
      throw new Error(
        `Combination tables: recipe ${r.listIndex + 1} has a rate or quantity class the tables don't have.`,
      );
  }
  return {
    recipes,
    rates: tail.rates,
    quantities: tail.quantities,
    maxQuantities: tail.maxQuantities,
    books: tail.books,
    bookBonus: tail.bookBonus,
    offsets: { records: records.offset, index: indexAt, list, ...tail.offsets },
  };
}
