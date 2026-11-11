/**
 * Shops: what they sell, how much of it, at what price and stack size.
 *
 * Where the data is: `overlay/lobby_task.ovl` holds each shop's stock as
 * lists of u16 item IDs, one list per stage of the game, picked through a
 * table of u32 pointers per shop. `mhfu-extract/src/shops/shops.ts` finds
 * them (`findShops`).
 *
 * What changes:
 *
 * - Stock: every item a group of shops sells (tables sharing a list form a
 *   group; or all shops together) gets one replacement drawn from a pool
 *   (the shops' own items, up to any item in the game), used in every list,
 *   so a shop's stages stay consistent with each other.
 * - How many items each shop sells: every list of a group is scaled by one
 *   factor, so later stages still sell more than earlier ones. Longer lists
 *   take extra pool items (the same extras, in order, in every list); shorter
 *   ones drop the items with the lowest random rank. Lists that change length
 *   are rewritten back to back in the space the lists use now, and the
 *   pointer tables are updated; without this setting every list stays where
 *   it is.
 * - Prices and carry limits (`randomizeShopPrices`, separate from the stock
 *   shuffle) live in the EBOOT's item table (24-byte records,
 *   `mhfu-extract/src/tables/items.ts`), so they change for whatever shops
 *   sell, with the stock shuffled or not. The price field isn't documented,
 *   so it's found on the disc from the general store's prices, and the carry
 *   limit (+3) is checked the same way; both refuse to run if the disc
 *   disagrees.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import type { OvlFile } from "mhfu-extract/src/container/ovl.js";
import {
  LIST_END,
  type ShopData,
  type ShopList,
  type ShopTable,
} from "mhfu-extract/src/shops/shops.js";
import {
  ITEM_ENTRY_SIZE,
  TABLE_COUNTS,
  resolveTableOffset,
} from "mhfu-extract/src/tables/offsets.js";
import type { TableAddressResolver } from "mhfu-extract/src/tables/resolver.js";
import type { LoadedOverlay } from "../game/load.js";
import type { Edits } from "../edits.js";
import { itemName } from "../names.js";
import type { Rng } from "../rng.js";
import type { ShuffleReport } from "./shuffle.js";

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

// ---------------------------------------------------------------- the item table

export interface ItemTable {
  /** File offset of item 0's record in the EBOOT. */
  base: number;
  /** Items with a record (regular items and decorations). */
  count: number;
  /** Offset of the u32 buy price within a record. */
  priceField: number;
}

/** General store prices on the EU disc, from the game's own shop screen. */
export const KNOWN_PRICES: readonly [number, number][] = [
  [163, 20], // Herb
  [7, 66], // Potion
  [11, 60], // Antidote
  [153, 80], // Whetstone
  [21, 300], // Cool Drink
  [22, 250], // Hot Drink
  [144, 60], // Old Pickaxe
  [145, 160], // Iron Pickaxe
];
/** Carry limits known from the game. */
export const KNOWN_STACKS: readonly [number, number][] = [
  [7, 10], // Potion
  [153, 20], // Whetstone
];
export const STACK_FIELD = 3;
const RARITY_FIELD = 2;

/**
 * Finds the item table and its buy-price field: the one u32 field that
 * holds every known general store price. Throws when none does, or when the
 * carry limits don't match, rather than editing the wrong bytes.
 */
export function locateItemTable(
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
): ItemTable {
  const reader = new BinaryReader(eboot);
  const base = resolveTableOffset("itemTable", reader, resolver);
  const count = TABLE_COUNTS.regularItems + TABLE_COUNTS.decorations;
  const record = (id: number) => base + id * ITEM_ENTRY_SIZE;
  const fields: number[] = [];
  for (let field = 0; field + 4 <= ITEM_ENTRY_SIZE; field += 2) {
    if (KNOWN_PRICES.every(([id, price]) => reader.u32(record(id) + field) === price)) {
      fields.push(field);
    }
  }
  if (fields.length !== 1) {
    const potion = reader.bytes(record(7), ITEM_ENTRY_SIZE).toString("hex");
    throw new Error(
      `Couldn't confirm the item table's price field (${fields.length} candidates; Potion's record is ${potion}). Prices and carry limits can't be randomized on this disc yet.`,
    );
  }
  for (const [id, stack] of KNOWN_STACKS) {
    const found = reader.u8(record(id) + STACK_FIELD);
    if (found !== stack) {
      throw new Error(
        `The item table's carry limit for ${itemName(id)} reads ${found}, expected ${stack}. Prices and carry limits can't be randomized on this disc yet.`,
      );
    }
  }
  return { base, count, priceField: fields[0]! };
}

// ---------------------------------------------------------------- the shuffle

export type ShopPool = "shop" | "low" | "high" | "any";
export type ShopMix = "each" | "all";

export interface ShopOptions {
  pool: ShopPool;
  mix: ShopMix;
  keepEssentials: boolean;
  special: boolean;
  /** Each group's list lengths scale by up to this fraction; 0 keeps them. */
  countSpread: number;
}

export interface ShopContext {
  /** Each item's earliest rank, for the Low/High Rank pools. */
  bands: ReadonlyMap<number, "low" | "high" | "g">;
  /** Every item that can be sold (has a name and an item record). */
  allItems: readonly number[];
  /** Whether the EBOOT's item table is there to price items never sold before. */
  canPrice: boolean;
}

/** Groups of tables that must share one replacement per item: tables sharing a list, or all. */
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

function poolFor(
  own: readonly number[],
  allShopItems: readonly number[],
  options: ShopOptions,
  context: ShopContext,
): number[] {
  const base = options.mix === "each" ? own : allShopItems;
  if (options.pool === "shop") return [...base];
  if (options.pool === "any") return [...context.allItems];
  const ranks = options.pool === "low" ? ["low"] : ["low", "high"];
  const out = new Set(base);
  for (const [item, band] of context.bands) if (ranks.includes(band)) out.add(item);
  return [...out].sort((a, b) => a - b);
}

/**
 * New contents for every list of one group.
 *
 * Stages nest: if a stage's vanilla stock is part of a later stage's, its new
 * stock is part of the later one's too. Each list keeps the first N of its
 * candidates (its replacements, then the group's extra pool items) in one
 * priority order for the whole group: pinned items, then replacements by the
 * first stage their item appears in (random within a stage), then extras.
 * N grows with floor and shrinks with ceil from one factor per group, capped
 * so the longest list fits, which keeps every gap between stages at least
 * as big as before. A list also keeps everything the lists nested in it
 * kept, which priority alone doesn't promise when a later stage has more
 * pinned items than an earlier one.
 */
function prepareGroup(
  lists: ShopList[],
  pool: readonly number[],
  pinned: ReadonlySet<number>,
  maxLength: number,
  rng: Rng,
): { sigma: Map<number, number>; contents: (factor: number) => Map<number, number[]> } {
  const items: number[] = [];
  const firstStage = new Map<number, number>();
  lists.forEach((list, stage) => {
    for (const v of list.items) {
      if (!items.includes(v)) items.push(v);
      if (!firstStage.has(v)) firstStage.set(v, stage);
    }
  });

  // One replacement per item, distinct while the pool lasts.
  const sigma = new Map<number, number>();
  const available = rng.shuffle(pool.filter((v) => !pinned.has(v)));
  const used = new Set<number>(items.filter((v) => pinned.has(v)));
  let next = 0;
  for (const v of items) {
    if (pinned.has(v) || available.length === 0) {
      sigma.set(v, v);
      continue;
    }
    while (next < available.length && used.has(available[next]!)) next++;
    // Once every pool item is used, items repeat.
    const pick =
      next < available.length ? available[next++]! : available[rng.int(available.length)]!;
    sigma.set(v, pick);
    used.add(pick);
  }
  const extras = available.slice(next).filter((v) => !used.has(v));

  // Priority: pinned, then replacements by first stage (random within a stage), then extras.
  const stageOfNew = new Map<number, number>();
  for (const [v, now] of sigma) {
    const stage = pinned.has(now) ? -1 : firstStage.get(v)!;
    stageOfNew.set(now, Math.min(stage, stageOfNew.get(now) ?? Infinity));
  }
  const tiebreak = new Map(rng.shuffle([...stageOfNew.keys()]).map((v, i) => [v, i]));
  const priority = new Map<number, number>();
  [...stageOfNew.keys()]
    .sort((a, b) => stageOfNew.get(a)! - stageOfNew.get(b)! || tiebreak.get(a)! - tiebreak.get(b)!)
    .forEach((v) => priority.set(v, priority.size));
  for (const v of extras) priority.set(v, priority.size);

  const longest = Math.max(1, ...lists.map((l) => l.items.length));
  const contents = (requested: number): Map<number, number[]> => {
    const factor = Math.min(requested, maxLength / longest);
    const out = new Map<number, number[]>();
    const kept = new Map<ShopList, Set<number>>();
    // Smaller lists first, so a list's nested lists are settled before it.
    for (const list of [...lists].sort((a, b) => a.items.length - b.items.length)) {
      const replaced = [...new Set(list.items.map((v) => sigma.get(v)!))];
      if (list.items.length === 0) {
        out.set(list.offset, []);
        continue;
      }
      const size = list.items.length;
      const target =
        factor >= 1
          ? size + Math.floor((factor - 1) * size)
          : Math.max(1, Math.ceil(factor * size));
      const candidates = factor > 1 ? [...replaced, ...extras] : replaced;
      // Whatever a nested list kept stays (see above).
      const keep = new Set<number>();
      for (const [inner, items] of kept) {
        if (inner.items.every((v) => list.items.includes(v))) for (const v of items) keep.add(v);
      }
      for (const v of [...candidates].sort((a, b) => priority.get(a)! - priority.get(b)!)) {
        if (keep.size >= target) break;
        keep.add(v);
      }
      kept.set(list, keep);
      out.set(
        list.offset,
        candidates.filter((v) => keep.has(v)),
      );
    }
    return out;
  };
  return { sigma, contents };
}

/** The span the lists take now, and the bytes `contents` would need packed into it. */
function listSpace(
  data: ShopData,
  contents: ReadonlyMap<number, number[]>,
): { start: number; end: number; needed: number } {
  const lists = [...data.lists.values()].sort((a, b) => a.offset - b.offset);
  const start = lists[0]!.offset;
  const end = Math.max(...lists.map((l) => l.offset + l.items.length * 2 + 2));
  let needed = 0;
  for (const l of lists) {
    if (needed % 4 !== 0) needed += 2;
    needed += ((contents.get(l.offset) ?? l.items).length + 1) * 2;
  }
  return { start, end, needed };
}

/**
 * Writes new list contents. Same lengths: in place. Otherwise every list is
 * rewritten back to back (4-byte aligned, as on the disc) in the span the
 * lists take now, and every table's pointers are updated. Throws if the span
 * holds anything but lists and 0/0xFFFF padding, or if it's too small.
 */
export function writeLists(
  ovl: OvlFile,
  data: ShopData,
  contents: ReadonlyMap<number, number[]>,
  buf: Buffer,
): "in place" | "repacked" {
  const lists = [...data.lists.values()].sort((a, b) => a.offset - b.offset);
  const newItems = (l: ShopList) => contents.get(l.offset) ?? l.items;
  if (lists.every((l) => newItems(l).length === l.items.length)) {
    for (const l of lists) newItems(l).forEach((v, i) => buf.writeUInt16LE(v, l.offset + i * 2));
    return "in place";
  }

  const r = ovl.reader;
  const { start, end, needed } = listSpace(data, contents);
  const covered = new Set<number>();
  for (const l of lists) {
    for (let at = l.offset; at < l.offset + l.items.length * 2 + 2; at += 2) covered.add(at);
  }
  for (let at = start; at < end; at += 2) {
    const v = r.u16(at);
    if (!covered.has(at) && v !== 0 && v !== LIST_END) {
      throw new Error(
        `lobby_task.ovl: something other than shop lists is at 0x${at.toString(16)}, so shops can't change length. Set the shop item count variation to 0.`,
      );
    }
  }
  if (needed > end - start) {
    throw new Error(
      `Shop lists need ${needed} bytes but only ${end - start} are there; lower the shop item count variation.`,
    );
  }

  const moved = new Map<number, number>();
  buf.fill(0xff, start, end);
  let at = start;
  for (const l of lists) {
    if (at % 4 !== 0) at += 2;
    moved.set(l.offset, at);
    const items = newItems(l);
    items.forEach((v, i) => buf.writeUInt16LE(v, at + i * 2));
    buf.writeUInt16LE(LIST_END, at + items.length * 2);
    at += items.length * 2 + 2;
  }
  for (const table of data.tables) {
    table.lists.forEach((offset, i) => {
      buf.writeUInt32LE(ovl.loadBase + moved.get(offset)!, table.at + i * 4);
    });
  }
  return "repacked";
}

export function randomizeShops(
  data: ShopData,
  options: ShopOptions,
  context: ShopContext,
  rng: Rng,
  edits: Edits,
  lobby: LoadedOverlay,
): { report: ShuffleReport; sold: number[] } {
  const included = data.tables.filter((t) => options.special || !t.special);
  const pinned = new Set(options.keepEssentials ? ESSENTIALS : []);
  const allShopItems = [
    ...new Set(included.flatMap((t) => t.lists.flatMap((o) => data.lists.get(o)!.items))),
  ];
  const maxLength = Math.max(...[...data.lists.values()].map((l) => l.items.length));
  const lines: { where: string; text: string }[] = [];
  const contents = new Map<number, number[]>();
  let replaced = 0;

  const groups = groupTables(included, options.mix).map((group) => {
    const offsets = [...new Set(group.flatMap((t) => t.lists))].sort((a, b) => a - b);
    const lists = offsets.map((o) => data.lists.get(o)!);
    const own = [...new Set(lists.flatMap((l) => l.items))];
    const plan = prepareGroup(
      lists,
      poolFor(own, allShopItems, options, context),
      pinned,
      maxLength,
      rng,
    );
    const s = options.countSpread;
    const factor = s > 0 ? 1 - s + rng.float() * 2 * s : 1;
    return { group, plan, factor };
  });

  // Shops can only grow into space others free: scale growth back until the lists fit.
  let growth = 1;
  const planned = () => {
    const out = new Map<number, number[]>();
    for (const { plan, factor } of groups) {
      const f = factor > 1 ? 1 + (factor - 1) * growth : factor;
      for (const [offset, items] of plan.contents(f)) out.set(offset, items);
    }
    return out;
  };
  for (;;) {
    const space = listSpace(data, planned());
    if (space.needed <= space.end - space.start || growth === 0) break;
    growth = Math.max(0, Math.round((growth - 0.05) * 100) / 100);
  }
  for (const [offset, items] of planned()) contents.set(offset, items);

  for (const { group, plan } of groups) {
    const where = group.map((t) => t.name).join(" + ");
    for (const [v, now] of plan.sigma) {
      if (now !== v) replaced++;
      lines.push({
        where,
        text: now === v ? `${itemName(v)} (unchanged)` : `${itemName(v)} -> ${itemName(now)}`,
      });
    }
    if (options.countSpread > 0) {
      for (const table of group) {
        const sizes = table.lists.map(
          (o) => `${data.lists.get(o)!.items.length}->${contents.get(o)!.length}`,
        );
        lines.push({
          where: `${where}: items per stage`,
          text: `${table.name}: ${sizes.join(", ")}`,
        });
      }
    }
  }

  const layout = writeLists(lobby.ovl, data, contents, edits.overlay(lobby));

  const notes: string[] = [];
  if (!context.canPrice && options.pool !== "shop") {
    notes.push(
      "Without the decrypted EBOOT, items that are never normally sold can't be given a price, so some may be free.",
    );
  }

  const skipped = data.tables.filter((t) => !included.includes(t)).map((t) => t.name);
  const poolText: Record<ShopPool, string> = {
    shop: options.mix === "each" ? "each shop's own items" : "items any shop sells",
    low: "shop items and anything first found in Low Rank",
    high: "shop items and anything first found in Low or High Rank",
    any: "any item in the game",
  };
  const report: ShuffleReport = {
    title: "Shop stock",
    notes: [
      `Each item a shop sells is replaced by one drawn from ${poolText[options.pool]}, the same in every stage of that shop.`,
      options.mix === "all"
        ? "One replacement per item for all shops together."
        : "Each shop has its own replacements; shops that share stock lists share them.",
      options.keepEssentials
        ? "Potion, Whetstone, pickaxes, bugnets, BBQ Spit, Normal S Lv1/2 and Empty Bottle stay on sale."
        : "No item is guaranteed to stay on sale.",
      options.countSpread > 0
        ? `How many items each shop sells varies by up to ${Math.round(options.countSpread * 100)}% (at most ${maxLength}); the lists were ${layout === "repacked" ? "rewritten and the shop tables updated" : "kept in place"}.${growth < 1 ? ` Shops can only grow into space others free, so growth was scaled to ${Math.round(growth * 100)}%.` : ""}`
        : "Each shop sells as many items as before.",
      ...notes,
      `${replaced} items replaced.${skipped.length > 0 ? ` Not changed: ${skipped.join(", ")}.` : ""}`,
    ],
    lines,
  };
  // Every item a shop now sells, for prices and carry limits.
  return { report, sold: [...new Set([...contents.values()].flat())].sort((a, b) => a - b) };
}

// ---------------------------------------------------------------- prices and carry limits

/**
 * What the shops sell with their stock unchanged: every item of every shop
 * but the Point Exchange, which takes Pokke Points (so it's priced only when
 * it's in the stock shuffle, `shops.special`).
 */
export function itemsOnSale(data: ShopData): number[] {
  const items = data.tables
    .filter((t) => !t.special)
    .flatMap((t) => t.lists.flatMap((o) => data.lists.get(o)!.items));
  return [...new Set(items)].sort((a, b) => a - b);
}

export interface PriceOptions {
  /** Buy prices vary by up to this fraction, or null to keep them. */
  priceSpread: number | null;
  /** Carry limits vary by up to this fraction, or null to keep them. */
  stackSpread: number | null;
}

/**
 * Prices and carry limits of `sold` (what the shops sell, after any stock
 * shuffle). Any of them with no price, never on sale before, gets one from
 * its rarity, so nothing is free. Null when there's nothing to report.
 */
export function randomizeShopPrices(
  sold: readonly number[],
  options: PriceOptions,
  table: ItemTable | null,
  rng: { prices: Rng; stacks: Rng },
  edits: Edits,
): ShuffleReport | null {
  if ((options.priceSpread !== null || options.stackSpread !== null) && !table) {
    throw new Error("Shop prices and carry limits need the decrypted EBOOT");
  }
  if (!table) return null;
  const notes: string[] = [];
  const priceLines: { where: string; text: string }[] = [];
  const stackLines: { where: string; text: string }[] = [];
  const eboot = edits.eboot();
  let priced = 0;
  for (const id of sold) {
    if (id >= table.count) continue;
    const at = table.base + id * ITEM_ENTRY_SIZE;
    let price = eboot.readUInt32LE(at + table.priceField);
    const old = price;
    if (price === 0) {
      // Never on sale before, so no price: one from its rarity, so nothing is free.
      price = 100 * (eboot.readUInt8(at + RARITY_FIELD) + 1) ** 2;
      priced++;
    }
    if (options.priceSpread !== null) {
      const s = options.priceSpread;
      price = Math.max(1, Math.round(price * (1 - s + rng.prices.float() * 2 * s)));
    }
    if (price !== old) {
      eboot.writeUInt32LE(price, at + table.priceField);
      priceLines.push({ where: "Prices", text: `${itemName(id)}: ${price}z (was ${old}z)` });
    }
    if (options.stackSpread !== null) {
      const oldStack = eboot.readUInt8(at + STACK_FIELD);
      if (oldStack === 0) continue;
      const s = options.stackSpread;
      const stack = Math.min(
        99,
        Math.max(1, Math.round(oldStack * (1 - s + rng.stacks.float() * 2 * s))),
      );
      eboot.writeUInt8(stack, at + STACK_FIELD);
      if (stack !== oldStack) {
        stackLines.push({
          where: "Carry limits",
          text: `${itemName(id)}: ${stack} (was ${oldStack})`,
        });
      }
    }
  }
  if (priced > 0) {
    notes.push(
      `${priced} items had no price, so they got one from their rarity: 100z × (rarity + 1)², before any variation.`,
    );
  }
  if (options.priceSpread !== null) {
    notes.push(
      `Prices of everything shops sell vary by up to ${Math.round(options.priceSpread * 100)}%. The price is the item's own, so it applies in every shop.`,
    );
  }
  if (options.stackSpread !== null) {
    notes.push(
      `Carry limits of everything shops sell vary by up to ${Math.round(options.stackSpread * 100)}% (1 to 99). They apply everywhere, not just in shops.`,
    );
  }
  if (notes.length === 0) return null;
  return { title: "Shop prices", notes, lines: [...priceLines, ...stackLines] };
}
