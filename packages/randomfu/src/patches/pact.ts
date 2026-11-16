/**
 * Hunter's Pact (`pact.enabled`): when a quest starts, a window offers three
 * pacts drawn at random, each a penalty paired with its reward: more zenny or
 * HRP, luck, items or equipment of the quest's rank. Rewards are paid only if
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
 *   clears it.
 * - The reward roll (EU 0x0886F894) asks `hasSkill(hunter, id)`, which
 *   scans the six skill ids at the hunter's `+0x676`, for 0x90, 0x92, 0x91
 *   and 0x93 in turn: the chance out of 32 that each reward slot past the
 *   guaranteed ones is filled is 26, 16, 29 or 8, and 22 without. It fills
 *   the save's reward box (`+0x390`, 16 slots of item and amount) and sorts
 *   it; the reward screen shows the box.
 * - The equipment box is the save's `+0x548`: 12 bytes a slot, `01`, the
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
import { decodeObjects } from "../blob/link.js";
import { MONSTERS_OBJECTS } from "../blob/monsters-object.js";
import { PACT_OBJECTS } from "../blob/pact-object.js";
import type { HookSites } from "./game-hooks.js";
import { findUnique, hiLo, jumpTarget, maskWord } from "./mips.js";
import { findMonsterExterns } from "./monster-hp.js";
import type { Band, Tier } from "../game/tiers.js";
import { itemName } from "../names.js";
import type { Rng } from "../rng.js";

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

const word = (buf: Buffer, at: number) => buf.readUInt32LE(at);

/** The text externs, or why they can't be found. */
export function findTextExterns(
  vanillaEboot: Buffer,
  sites: HookSites,
): Record<string, number> | string {
  const { segment } = sites;
  const at = (vaddr: number) => word(vanillaEboot, segment.offset + (vaddr - segment.vaddr));
  const [setters, window, fill] = findUnique(vanillaEboot, segment, [
    TEXT_SETTERS.map(maskWord),
    WINDOW_SIGNATURE,
    FILL_SIGNATURE.map(maskWord),
  ]);
  if (setters == null) return "this EBOOT's text code doesn't match";
  if (window == null || fill == null) return "this EBOOT's window code doesn't match";
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
    // `lui v0, hi; jal padRead; lw a0, lo(pad)(v0)`: the pad object's global.
    rf_pad: hiLo(at(sites.pad - 4), at(sites.pad + 4)),
  };
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
/** Items per grade and equipment pieces per rank, at most. */
const ITEMS_PER_GRADE = 16;
const EQUIPMENT_PER_BAND = 32;
/** How many of an item each grade gives. */
export const GRADE_AMOUNTS = [10, 5, 2] as const;
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

export interface PactPoolEntry {
  id: number;
  type: number;
  amount: number;
  name: string;
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
 * The pact's rewards for each rank: items first found at that rank (after the
 * shuffles), in three grades by the star level they're first found at, and
 * equipment of that rank's rarities.
 */
export function pactPool(
  itemTiers: ReadonlyMap<number, Tier>,
  equipment: readonly PoolEquipment[],
  rng: Rng,
): PactPool {
  const { male, female } = HUNTER_TYPE_BITS;
  return POOL_BANDS.map((band) => {
    const items = [...itemTiers]
      .filter(([id, tier]) => id > 0 && tier.band === band && itemName(id) !== `Item ${id}`)
      .sort(([a, x], [b, y]) => x.stars - y.stars || a - b)
      .map(([id]) => id);
    const grades = [0, 1, 2].map((g) => {
      const from = Math.floor((items.length * g) / 3);
      const to = Math.floor((items.length * (g + 1)) / 3);
      return sample(items.slice(from, to), ITEMS_PER_GRADE, rng)
        .sort((a, b) => a - b)
        .map((id) => ({
          id,
          type: ITEM_TYPE,
          amount: GRADE_AMOUNTS[g]!,
          name: ascii(itemName(id)),
        }));
    });
    const gear = equipment.filter(
      (e) =>
        rankFromRarity(displayRarity(e.rarity)) === `${band}-rank` &&
        (e.bits === undefined || ((e.bits & male) !== 0 && (e.bits & female) !== 0)) &&
        ascii(e.name).length > 0,
    );
    const pieces = sample(gear, EQUIPMENT_PER_BAND, rng)
      .sort((a, b) => a.type - b.type || a.id - b.id)
      .map((e) => ({ id: e.id, type: e.type, amount: 1, name: ascii(e.name) }));
    return [...grades, pieces];
  });
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
      }
    }),
  );
  for (const [name, at] of names) out.write(name, at, "latin1");
  return out;
}
