/**
 * What shops sell, from `overlay/lobby_task.ovl` (found with `shop-scan` and
 * `shop-lists` on the EU disc).
 *
 * Each shop's stock is a list of u16 item IDs ending in 0xFFFF, one list per
 * stage of the game, each usually the last plus a few items. The game picks
 * a list from tables of u32 pointers, one table per shop, each ending in a
 * 0 word; the tables sit next to each other (0xa7da8 on the EU disc: the
 * village store, the peddling granny's pools, the Guild Hall store, and a
 * shop of Armor Spheres, jewels and Pokke Tickets). Tables can share lists.
 *
 * The shuffle swaps items consistently: each item is replaced by the same
 * other item in every list of a group of shops, so a later stage still has
 * everything an earlier one had, and lists keep their length. Prices come
 * from the item, so they follow it.
 */
import type { OvlFile } from "../../../mhfu-extract/src/container/ovl.js";
import type { LoadedOverlay } from "../game/load.js";
import type { Edits } from "../edits.js";
import { itemName } from "../names.js";
import type { Rng } from "../rng.js";
import type { ShuffleReport } from "./shuffle.js";

const ITEM_COUNT = 1262;
const LIST_END = 0xffff;
const MAX_LIST = 200;
const MAX_TABLE = 32;

/** The general store's opening items: how the first table is recognised. */
const STORE_ITEMS = [163, 7, 11, 153]; // Herb, Potion, Antidote, Whetstone
/** A shop selling Armor Spheres is the special shop. */
const ARMOR_SPHERE = 223;

/** Items shops keep selling with `keepEssentials`. */
export const ESSENTIALS: readonly number[] = [
  7, // Potion
  153, // Whetstone
  144, // Old Pickaxe
  145, // Iron Pickaxe
  148, // Old Bugnet
  149, // Bugnet
  151, // BBQ Spit
  96, // Normal S Lv1
  97, // Normal S Lv2
  129, // Empty Bottle
];

export interface ShopList {
  /** File offset of the first item. */
  offset: number;
  items: number[];
}

export interface ShopTable {
  /** File offset of the table's first pointer. */
  at: number;
  name: string;
  /** File offsets of its lists, by stage. */
  lists: number[];
  special: boolean;
}

export interface ShopData {
  tables: ShopTable[];
  lists: Map<number, ShopList>;
}

/** The item list at `offset`, or null if it isn't one (a value that isn't an item before the end). */
function readList(ovl: OvlFile, offset: number): ShopList | null {
  const r = ovl.reader;
  const items: number[] = [];
  for (let at = offset; at + 2 <= r.length && items.length <= MAX_LIST; at += 2) {
    const v = r.u16(at);
    if (v === LIST_END || v === 0) return { offset, items };
    if (v >= ITEM_COUNT) return null;
    items.push(v);
  }
  return null;
}

/** The table of pointers at `at`: own pointers to item lists, ending in a 0 word. */
function readTable(ovl: OvlFile, at: number, lists: Map<number, ShopList>): number[] | null {
  const r = ovl.reader;
  const out: number[] = [];
  for (let p = at; p + 4 <= r.length && out.length <= MAX_TABLE; p += 4) {
    const word = r.u32(p);
    if (word === 0) return out.length >= 2 ? out : null;
    if (!ovl.isOwnVaddr(word)) return null;
    const offset = ovl.vaddrToOffset(word);
    if (offset % 2 !== 0) return null;
    const list = lists.get(offset) ?? readList(ovl, offset);
    if (!list) return null;
    lists.set(offset, list);
    out.push(offset);
  }
  return null;
}

function startsWith(items: readonly number[], prefix: readonly number[]): boolean {
  return prefix.every((v, i) => items[i] === v);
}

function nameTable(lists: ShopList[]): { name: string; special: boolean } {
  const all = lists.flatMap((l) => l.items);
  if (all.includes(ARMOR_SPHERE)) return { name: "Sphere and jewel shop", special: true };
  const first = lists.find((l) => l.items.length > 0)?.items ?? [];
  if (startsWith(first, STORE_ITEMS)) return { name: "Village general store", special: false };
  if (startsWith(first, STORE_ITEMS.slice(1))) return { name: "Guild Hall store", special: false };
  return { name: "Peddler", special: false };
}

/**
 * Finds the shop tables: the table holding the general store's list, and
 * every table directly before and after it.
 */
export function findShops(ovl: OvlFile): ShopData {
  const r = ovl.reader;
  const lists = new Map<number, ShopList>();
  let first = -1;
  for (let at = 0x80; at + 4 <= r.length && first === -1; at += 4) {
    const word = r.u32(at);
    if (!ovl.isOwnVaddr(word)) continue;
    const list = readList(ovl, ovl.vaddrToOffset(word));
    if (!list || !startsWith(list.items, STORE_ITEMS)) continue;
    // Back up to the start of this table (the word after the previous 0).
    let start = at;
    while (start - 4 >= 0x80 && ovl.isOwnVaddr(r.u32(start - 4))) start -= 4;
    if (readTable(ovl, start, lists)) first = start;
  }
  if (first === -1) throw new Error("lobby_task.ovl: the shop tables weren't found");

  const starts = [first];
  // Earlier tables: each ends in a 0 word right before the next one starts.
  for (let end = first - 4; end - 4 >= 0x80 && r.u32(end) === 0;) {
    let start = end;
    while (start - 4 >= 0x80 && ovl.isOwnVaddr(r.u32(start - 4))) start -= 4;
    if (start === end || !readTable(ovl, start, lists)) break;
    starts.unshift(start);
    end = start - 4;
  }
  const tables: ShopTable[] = [];
  for (let at = first; ;) {
    const offsets = readTable(ovl, at, lists);
    if (!offsets) break;
    tables.push({ at, lists: offsets, name: "", special: false });
    at += (offsets.length + 1) * 4;
  }
  const before = starts.slice(0, -1).map((at) => ({
    at,
    lists: readTable(ovl, at, lists)!,
    name: "",
    special: false,
  }));
  const all = [...before, ...tables];
  const seen = new Map<string, number>();
  for (const table of all) {
    const { name, special } = nameTable(table.lists.map((o) => lists.get(o)!));
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    table.name = n === 1 ? name : `${name} ${n}`;
    table.special = special;
  }
  return { tables: all, lists };
}

export type ShopMix = "each" | "all";

export interface ShopOptions {
  keepEssentials: boolean;
  mix: ShopMix;
  special: boolean;
}

/** Groups of tables that must share one substitution: tables sharing a list, or all of them. */
function groupTables(tables: ShopTable[], mix: ShopMix): ShopTable[][] {
  if (mix === "all") return tables.length > 0 ? [tables] : [];
  const groups: ShopTable[][] = [];
  for (const table of tables) {
    const joined = groups.filter((g) =>
      g.some((t) => t.lists.some((l) => table.lists.includes(l))),
    );
    const merged = [...joined.flat(), table];
    for (const g of joined) groups.splice(groups.indexOf(g), 1);
    groups.push(merged);
  }
  return groups.sort((a, b) => a[0]!.at - b[0]!.at);
}

export function shuffleShops(
  data: ShopData,
  options: ShopOptions,
  rng: Rng,
  edits: Edits,
  lobby: LoadedOverlay,
): ShuffleReport {
  const included = data.tables.filter((t) => options.special || !t.special);
  const pinned = new Set(options.keepEssentials ? ESSENTIALS : []);
  const buf = edits.overlay(lobby);
  const lines: { where: string; text: string }[] = [];
  let changed = 0;

  for (const group of groupTables(included, options.mix)) {
    const offsets = [...new Set(group.flatMap((t) => t.lists))].sort((a, b) => a - b);
    const lists = offsets.map((o) => data.lists.get(o)!);
    // Items in first-seen order, so the result depends only on the lists and the RNG.
    const items: number[] = [];
    for (const list of lists) for (const v of list.items) if (!items.includes(v)) items.push(v);
    const movable = items.filter((v) => !pinned.has(v));
    const next = rng.shuffle([...movable]);
    const sigma = new Map(movable.map((v, i) => [v, next[i]!]));

    for (const list of lists) {
      list.items.forEach((v, i) => buf.writeUInt16LE(sigma.get(v) ?? v, list.offset + i * 2));
    }
    const where = group.map((t) => t.name).join(" + ");
    for (const v of items) {
      const now = sigma.get(v) ?? v;
      if (now !== v) changed++;
      lines.push({
        where,
        text: now === v ? `${itemName(v)} (unchanged)` : `${itemName(v)} -> ${itemName(now)}`,
      });
    }
  }

  const skipped = data.tables.filter((t) => !included.includes(t)).map((t) => t.name);
  return {
    title: "Shops",
    notes: [
      "Each line is an item a shop sells and what it sells in its place, in every stage of that shop. Prices follow the item.",
      options.mix === "all"
        ? "One swap for all shops: an item is replaced by the same thing everywhere."
        : "Each shop has its own swap; shops that share stock lists share one.",
      options.keepEssentials
        ? "Potion, Whetstone, pickaxes, bugnets, BBQ Spit, Normal S Lv1/2 and Empty Bottle stay on sale."
        : "No item is guaranteed to stay on sale.",
      `${changed} items changed. ${skipped.length > 0 ? `Not shuffled: ${skipped.join(", ")}.` : ""}`.trim(),
    ],
    lines,
  };
}
