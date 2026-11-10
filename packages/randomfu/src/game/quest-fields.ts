/**
 * Quest header fields and lists the supply, terms and delivery shuffles
 * edit, with where they are in a `.mib` payload. Layout from `quest.hexpat`
 * (vendor/mhp2g-patterns, MIT) and `mhfu-extract`'s quest parser; what the
 * EU disc shows about each is noted where it's used.
 */
import type { LoadedQuest } from "./load.js";

export const SUPPLIES_PTR = 8;
export const QUEST_TYPE = 76;
export const FEE = 80;
export const REWARD = 84;
export const PENALTY = 88;
export const TIME_LIMIT = 92;
export const STRING_TABLE_PTR = 96;
export const TARGET_ID = 112;
export const TARGET_NUM = 114;

/** Time limits are in ticks: 1800 a minute (50 minutes = 90000). */
export const TICKS_PER_MINUTE = 1800;

/**
 * The quest type's first byte (header +76). On the EU disc 2 is a delivery
 * quest (every "Deliver ..." goal, and the gathering quests' "Survive until
 * Time Over or Deliver the Paw Pass Ticket"); 1 is Slay, 4 Hunt, 16
 * Treasure Hunting, 0x81/0x88 elder dragons. On a delivery quest,
 * `TargetID` (+112) is the item to deliver and `TargetNum` (+114) how many;
 * on the others `TargetID` is a monster. The quest script doesn't name the
 * item, so the header is all there is.
 */
export const DELIVERY_TYPE = 2;

/**
 * The monster "Info" items (Lynian Info to Fatalis Info), which unlock
 * guide pages, the Steel, Silver and Golden Eggs (quest rewards elsewhere,
 * but maybe carried objects in Treasure Hunting, so never in a box), then
 * items that only exist inside a quest: supply box items (Map, First-Aid
 * Med, Ration, Portable Spit, Mini Whetstone, Prtbl Shock Trap and the
 * other supply-only tools, Ballista S and Cannon S), carried objects
 * (Wyvern, Herbivore and Carnivore Egg, Sootstone and Quartz Ore,
 * Powderstone) and the Khezu Whelps, then the Paw Pass Ticket and Limited
 * Paw Pass. IDs from the vendored ItemID enum. Supplies keep them unless
 * asked not to and never add them; deliveries never ask for them.
 */
const QUEST_ITEM_RANGES: readonly [number, number][] = [
  [831, 883],
  [927, 928],
];

export function isQuestItem(itemId: number): boolean {
  return QUEST_ITEM_RANGES.some(([lo, hi]) => itemId >= lo && itemId <= hi);
}

export interface DeliveryTarget {
  itemId: number;
  amount: number;
}

/** The item a delivery quest asks for, or null if it isn't one. */
export function deliveryTarget(payload: Buffer): DeliveryTarget | null {
  if (payload.length < 0x80 || payload[QUEST_TYPE] !== DELIVERY_TYPE) return null;
  const itemId = payload.readUInt16LE(TARGET_ID);
  const amount = payload.readUInt16LE(TARGET_NUM);
  return itemId > 0 && amount > 0 ? { itemId, amount } : null;
}

export interface SupplySlot {
  /** Payload offset of the `{ u16 item, u16 amount }` entry. */
  offset: number;
  itemId: number;
  amount: number;
}

/**
 * The supply box: `{ u16 item, u16 amount }` entries at `SuppliesPTR` up to
 * an item of 0, whose amount field holds the quest's own ID. On the EU disc
 * every quest has exactly one such list, followed straight away by its
 * gathering item tables; no other pointer leads into it. `SupplyCond`
 * (header +70: 0, 1 on most High Rank Village quests, 2 on some "Survive
 * until Time Over" hunts) is a flag on the quest, not a second list, so
 * entries are edited in place and the flag is left as it is: whatever part
 * of the list the game hands out later, each slot keeps its position.
 */
export function readSupplySlots(payload: Buffer): SupplySlot[] {
  const ptr = payload.readUInt32LE(SUPPLIES_PTR);
  const out: SupplySlot[] = [];
  if (ptr < 0x80) return out;
  for (let at = ptr; at + 4 <= payload.length; at += 4) {
    const itemId = payload.readUInt16LE(at);
    if (itemId === 0) break;
    out.push({ offset: at, itemId, amount: payload.readUInt16LE(at + 2) });
  }
  return out;
}

export interface QuestTerms {
  fee: number;
  reward: number;
  penalty: number;
  /** In ticks (`TICKS_PER_MINUTE`). */
  timeLimit: number;
}

/** `base`: where the header is, 0 in a quest file (a board record's is `recordBase`). */
export function readTerms(payload: Buffer, base = 0): QuestTerms {
  return {
    fee: payload.readUInt32LE(base + FEE),
    reward: payload.readUInt32LE(base + REWARD),
    penalty: payload.readUInt32LE(base + PENALTY),
    timeLimit: payload.readUInt32LE(base + TIME_LIMIT),
  };
}

export function writeTerms(payload: Buffer, terms: QuestTerms, base = 0): void {
  payload.writeUInt32LE(terms.fee, base + FEE);
  payload.writeUInt32LE(terms.reward, base + REWARD);
  payload.writeUInt32LE(terms.penalty, base + PENALTY);
  payload.writeUInt32LE(terms.timeLimit, base + TIME_LIMIT);
}

export function sameTerms(a: QuestTerms, b: QuestTerms): boolean {
  return (
    a.fee === b.fee &&
    a.reward === b.reward &&
    a.penalty === b.penalty &&
    a.timeLimit === b.timeLimit
  );
}

/** Language slots in `LangPTRs`: three English, German, French, Spanish, Italian. */
const LANGUAGE_SLOTS = 7;
const GOAL_FIELD = 4;

const alignUp = (n: number) => (n + 3) & ~3;

/**
 * Points every language's goal line at `text`. Strings sit on 4-byte
 * boundaries with zero padding up to the next one, so a string's room is
 * its length plus that padding. `text` goes into every goal string it fits
 * in; a language whose own goal is too short is pointed at one that held
 * it. A goal string another field also points at is left alone (that
 * field keeps its text) and its languages are pointed at a holder too.
 * Item names are English only (the disc's other languages' names
 * aren't read), so every language gets the English line. Returns false,
 * changing nothing, if `text` fits in no goal string or the table doesn't
 * read.
 */
export function rewriteGoal(payload: Buffer, text: string): boolean {
  const fits = (offset: number, size: number) => offset >= 0x80 && offset + size <= payload.length;
  const table = payload.readUInt32LE(STRING_TABLE_PTR);
  if (!fits(table, LANGUAGE_SLOTS * 4)) return false;
  const bytes = Buffer.from(text, "utf8");

  const blocks: number[] = [];
  for (let i = 0; i < LANGUAGE_SLOTS; i++) {
    const block = payload.readUInt32LE(table + i * 4);
    if (block === 0) continue;
    if (!fits(block, 24)) return false;
    if (!blocks.includes(block)) blocks.push(block);
  }
  // Every string any language points at, so no goal grows into another.
  const fields = blocks.flatMap((block) =>
    Array.from({ length: 6 }, (_, k) => ({ k, at: payload.readUInt32LE(block + k * 4) })),
  );
  const strings = fields.map((f) => f.at);
  // Strings a title, condition or other non-goal field shows.
  const shown = new Set(fields.filter((f) => f.k * 4 !== GOAL_FIELD).map((f) => f.at));
  const room = new Map<number, number>();
  for (const block of blocks) {
    const goal = payload.readUInt32LE(block + GOAL_FIELD);
    if (room.has(goal)) continue;
    if (shown.has(goal)) {
      room.set(goal, -1);
      continue;
    }
    if (!fits(goal, 1)) return false;
    const end = payload.indexOf(0, goal);
    if (end === -1) return false;
    let limit = Math.min(alignUp(end + 1), payload.length);
    for (const s of strings) if (s > goal && s < limit) limit = s;
    if (payload.subarray(end, limit).some((b) => b !== 0)) limit = end + 1;
    room.set(goal, Math.max(limit, end + 1) - goal - 1);
  }
  const holders = [...room].filter(([, size]) => size >= bytes.length).map(([goal]) => goal);
  if (blocks.length === 0 || holders.length === 0) return false;

  for (const goal of holders) {
    payload.fill(0, goal, goal + room.get(goal)! + 1);
    bytes.copy(payload, goal);
  }
  for (const block of blocks) {
    const goal = payload.readUInt32LE(block + GOAL_FIELD);
    if (!holders.includes(goal)) payload.writeUInt32LE(holders[0]!, block + GOAL_FIELD);
  }
  return true;
}

/** The goal line a delivery quest gets: the item list's "Name xN" style, so no plurals. */
export function deliveryGoal(name: string, amount: number): string {
  return `Deliver ${name} x${amount}`;
}

/** Quests by the item their delivery asks for, from the unedited payloads. */
export function deliveryTargets(quests: readonly LoadedQuest[]): Map<number, DeliveryTarget> {
  const out = new Map<number, DeliveryTarget>();
  for (const quest of quests) {
    const target = deliveryTarget(quest.file.payload);
    if (target) out.set(quest.index, target);
  }
  return out;
}
