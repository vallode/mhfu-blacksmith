/**
 * The smithy's equipment store: the weapons and armor it sells outright.
 *
 * In `overlay/lobby_task.ovl`, right after the item shops' lists (on the EU
 * disc, the lists at 0xa7e48-0xa86a8 and their table at 0xa86a8). Each list
 * is pairs of u16 (category, ID) ending in a 0xFFFF word, padded to 4 bytes
 * with zeros. Categories 0-4 are armor pieces (leg, head, chest, arm,
 * waist: the order of the EBOOT's armor arrays, see `tables/armor.ts`; each
 * list opens with the Mafumofu set, which places them), 5 a Blademaster
 * weapon (`WepBMID`) and 6 a Gunner weapon (`WepGunID`). One table of u32 pointers
 * picks a list per stage of the game; on the EU disc it has 18, ending in a
 * word that isn't a pointer: 6 weapon lists (all the same 15 rarity-1
 * weapons), then two runs of 6 armor lists. randomfu's `weapons` and
 * `armor` shuffles edit the entries.
 */
import type { OvlFile } from "../container/ovl.js";
import type { ArmorSlot } from "../tables/armor.js";

const LIST_END = 0xffff;
const MAX_ENTRIES = 200;
const MAX_TABLE = 64;

export const EQUIPMENT_CATEGORY = {
  blademaster: 5,
  gunner: 6,
} as const;
const MAX_CATEGORY = 6;

/** Armor categories 0-4, by slot. */
export const ARMOR_CATEGORY: Record<ArmorSlot, number> = {
  leg: 0,
  head: 1,
  chest: 2,
  arm: 3,
  waist: 4,
};

export interface EquipmentEntry {
  /** File offset of the entry's category word; the ID is at `+2`. */
  at: number;
  category: number;
  id: number;
}

export interface EquipmentList {
  /** File offset of the first entry. */
  offset: number;
  entries: EquipmentEntry[];
}

export interface EquipmentStore {
  /** File offset of the table's first pointer. */
  at: number;
  /** Its lists, by pointer (lists may repeat). */
  lists: EquipmentList[];
}

/** The (category, ID) list at `offset`, or null if it isn't one. */
export function readEquipmentList(ovl: OvlFile, offset: number): EquipmentList | null {
  const r = ovl.reader;
  const entries: EquipmentEntry[] = [];
  for (let at = offset; at + 2 <= r.length && entries.length <= MAX_ENTRIES; at += 4) {
    const category = r.u16(at);
    if (category === LIST_END) return entries.length > 0 ? { offset, entries } : null;
    if (category > MAX_CATEGORY || at + 4 > r.length) return null;
    const id = r.u16(at + 2);
    if (id === 0 || id === LIST_END) return null;
    entries.push({ at, category, id });
  }
  return null;
}

function readTable(ovl: OvlFile, at: number): EquipmentList[] {
  const r = ovl.reader;
  const out: EquipmentList[] = [];
  for (let p = at; p + 4 <= r.length && out.length < MAX_TABLE; p += 4) {
    const word = r.u32(p);
    if (!ovl.isOwnVaddr(word)) break;
    const offset = ovl.vaddrToOffset(word);
    const list = offset % 4 === 0 ? readEquipmentList(ovl, offset) : null;
    if (!list) break;
    out.push(list);
  }
  return out;
}

const isWeapon = (e: EquipmentEntry) =>
  e.category === EQUIPMENT_CATEGORY.blademaster || e.category === EQUIPMENT_CATEGORY.gunner;

/**
 * Finds the store's table: the first run of pointers to (category, ID)
 * lists that has a list of weapons. Null when there's none.
 */
export function findEquipmentStore(ovl: OvlFile): EquipmentStore | null {
  const r = ovl.reader;
  for (let at = 0x80; at + 4 <= r.length; at += 4) {
    if (ovl.isOwnVaddr(r.u32(at - 4))) continue; // only where a run starts
    const lists = readTable(ovl, at);
    if (lists.length >= 2 && lists.some((l) => l.entries.every(isWeapon))) return { at, lists };
  }
  return null;
}

/** The store's entries, each once (lists the table repeats are listed once). */
export function storeEntries(store: EquipmentStore): EquipmentEntry[] {
  const seen = new Set<number>();
  const out: EquipmentEntry[] = [];
  for (const list of store.lists) {
    if (seen.has(list.offset)) continue;
    seen.add(list.offset);
    out.push(...list.entries);
  }
  return out;
}
