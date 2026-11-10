/**
 * Gathering points in a quest: which items its mining, gathering and bug
 * catching nodes can give, and where each of those table slots is, for the
 * `gathering` shuffle (`shuffles/gathering.ts`).
 *
 * Layout from `quest.hexpat` (vendor/mhp2g-patterns, MIT):
 *
 * - `GatheringItemsPTR` (header +36) points at an array of u32 pointers, one
 *   per item table. Each table is `{ u16 value, u16 item }` pairs ending at
 *   `0xFFFF`.
 * - `GatheringLocTblPTR` (header +28) points at one u32 pointer per area of
 *   the quest's map (the count depends on the map). Each leads to the
 *   area's nodes, 24 bytes each (`f32 x, y, z, maxValue; u16 itemIndex;
 *   u16; u16 nodeType; u16`), ending at an x of -1.0f. The pattern names
 *   the last u16 `maxTimes`; see below for why it's read as the fewest
 *   gathers instead.
 *
 * On the EU disc every used table's values add up to 100: each is an item's
 * chance in percent. The two u16s around `nodeType` look like gather
 * counts: on all 19,130 nodes the one at +18 is at least the one at +22 (6
 * and 2, 10 and 6, ...), and both are 255 on the 536 spots that never run
 * out (ammo piles, the Khezu Whelps, the Training School's honey). So +18
 * reads as the most gathers and +22 as the fewest. `gathers` is the one at
 * +22, so yields worked out from it are cautious.
 *
 * Only item tables a node points at count, so a table no node uses doesn't
 * make an item look available earlier than it is. A table is read once
 * however many nodes (or table indices) lead to it. Pointers are relative
 * to the file, and every read is bounds-checked: anything that doesn't fit
 * the layout gives no items rather than wrong ones.
 */
import type { ParsedQuest } from "mhfu-extract/src/quests/parser.js";

/** Areas per map, from `quest.hexpat`'s `GatherNodes` count. */
const MAP_AREAS: Record<number, number> = {
  1: 7,
  2: 13,
  3: 12,
  4: 11,
  5: 12,
  6: 11,
  7: 2,
  8: 2,
  9: 2,
  10: 0,
  11: 10,
  12: 4,
  13: 2,
  14: 8,
  15: 11,
  16: 13,
  17: 12,
  18: 11,
  19: 12,
  20: 11,
  21: 10,
  22: 2,
  23: 2,
  26: 11,
  27: 13,
  28: 13,
  29: 10,
  30: 10,
  31: 10,
};

const GATHERING_LOC_PTR = 28;
const GATHERING_ITEMS_PTR = 36;
const NODE_SIZE = 24;
const NODE_END = 0xbf800000; // -1.0f
const MAX_NODES_PER_AREA = 256;
const MAX_ITEM_TABLES = 512;
const MAX_TABLE_LENGTH = 64;
/** Item IDs above this aren't real items (the ItemID table has fewer entries). */
const MAX_ITEM_ID = 2000;

/** One `{ u16 value, u16 item }` pair in an item table some node uses. */
export interface GatheringSlot {
  /** The item table's index in the quest's table list (the lowest, if several share the pair). */
  table: number;
  /** Payload offset of the pair; the item ID is at `offset + 2`. */
  offset: number;
  /** The pair's first field, taken to be the item's weight. */
  value: number;
  itemId: number;
}

/** One mining, gathering or bug catching node. */
export interface GatheringNode {
  /** The item table it uses. */
  table: number;
  /** How many times it can be gathered, at least (header +22); 255 means it doesn't run out. */
  gathers: number;
}

export interface GatheringResult {
  /** Item IDs any node in the quest can give. */
  items: number[];
  /** Every pair with an item (not 0) in a used table, once each, in table order. */
  slots: GatheringSlot[];
  /** Every node, in area order. */
  nodes: GatheringNode[];
  /** Each used table's pair offsets, item 0 included, by table index. */
  tables: Map<number, number[]>;
  /** Why nothing was read, when the layout didn't fit. */
  problem?: string;
}

const none = (problem: string): GatheringResult => ({
  items: [],
  slots: [],
  nodes: [],
  tables: new Map(),
  problem,
});

/** A node's gathers when it never runs out: about what the most generous ordinary node gives. */
const ENDLESS_GATHERS = 10;

/**
 * How many of each item a quest's nodes give if each is gathered its
 * fewest times: the sum over nodes of gathers × the item's chance. Read
 * from `payload` as it is, so it reflects a gathering shuffle already done.
 */
export function gatheringYields(payload: Buffer, quest: ParsedQuest): Map<number, number> {
  const result = readGatheringItems(payload, quest);
  const out = new Map<number, number>();
  if (result.problem) return out;
  for (const node of result.nodes) {
    const gathers = node.gathers === 0xff ? ENDLESS_GATHERS : node.gathers;
    for (const at of result.tables.get(node.table) ?? []) {
      const item = payload.readUInt16LE(at + 2);
      if (item === 0) continue;
      out.set(item, (out.get(item) ?? 0) + (gathers * payload.readUInt16LE(at)) / 100);
    }
  }
  return out;
}

export function readGatheringItems(payload: Buffer, quest: ParsedQuest): GatheringResult {
  const fits = (offset: number, size: number) => offset >= 0x80 && offset + size <= payload.length;
  const locPtr = payload.readUInt32LE(GATHERING_LOC_PTR);
  const itemsPtr = payload.readUInt32LE(GATHERING_ITEMS_PTR);
  if (locPtr === 0 || itemsPtr === 0) return { items: [], slots: [], nodes: [], tables: new Map() };
  const areas = MAP_AREAS[quest.header.map];
  if (areas === undefined) return none(`unknown map ${quest.header.map}`);
  if (!fits(locPtr, areas * 4)) return none("area table out of bounds");

  const used = new Set<number>();
  const nodeList: GatheringNode[] = [];
  for (let area = 0; area < areas; area++) {
    const nodes = payload.readUInt32LE(locPtr + area * 4);
    if (nodes === 0) continue;
    let at = nodes;
    for (let n = 0; ; n++, at += NODE_SIZE) {
      if (!fits(at, 4) || n > MAX_NODES_PER_AREA) {
        return none(`area ${area}'s node list doesn't end`);
      }
      if (payload.readUInt32LE(at) === NODE_END) break;
      if (!fits(at, NODE_SIZE)) return none("node out of bounds");
      const table = payload.readUInt16LE(at + 16);
      used.add(table);
      nodeList.push({ table, gathers: payload.readUInt16LE(at + 22) });
    }
  }

  const items = new Set<number>();
  const slots: GatheringSlot[] = [];
  const seen = new Set<number>(); // tables can be shared, or overlap
  const tables = new Map<number, number[]>();
  for (const index of [...used].sort((a, b) => a - b)) {
    const pairs: number[] = [];
    tables.set(index, pairs);
    if (index >= MAX_ITEM_TABLES || !fits(itemsPtr + index * 4, 4)) {
      return none(`node uses item table ${index}, past the table list`);
    }
    const table = payload.readUInt32LE(itemsPtr + index * 4);
    for (let k = 0, at = table; ; k++, at += 4) {
      if (!fits(at, 2) || k > MAX_TABLE_LENGTH) {
        return none(`item table ${index} doesn't end`);
      }
      if (payload.readUInt16LE(at) === 0xffff) break;
      if (!fits(at, 4)) return none(`item table ${index} out of bounds`);
      const item = payload.readUInt16LE(at + 2);
      if (item > MAX_ITEM_ID) return none(`item table ${index} has item ${item}`);
      pairs.push(at);
      if (item === 0 || seen.has(at)) continue;
      seen.add(at);
      items.add(item);
      slots.push({ table: index, offset: at, value: payload.readUInt16LE(at), itemId: item });
    }
  }
  return { items: [...items].sort((a, b) => a - b), slots, nodes: nodeList, tables };
}
