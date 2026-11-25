/**
 * Hunter's Pact (`pact.enabled`): when a quest starts, a window offers three
 * pacts drawn at random, each a penalty paired with its reward: more zenny,
 * more quest reward draws, items from the quest's own rewards and monsters,
 * or equipment of its rank. Rewards are paid only if
 * the quest is completed. Taking none changes nothing. The blob code is
 * `blob/pact.c`, on the code loader's pad, quest frame, HUD and rewards hooks
 * (`game-hooks.ts`); this finds the game's addresses it uses, per disc, and
 * builds the reward pool (`pactPool`) per seed.
 *
 * What the game does (found on the EU and JP discs):
 *
 * - The quest object sits in the HUD object at `+0x1220` (the global the
 *   quest loader is handed, EU `*0x08A62C7C`). Its `+0x10` is the clock
 *   (ticks left, counting down), `+0x14` the reward zenny and `+0x18` the
 *   penalty a faint takes off it (a third of the reward on every disc
 *   quest), `+0x4C` the loaded quest file (EU 0x08A5C440). Its `+0x714` is
 *   the index of the file the loader read last: asked for the same quest
 *   again, the loader keeps what's in memory, so a pact that edits the file
 *   clears it. Its text is offsets from the file's start (`+0x60`,
 *   `game/quest-text.ts`), read each time it's shown: sealing points each
 *   language's details (the info screen's page 4) at the pact's list in
 *   the blob, in place of the description.
 * - The reward roll (EU 0x0886F894) is handed the quest object and reads
 *   its reward tables from the pointer at `+0x5C` (into the loaded file;
 *   the elites' quest state, `elite.ts`, is the same object). It draws from
 *   the main table (kind `0x8000`) as many times as its byte `+3` says, at
 *   most 9, then gives each slot past those a chance (the Luck skills raise
 *   it). It fills the save's reward box (`+0x390`, 32 slots of item and
 *   amount: its own in the first 16, captures' and breaks' in the rest) and
 *   sorts each half; the reward screen shows the box. The pact adds its items
 *   to the first free slots.
 * - The equipment box is the save's `+0x548`, 800 to 1000 slots (8 to 10
 *   pages of 100, by quest flags 829 and 830). `freeSlot(save)` (EU
 *   0x088506A4, FUC 0x088505E8) gives the first slot whose byte 0 is 0, or
 *   0xFFFF when the box is full; the pact asks it (and searches the first 800
 *   itself where it isn't found), and offers only the pieces there's room
 *   for. 12 bytes a slot: `01`, the
 *   type (0-4 armor: legs, head, chest, arms, waist; 5 melee, 6 ranged), the
 *   ID (u16), then the armor's level and three decorations (as the site's
 *   save reader has it, `apps/blacksmith/public/javascript/save-worker.js`,
 *   0x4A0 bytes further on in memory than in the save file).
 * - The window: the HUD's "Armor Sphere received." card is drawn by
 *   `window(hud, rect, text, 0xFF)` (EU 0x0882FC50): a framed box at the
 *   rect's x, y, w, h (u16s at `+0`), whose glyph size (`+8`, `+9`: 14x14),
 *   colour (`+0xA`), frame style (`+0xB`, 0 for the card) and line height
 *   (`+0x10`) it gives the printer. Its text it prints with
 *   `print(printer, x, y, "%s", text)` (EU 0x088920A8, its call at `+0xFC`),
 *   which reads `~Cnn` colours and `~Bnn` button icons in the text.
 * - Layers: the HUD draws into display lists by layer, 9 to 14, drawn in
 *   that order. The HUD's shapes go to the layer in its `+0x534` byte; the
 *   printer's text to 9 plus its `+0x12F` (0 to 5, set by a setter the
 *   signature below covers). The pact draws in the last, over the map and
 *   item bar.
 * - Shade: `fill(hud, x, y, w, h, r, g, b, alpha)` (EU 0x0882D8DC, the
 *   ninth argument on the stack) draws a translucent rectangle, as the game's
 *   fades do.
 * - Item icons: `itemIcon(hud, item, x, y, w, h, marks, alpha)` (EU
 *   0x0882E2C0) draws an item's icon in its colour, as the pouch and item
 *   box do, into the HUD's layer. `equipmentIcon(hud, type, id, x, y, w, h,
 *   alpha, dim)` (EU 0x08831338) does the same for a piece of equipment, by
 *   its equipment box type and ID, in its rarity's colour. The window shows
 *   each item and piece reward's.
 * - Input: shops and dialogues set the pad object's `+0x17` to keep input
 *   from the game (see `game-hooks.ts`); the pact does too while its window
 *   is open, and reads the buttons from the controller read itself.
 *
 * Everything is found by code signatures, which match the EU and JP (FUC)
 * discs.
 */
import type { OvlFile } from "mhfu-extract/src/container/ovl.js";
import { displayRarity, rankFromRarity } from "mhfu-extract/src/emit/common.js";
import { HUNTER_TYPE_BITS } from "mhfu-extract/src/emit/armor.js";
import type { ArmorSlot } from "mhfu-extract/src/tables/armor.js";
import { ITEM_ENTRY_SIZE } from "mhfu-extract/src/tables/offsets.js";
import { decodeObjects } from "../blob/link.js";
import { MONSTERS_OBJECTS } from "../blob/monsters-object.js";
import { PACT_OBJECTS } from "../blob/pact-object.js";
import type { HookSites } from "./game-hooks.js";
import { findUnique, hiLo, jumpTarget, maskImmediates, maskWord, type Segment } from "./mips.js";
import { findMonsterExterns } from "./monster-hp.js";
import { isNeverDrawn } from "../game/quest-fields.js";
import type { Band, Tier } from "../game/tiers.js";
import { itemName } from "../names.js";
import type { Rng } from "../rng.js";
import { STACK_FIELD, type ItemTable } from "../shuffles/shops.js";

/**
 * The printer's setters, exact: position (`+0x120`, `+0x122`), layer
 * (`+0x12F`, 0 to 5), colour (`+0x12E`) and `+0x15F`. The pact writes the
 * layer itself; these show the offsets hold on the disc.
 */
export const TEXT_SETTERS = [
  0xa4850120, 0x03e00008, 0xa4860122, 0x7c051c20, 0x04630003, 0x7c051c20, 0x00002821, 0x7c051c20,
  0x28630006, 0x54600003, 0xa085012f, 0x24050005, 0xa085012f, 0x03e00008, 0x00000000, 0x03e00008,
  0xa085012e,
];
/** `window`'s call to the code-reading print, from its start. */
const WINDOW_PRINT_CALL = 0xfc;
/**
 * The HUD's translucent fill (EU 0x0882D8DC, JP 0x0882DB20), exact: colour
 * bytes to RGBA, then the display list header it builds.
 */
export const FILL_SIGNATURE = [
  0x27bdffb0, 0x314300ff, 0x312900ff, 0x00031a00, 0x01234825, 0x316300ff, 0x00031c00, 0x00695025,
  0x30a9ffff, 0x3103ffff, 0x30c5ffff, 0x00a31821, 0x00033400, 0x24030008, 0xafa30014, 0x3c031e00,
  0xafa30030, 0x3c035000, 0x34630001, 0xafa30034, 0x3c031280, 0x3463011c, 0xafa30038, 0x3c030406,
];
/**
 * The HUD's window routine, masked: `window(hud, rect, text, alpha)` draws a
 * framed box (the item-received card's, frame style 0) and sets the printer's
 * glyph size and colour from the rect (EU 0x0882FC50, JP 0x0882FE94).
 */
export const WINDOW_SIGNATURE = [
  0x27bdfff0, 0xafbf0000, 0xafb10000, 0xafb00000, 0x90a3000b, 0x24020000, 0x00c08021, 0x00e04821,
  0x1062001c, 0x00a08821, 0x24020000, 0x50620013, 0x96250000, 0x24020000, 0x1062000f, 0x00000000,
  0x24020000, 0x50620006, 0x96250000, 0x10600003, 0x00000000, 0x10000014, 0x00000000, 0x96250000,
  0x96270004, 0x96280006, 0x0c000000, 0x96260002,
];

/**
 * The HUD's item icon routine, `itemIcon(hud, item, x, y, w, h, marks,
 * alpha)` (EU 0x0882E2C0, JP 0x0882E504): the item's icon shape from the
 * item table (`+5`), tinted with its colour (`+6`), the 16x16 sprite below
 * a width of 21 and the 24x24 one from it, its top left at x, y. The pouch
 * and item box call it with `marks` 1, which adds their overlays (the ammo
 * the gun can't load); 0 draws the icon alone. Masked, from `+0x40`: the
 * words before load the item table's address, which differs by disc.
 */
export const ITEM_ICON_SIGNATURE = [
  0x00658821, 0xafb00000, 0x92250005, 0x24030000, 0x00c0a021, 0x00e09821, 0x01009021, 0xa7a9004e,
  0xa3aa004d, 0x0160b021, 0x10a30078, 0x0080a821, 0x0c000000, 0x24050000, 0x92250005, 0x3250ffff,
  0x2a060015, 0x0c000000, 0x02a02021, 0x92240006, 0x87a3004e, 0x7c12f620, 0xafb60000, 0xafa20000,
];
/** Where `ITEM_ICON_SIGNATURE` starts in the routine, after its first `addiu sp, sp, -0x50`. */
export const ITEM_ICON_SIGNATURE_AT = 0x40;
const ITEM_ICON_PROLOGUE = 0x27bdffb0;
/**
 * The HUD's equipment icon routine, `equipmentIcon(hud, type, id, x, y, w,
 * h, alpha, dim)` (EU 0x08831338, JP 0x08831460), masked: a piece by its
 * equipment box type and ID, its shape for its slot or weapon class (16x16
 * below a width of 24), tinted with its rarity's colour (`dim`, on the
 * stack, picks a dimmer set).
 */
export const EQUIPMENT_ICON_SIGNATURE = [
  0x27bdffc0, 0xafbf0000, 0xafb60000, 0xafb50000, 0xafb40000, 0xafb30000, 0xafb20000, 0xafb10000,
  0xafb00000, 0x01209821, 0x3262ffff, 0x28500018, 0xa3a50035, 0xa7a60036, 0x0080b021, 0x3c020000,
  0x8c440000, 0x00e0a821, 0x0100a021, 0x01409021, 0x01608821, 0x30a500ff, 0x0c000000, 0x30c6ffff,
  0x93a70040, 0x02203021, 0x304500ff, 0x0c000000, 0x02c02021, 0x02003021, 0xafa20000, 0x02c02021,
];

const word = (buf: Buffer, at: number) => buf.readUInt32LE(at);

/**
 * The EBOOT's `freeSlot(save)` (EU 0x088506A4, FUC 0x088505E8), whole: the
 * index of the first equipment box slot (`save+0x548`, 12 bytes each) whose
 * byte 0 is 0, among the box's pages of 100, or 0xFFFF.
 */
export const FREE_SLOT_SIGNATURE = [
  0x27bdfff0, 0xafbf000c, 0xafb00008, 0x0c000000, 0x249004a0, 0x7c021e20, 0x1860000c, 0x00002821,
  0x00002021, 0x02041021, 0x904200a8, 0x54400003, 0x24a20001, 0x10000006, 0x30a2ffff, 0x7c022e20,
  0x00a3102a, 0x1440fff7, 0x2484000c, 0x3402ffff, 0x8fbf000c, 0x8fb00008, 0x03e00008, 0x27bd0010,
];

/** `ori v0, zero, 0xffff`, which the signature masks: the full box's value `blob/pact.c` tests for. */
const FREE_SLOT_FULL: readonly [number, number] = [0x4c, 0x3402ffff];

/** `freeSlot`'s address, as `blob/pact.c` reads it (`rf_pact_free_slot_fn`), or null. */
export function findFreeSlot(vanillaEboot: Buffer, segment: Segment): number | null {
  const [found] = findUnique(vanillaEboot, segment, [FREE_SLOT_SIGNATURE.map(maskWord)]);
  if (found == null) return null;
  const [at, full] = FREE_SLOT_FULL;
  return word(vanillaEboot, segment.offset + (found - segment.vaddr) + at) === full ? found : null;
}

/** The text externs, or why they can't be found. */
export function findTextExterns(
  vanillaEboot: Buffer,
  sites: HookSites,
): Record<string, number> | string {
  const { segment } = sites;
  const at = (vaddr: number) => word(vanillaEboot, segment.offset + (vaddr - segment.vaddr));
  const [setters, window, fill, iconBody, equipmentIcon] = findUnique(vanillaEboot, segment, [
    TEXT_SETTERS.map(maskWord),
    WINDOW_SIGNATURE,
    FILL_SIGNATURE.map(maskWord),
    ITEM_ICON_SIGNATURE,
    EQUIPMENT_ICON_SIGNATURE,
  ]);
  if (setters == null) return "this EBOOT's text code doesn't match";
  if (window == null || fill == null) return "this EBOOT's window code doesn't match";
  const itemIcon = iconBody == null ? null : iconBody - ITEM_ICON_SIGNATURE_AT;
  if (itemIcon == null || at(itemIcon) !== ITEM_ICON_PROLOGUE) {
    return "this EBOOT's item icon code doesn't match";
  }
  if (equipmentIcon == null) return "this EBOOT's equipment icon code doesn't match";
  const printCall = at(window + WINDOW_PRINT_CALL);
  if (printCall >>> 26 !== 0x03) return "this EBOOT's window code doesn't match";
  // After `jal padRead`: `lui v0, hi; jal reset; lw a0, lo(printer)(v0)`.
  const lui = at(sites.pad + 8);
  const lw = at(sites.pad + 16);
  if (lui >>> 26 !== 0x0f || lw >>> 26 !== 0x23 || at(sites.pad + 12) >>> 26 !== 0x03) {
    return "this EBOOT's main loop doesn't match";
  }
  return {
    rf_printer: hiLo(lui, lw),
    rf_print: jumpTarget(printCall, window + WINDOW_PRINT_CALL),
    rf_window: window,
    rf_fill: fill,
    rf_item_icon: itemIcon,
    rf_equipment_icon: equipmentIcon,
    // `lui v0, hi; jal padRead; lw a0, lo(pad)(v0)`: the pad object's global.
    rf_pad: hiLo(at(sites.pad - 4), at(sites.pad + 4)),
  };
}

/**
 * The EBOOT's `level(hunter, sharpness)` (EU 0x088DAB94, FUC 0x088DD4DC),
 * immediates masked: 0 unless the hunter's weapon is a melee one
 * (`hunter+0x4E9` is 5), else how many of the weapon's cumulative sharpness
 * thresholds lie below `sharpness`, the colour it's on (0 red to 6 purple).
 * Its curve is the weapon type's pointer into the sharpness table, plus the
 * weapon's SharpnessID (`hunter+0x4EA` its ID).
 */
export const SHARPNESS_LEVEL_SIGNATURE = [
  0x27bd0000, 0xafbf0000, 0xafb10000, 0xafb00000, 0x90830000, 0x24020000, 0x00a08021, 0x10620000,
  0x00808821, 0x10000000, 0x00001021, 0x3c020000, 0x8c440000, 0x0c000000, 0x26250000, 0x30420000,
  0x00022880, 0x3c020000, 0x24420000, 0x00451021, 0x96230000, 0x8c460000, 0x7c102620, 0x00031040,
  0x00431021, 0x000218c0, 0x3c020000, 0x24420000, 0x00431021, 0x90450000, 0x000518c0, 0x00651823,
  0x00031840, 0x00001021, 0x00c32821, 0x84a30000, 0x0064082a, 0x10200000, 0x00000000, 0x24420000,
  0x30420000, 0x28430000, 0x14600000, 0x24a50000, 0x8fbf0000, 0x8fb10000, 0x8fb00000, 0x03e00008,
];
/** The words the signature masks that the blade pacts rely on: the weapon's kind and ID fields. */
const SHARPNESS_LEVEL_FIELDS: readonly [number, number][] = [
  [0x10, 0x908304e9], // lbu v1, 0x4e9(a0)
  [0x14, 0x24020005], // addiu v0, zero, 5
  [0x50, 0x962304ea], // lhu v1, 0x4ea(s1)
];

/** `level`'s address, as `blob/pact.c` reads it (`rf_pact_level_fn`), or null where it isn't found. */
export function findSharpnessLevel(vanillaEboot: Buffer, segment: Segment): number | null {
  const [found] = findUnique(vanillaEboot, segment, [SHARPNESS_LEVEL_SIGNATURE], maskImmediates);
  if (found == null) return null;
  const at = (vaddr: number) => word(vanillaEboot, segment.offset + (vaddr - segment.vaddr));
  return SHARPNESS_LEVEL_FIELDS.every(([k, w]) => at(found + k) === w) ? found : null;
}

/**
 * `rf_pact_level_fn` and `rf_pact_free_slot_fn`: a game function's address, 0
 * for none (no blade pacts; the blob's own search for a free slot).
 */
export function encodeOptionalFn(address: number | null): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(address ?? 0);
  return out;
}

/** The blob's externs for the pact (and the monster boosts it uses), or why they can't be found. */
export function findPactExterns(
  vanillaEboot: Buffer,
  sites: HookSites,
  gameTask: Buffer,
  ovl: OvlFile,
): Record<string, number> | string {
  const text = findTextExterns(vanillaEboot, sites);
  if (typeof text === "string") return text;
  const monsters = findMonsterExterns(gameTask, ovl);
  if (typeof monsters === "string") return monsters;
  return { ...text, ...monsters };
}

/** The pact's objects, with the monster boosts (`blob/monsters.c`) it registers with. */
export const pactObjects = () => [
  ...decodeObjects(PACT_OBJECTS),
  ...decodeObjects(MONSTERS_OBJECTS),
];

/** Somewhere in the pool: items by grade (1 to 3), or equipment. */
export const POOL_KINDS = 4;
const POOL_BANDS: readonly Band[] = ["low", "high", "g"];
const SPAN_BYTES = 4;
const ENTRY_BYTES = 8;
/** An item reward's entry type; equipment has the equipment box's. */
const ITEM_TYPE = 0xff;
/** Equipment pieces per rarity, at most. */
const EQUIPMENT_PER_RARITY = 12;
/**
 * At most this share of what every recipe needs of an item, in one reward
 * (jackpots too, `blob/pact.c`): a niche material never comes in a pile
 * that covers every craft it's for.
 */
export const DEMAND_SHARE = 3;
/** Each rank's equipment rarities, as shown (`displayRarity`). */
export const BAND_RARITIES: Record<Band, readonly [number, number]> = {
  low: [1, 5],
  high: [6, 8],
  g: [9, 10],
};
/**
 * What an item reward is worth, in item-table price (the general store's
 * buy price; for materials the same scale, Rathalos Plate 48500), by rank
 * and grade. Grade 1 pays for the lightest penalties, grade 3 the hardest.
 */
export const GRADE_VALUES: Record<Band, readonly [number, number, number]> = {
  low: [3000, 10000, 35000],
  high: [12000, 40000, 120000],
  g: [40000, 120000, 360000],
};
/**
 * How many of an item each grade gives, least and most: a handful of
 * something common for a light penalty, one or two rare things for a hard one.
 */
export const GRADE_AMOUNTS: readonly (readonly [number, number])[] = [
  [3, 10],
  [2, 5],
  [1, 3],
];
/** How far a reward's worth may stray from its grade's value, either way. */
const VALUE_SPREAD = [0.6, 1.6] as const;
/** Longest name, in bytes (names are ASCII). */
const NAME_BYTES = 28;

/** The equipment box's type for an armor slot. */
export const ARMOR_BOX_TYPE: Record<ArmorSlot, number> = {
  leg: 0,
  head: 1,
  chest: 2,
  arm: 3,
  waist: 4,
};
export const MELEE_BOX_TYPE = 5;
export const RANGED_BOX_TYPE = 6;

export interface PoolEquipment {
  /** The equipment box's type (`ARMOR_BOX_TYPE`, `MELEE_BOX_TYPE`, `RANGED_BOX_TYPE`). */
  type: number;
  id: number;
  name: string;
  /** Raw rarity (shown as rarity + 1). */
  rarity: number;
  /** `HunterType` bits, for armor: pieces both sexes can wear go in the pool. */
  bits?: number;
}

/** An item's price (`ItemTable.priceField`) and carry limit, from the item table. */
export interface ItemValue {
  price: number;
  carry: number;
  /** The most one reward gives (`demandCaps`); none when no recipe needs it. */
  most?: number;
}

/**
 * The most of each item one reward gives: a third of what every crafting
 * and upgrade recipe needs of it in all, rounded up. Items no recipe needs
 * (they only sell) have none.
 */
export function demandCaps(
  slots: Iterable<{ itemId: number; quantity: number }>,
): Map<number, number> {
  const total = new Map<number, number>();
  for (const { itemId, quantity } of slots) {
    total.set(itemId, (total.get(itemId) ?? 0) + quantity);
  }
  return new Map([...total].map(([id, n]) => [id, Math.max(1, Math.ceil(n / DEMAND_SHARE))]));
}

/** Every item's price and carry limit, from the disc's item table. */
export function readItemValues(eboot: Buffer, table: ItemTable): Map<number, ItemValue> {
  const values = new Map<number, ItemValue>();
  for (let id = 1; id < table.count; id++) {
    const at = table.base + id * ITEM_ENTRY_SIZE;
    values.set(id, {
      price: eboot.readUInt32LE(at + table.priceField),
      carry: eboot.readUInt8(at + STACK_FIELD),
    });
  }
  return values;
}

/**
 * How many of an item make a reward worth about `value`, within `grade`'s
 * amounts and the item's carry limit; null when none do. Items with no
 * price (supplies, Commendations) or that can't stack (eggs) never fit.
 */
export function rewardAmount(item: ItemValue, value: number, grade: number): number | null {
  const [least, most] = GRADE_AMOUNTS[grade]!;
  if (item.price <= 0 || item.carry < 2) return null;
  const top = Math.min(most, item.carry, item.most ?? Infinity);
  if (top < least) return null;
  const amount = Math.max(least, Math.min(top, Math.round(value / item.price)));
  const worth = amount * item.price;
  return worth >= value * VALUE_SPREAD[0] && worth <= value * VALUE_SPREAD[1] ? amount : null;
}

export interface PactPoolEntry {
  id: number;
  type: number;
  amount: number;
  name: string;
  /** An item's: the most one reward gives (`demandCaps`), 0 for no limit. */
  most?: number;
  /** A piece's rarity, as shown (`displayRarity`). */
  rarity?: number;
}

/** The reward pool, by band and kind (items of grade 1 to 3, then equipment). */
export type PactPool = PactPoolEntry[][][];

function sample<T>(list: readonly T[], n: number, rng: Rng): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

const ascii = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .slice(0, NAME_BYTES);

/**
 * The pact's rewards for each rank: the items some quest at that rank can be
 * tied to (`tiedItems`), in three grades by what they're worth
 * (`GRADE_VALUES`, in the amounts `GRADE_AMOUNTS` allows, and no more than
 * `demand` lets one reward give), and equipment of that rank's rarities,
 * some of each rarity, by rarity (the blob offers those that fit the quest's
 * stars, `pactLevels`). An item can be in more than one grade, in different
 * amounts. The blob offers only the current quest's own tied items
 * (`blob/pact.c`, `tie_quest`), never another quest's nor one no quest is
 * tied to.
 */
export function pactPool(
  itemValues: ReadonlyMap<number, ItemValue>,
  equipment: readonly PoolEquipment[],
  rng: Rng,
  demand: ReadonlyMap<number, number> = new Map(),
  tied: ReadonlyMap<Band, ReadonlySet<number>> = new Map(),
): PactPool {
  const { male, female } = HUNTER_TYPE_BITS;
  const drawable = (id: number) =>
    id > 0 && id < TIED_ITEMS && !isNeverDrawn(id) && itemName(id) !== `Item ${id}`;
  return POOL_BANDS.map((band) => {
    const items = [...(tied.get(band) ?? [])].filter(drawable).sort((a, b) => a - b);
    const grades = GRADE_VALUES[band].map((value, g) =>
      items
        .flatMap((id) => {
          const item = itemValues.get(id);
          const most = demand.get(id);
          const amount = item && rewardAmount({ ...item, most }, value, g);
          return amount ? [{ id, amount, most: most ?? 0 }] : [];
        })
        .sort((a, b) => a.id - b.id)
        .map(({ id, amount, most }) => ({
          id,
          type: ITEM_TYPE,
          amount,
          name: ascii(itemName(id)),
          most,
        })),
    );
    const gear = equipment.filter(
      (e) =>
        rankFromRarity(displayRarity(e.rarity)) === `${band}-rank` &&
        (e.bits === undefined || ((e.bits & male) !== 0 && (e.bits & female) !== 0)) &&
        ascii(e.name).length > 0,
    );
    const rarities = [...new Set(gear.map((e) => displayRarity(e.rarity)))].sort((a, b) => a - b);
    const pieces = rarities.flatMap((r) =>
      sample(
        gear.filter((e) => displayRarity(e.rarity) === r),
        EQUIPMENT_PER_RARITY,
        rng,
      )
        .sort((a, b) => a.type - b.type || a.id - b.id)
        .map((e) => ({ id: e.id, type: e.type, amount: 1, name: ascii(e.name), rarity: r })),
    );
    return [...grades, pieces];
  });
}

/** Star levels `pactLevels` covers; a quest's stars past it count as the last. */
export const LEVEL_STARS = 16;

/**
 * The rarities a piece of equipment may have, for each rank and star level,
 * as `blob/pact.c` reads them (`rf_pact_levels`: a byte per rank and stars,
 * the lowest rarity in its low half and the highest in its high half). A
 * quest's place among its rank's star levels (from the fewest stars any of
 * `tiers` has to the most) is its place among the rank's rarities: the
 * rarity there and the next one up. So a piece is never weaker than what its
 * star level gives, and no more than a step ahead: Low Rank's 1 star pays
 * rarity 1 or 2, its 5 stars (of 6) rarity 4 or 5.
 */
export function pactLevels(tiers: Iterable<Tier>): Buffer {
  const out = Buffer.alloc(POOL_BANDS.length * LEVEL_STARS);
  const list = [...tiers];
  POOL_BANDS.forEach((band, b) => {
    const stars = list.filter((t) => t.band === band).map((t) => t.stars);
    const [lo, hi] = BAND_RARITIES[band];
    const fewest = stars.length ? Math.min(...stars) : 1;
    const most = stars.length ? Math.max(...stars) : 1;
    for (let s = 0; s < LEVEL_STARS; s++) {
      const place =
        most > fewest ? (Math.min(Math.max(s, fewest), most) - fewest) / (most - fewest) : 0;
      const low = lo + Math.floor(place * (hi - lo));
      out[b * LEVEL_STARS + s] = low | (Math.min(hi, low + 1) << 4);
    }
  });
  return out;
}

/** Species the capture bitmask and the drops table cover (emIDs below it). */
const CAPTURABLE_BITS = 96;
/** Items a quest can be tied to (IDs below it): `blob/pact.c`'s `tied` bits. */
export const TIED_ITEMS = 2048;

/** An item a monster drops at a rank, or a quest of that rank gives (no `emId`). */
export interface TiedItem {
  band: Band;
  itemId: number;
  emId?: number;
}

/** Each rank's items some quest can be tied to: its monsters' drops and its own rewards. */
export function tiedItems(items: Iterable<TiedItem>): Map<Band, Set<number>> {
  const out = new Map<Band, Set<number>>();
  for (const { band, itemId } of items) {
    if (itemId <= 0 || itemId >= TIED_ITEMS) continue;
    const set = out.get(band) ?? new Set<number>();
    set.add(itemId);
    out.set(band, set);
  }
  return out;
}

/**
 * What each large monster drops at each rank (carves, captures, breaks), as
 * `blob/pact.c` reads them (`rf_pact_drops`): a span (first, count) per rank
 * and species, then the item IDs, u16 each. A quest's pact rewards lean to
 * its large monsters' drops at its rank.
 */
export function encodeDrops(drops: Iterable<TiedItem>): Buffer {
  const lists = POOL_BANDS.map(() =>
    Array.from({ length: CAPTURABLE_BITS }, () => new Set<number>()),
  );
  for (const { band, emId, itemId } of drops) {
    const b = POOL_BANDS.indexOf(band);
    if (b < 0 || emId === undefined || emId <= 0 || emId >= CAPTURABLE_BITS) continue;
    if (itemId > 0 && itemId < TIED_ITEMS) lists[b]![emId]!.add(itemId);
  }
  const head = POOL_BANDS.length * CAPTURABLE_BITS * SPAN_BYTES;
  const items = lists.flat().map((set) => [...set].sort((a, b) => a - b));
  const out = Buffer.alloc(head + items.flat().length * 2);
  let index = 0;
  items.forEach((list, k) => {
    out.writeUInt16LE(index, k * SPAN_BYTES);
    out.writeUInt16LE(list.length, k * SPAN_BYTES + 2);
    for (const id of list) out.writeUInt16LE(id, head + index++ * 2);
  });
  return out;
}

/**
 * The large monsters that can be captured, as `blob/pact.c` reads them
 * (`rf_pact_capturable`): bit n for emID n. Capture or nothing is offered
 * only where every large monster of the quest is one.
 */
export function encodeCapturable(monsters: Iterable<number>): Buffer {
  const out = Buffer.alloc(CAPTURABLE_BITS / 8);
  for (const em of monsters) {
    if (em > 0 && em < CAPTURABLE_BITS) out[em >> 3]! |= 1 << (em & 7);
  }
  return out;
}

/** The pool as `blob/pact.c` reads it (`rf_pact_pool`). */
export function encodePactPool(pool: PactPool): Buffer {
  const entries = pool.flat(1).flat();
  const names = new Map<string, number>();
  const head = POOL_BANDS.length * POOL_KINDS * SPAN_BYTES;
  let nameAt = head + entries.length * ENTRY_BYTES;
  for (const e of entries) {
    if (names.has(e.name)) continue;
    names.set(e.name, nameAt);
    nameAt += Buffer.byteLength(e.name) + 1;
  }
  if (nameAt > 0x10000) {
    throw new RangeError(`Hunter's Pact pool is ${nameAt} bytes, past its 64 KB of u16 offsets`);
  }
  const out = Buffer.alloc(nameAt);
  let index = 0;
  pool.forEach((kinds, b) =>
    kinds.forEach((list, k) => {
      const span = (b * POOL_KINDS + k) * SPAN_BYTES;
      out.writeUInt16LE(index, span);
      out.writeUInt16LE(list.length, span + 2);
      for (const e of list) {
        const at = head + index++ * ENTRY_BYTES;
        out.writeUInt16LE(e.id, at);
        out.writeUInt8(e.type, at + 2);
        out.writeUInt8(e.amount, at + 3);
        out.writeUInt16LE(names.get(e.name)!, at + 4);
        out.writeUInt16LE(e.type === ITEM_TYPE ? (e.most ?? 0) : (e.rarity ?? 0), at + 6);
      }
    }),
  );
  for (const [name, at] of names) out.write(name, at, "latin1");
  return out;
}
