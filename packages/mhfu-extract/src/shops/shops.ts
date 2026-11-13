/**
 * The shops' stock: lists of u16 item IDs in `overlay/lobby_task.ovl`, one
 * list per stage of the game, reached through a table of u32 pointers per
 * shop (each ending in a 0 word). Found with randomfu's `shop-scan` and
 * `shop-lists` on the EU disc, where the tables are at 0xa7da8 and the
 * village store's first lists at 0xa7210 and 0xa7280. Tables can share
 * lists. randomfu's `shops` shuffle rewrites them; `emit/shops.ts` writes
 * them to `data/shops.json`.
 *
 * The disc doesn't name the shops: each table is named from what it sells
 * (`nameTable`). The four tables, in disc order, are the village general
 * store, the peddler's pools (the last two of which are the Guild Hall
 * store's last two lists), the Guild Hall store and the Point Exchange
 * (Armor Spheres, jewels and Pokke Tickets, bought with Pokke Points).
 */
import type { OvlFile } from "../container/ovl.js";

const ITEM_COUNT = 1262;
export const LIST_END = 0xffff;
const MAX_LIST = 200;
const MAX_TABLE = 32;

/** The general store's opening items: how the first table is recognised. */
const STORE_ITEMS = [163, 7, 11, 153]; // Herb, Potion, Antidote, Whetstone
/** A shop selling Armor Spheres is the Point Exchange (`shops.special`). */
const ARMOR_SPHERE = 223;

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
export function readList(ovl: OvlFile, offset: number): ShopList | null {
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
export function readTable(ovl: OvlFile, at: number, lists: Map<number, ShopList>): number[] | null {
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
  if (all.includes(ARMOR_SPHERE)) return { name: "Point Exchange", special: true };
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

  const starts: number[] = [];
  // Earlier tables: each ends in a 0 word right before the next one starts.
  for (let end = first - 4; end - 4 >= 0x80 && r.u32(end) === 0;) {
    let start = end;
    while (start - 4 >= 0x80 && ovl.isOwnVaddr(r.u32(start - 4))) start -= 4;
    if (start === end || !readTable(ovl, start, lists)) break;
    starts.unshift(start);
    end = start - 4;
  }
  for (let at = first; ;) {
    const offsets = readTable(ovl, at, lists);
    if (!offsets) break;
    starts.push(at);
    at += (offsets.length + 1) * 4;
  }
  const tables: ShopTable[] = starts.map((at) => ({
    at,
    lists: readTable(ovl, at, lists)!,
    name: "",
    special: false,
  }));
  const seen = new Map<string, number>();
  for (const table of tables) {
    const { name, special } = nameTable(table.lists.map((o) => lists.get(o)!));
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    table.name = n === 1 ? name : `${name} ${n}`;
    table.special = special;
  }
  return { tables, lists };
}
