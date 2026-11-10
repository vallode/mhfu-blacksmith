/**
 * Delivery quests' targets: the item (header `TargetID`) and amount
 * (`TargetNum`) a Village or Guild delivery quest asks for.
 *
 * What makes this safe to change:
 * - The new item is one the quest's own gathering points give, as they are
 *   after the gathering shuffle, so it's always there to find. Fishing and
 *   carves aren't read, so they're never asked for (a fishing or carving
 *   delivery becomes a gathering one).
 * - Never a quest-only item (eggs and other carried objects, Paw Pass
 *   Tickets, supplies) and never something the quest's supply box hands
 *   out. The "Survive until Time Over or Deliver the Paw Pass Ticket"
 *   quests, whose ticket is in the supply box, are left alone.
 * - The amount follows how many of the item the quest's nodes give
 *   (`gatheringYields`, counting each node's fewest gathers): it asks for
 *   the same share of that as the quest did of its own item (or the
 *   median share across delivery quests, for one whose item isn't
 *   gathered), and never more than that yield. Items at least half as
 *   plentiful as the old one are picked from, so the quest asks for about
 *   as many (the three most plentiful others, if none are).
 * - The goal line ("Deliver Coal x15") is rewritten in place
 *   (`rewriteGoal`); an item whose line fits nowhere isn't used. The quest
 *   description still names the old item.
 * - The quest board's records (`game/board.ts`) keep their own copy of
 *   `TargetID`, `TargetNum` and the goal line, which the board and the
 *   Quest Details screen show; each gets the same. An item whose goal line
 *   fits in none of a record's isn't used, and a quest whose record can't
 *   be changed safely keeps its item.
 *
 * The gathering shuffle never moves a delivery quest's own item out of its
 * quest (see `randomize.ts`), so with this off every delivery still works.
 */
import type { LoadedQuest } from "../game/load.js";
import {
  boardName,
  questRecords,
  readRecordText,
  recordBase,
  sharesStrings,
  type BoardFile,
  type BoardRecord,
} from "../game/board.js";
import { STRING_FIELDS, writeQuestText } from "../game/quest-text.js";
import { gatheringYields } from "../game/gathering.js";
import {
  deliveryGoal,
  deliveryTarget,
  isQuestItem,
  readSupplySlots,
  rewriteGoal,
  TARGET_ID,
  TARGET_NUM,
  type DeliveryTarget,
} from "../game/quest-fields.js";
import { questTier } from "../game/tiers.js";
import type { Edits } from "../edits.js";
import { itemName, questLabel, tableName } from "../names.js";
import type { Rng } from "../rng.js";
import { median, type ShuffleReport } from "./shuffle.js";

export interface DeliveryQuest {
  quest: LoadedQuest;
  target: DeliveryTarget;
}

/** Village and Guild delivery quests whose item isn't in their own supply box. */
export function collectDeliveries(quests: readonly LoadedQuest[]): DeliveryQuest[] {
  const out: DeliveryQuest[] = [];
  for (const quest of quests) {
    if (!questTier(quest.parsed)) continue;
    const target = deliveryTarget(quest.file.payload);
    if (!target) continue;
    if (readSupplySlots(quest.file.payload).some((s) => s.itemId === target.itemId)) continue;
    out.push({ quest, target });
  }
  return out;
}

const GOAL = STRING_FIELDS.indexOf("goal");

/**
 * The quest's board files with its records' target and goal line changed,
 * as copies (nothing is written), or why a record can't take them.
 */
function changeBoard(
  edits: Edits,
  records: readonly { board: BoardFile; record: BoardRecord }[],
  was: DeliveryTarget,
  next: DeliveryTarget,
  goal: string,
): { files: Map<BoardFile, Buffer> } | { problem: string } {
  const files = new Map<BoardFile, Buffer>();
  for (const { board, record } of records) {
    const data = files.get(board) ?? Buffer.from(edits.dataFileNow(board.index));
    files.set(board, data);
    const where = `its board record (${boardName(board)})`;
    const base = recordBase(record);
    if (
      data.readUInt16LE(base + TARGET_ID) !== was.itemId ||
      data.readUInt16LE(base + TARGET_NUM) !== was.amount
    ) {
      return { problem: `${where} has a different target from the quest's` };
    }
    if (sharesStrings(data, board, record)) {
      return { problem: `${where} shares its text's bytes with another quest's` };
    }
    const text = readRecordText(data, record);
    const goals = new Map<number, string>();
    for (const block of text.blocks) {
      if (block.pointers[GOAL]) goals.set(block.pointers[GOAL], goal);
    }
    const shown = text.blocks.flatMap((b) => b.pointers.filter((_, i) => i !== GOAL));
    if (goals.size === 0 || shown.some((ptr) => goals.has(ptr))) {
      return { problem: `${where} has no goal line of its own` };
    }
    if (!writeQuestText(data, text, goals)) {
      return { problem: `${where} has no room for the goal line` };
    }
    data.writeUInt16LE(next.itemId, base + TARGET_ID);
    data.writeUInt16LE(next.amount, base + TARGET_NUM);
  }
  return { files };
}

/** Without a single gathering delivery on the disc to learn from. */
const DEFAULT_SHARE = 0.5;
/** An item needs about this many from the quest's nodes to be asked for. */
const MIN_YIELD = 1;
const MAX_AMOUNT = 99;
/** How much less plentiful than the old item a new one may be. */
const PLENTY = 2;
const FALLBACK_CANDIDATES = 3;

export function shuffleDeliveries(
  deliveries: readonly DeliveryQuest[],
  rng: Rng,
  edits: Edits,
  boards: readonly BoardFile[] = [],
): ShuffleReport {
  // How much of what its nodes give each quest asks for, from the disc as it was.
  const share = new Map<number, number>();
  for (const { quest, target } of deliveries) {
    const found = gatheringYields(quest.file.payload, quest.parsed).get(target.itemId);
    if (found) share.set(quest.index, target.amount / found);
  }
  const usualShare = share.size > 0 ? median([...share.values()]) : DEFAULT_SHARE;

  const lines: { where: string; text: string }[] = [];
  let changed = 0;
  for (const { quest, target } of deliveries) {
    const now = edits.questNow(quest);
    const supplied = new Set(readSupplySlots(now).map((s) => s.itemId));
    const questShare = share.get(quest.index) ?? usualShare;
    const usable = [...gatheringYields(now, quest.parsed)]
      .filter(
        ([item, found]) =>
          found >= MIN_YIELD &&
          !isQuestItem(item) &&
          !supplied.has(item) &&
          tableName("ItemID", item) !== null,
      )
      .sort(([a], [b]) => a - b);
    // Another item about as plentiful as the old one (within a factor of
    // two), so the quest asks for about as many; else the most plentiful
    // others. The old item goes last, as a fallback.
    const before = target.amount / questShare;
    const others = usable.filter(([item]) => item !== target.itemId);
    const plentiful = others.filter(([, found]) => found >= before / PLENTY);
    const candidates = [
      ...rng.shuffle(
        plentiful.length > 0
          ? plentiful
          : [...others].sort(([, a], [, b]) => b - a).slice(0, FALLBACK_CANDIDATES),
      ),
      ...usable.filter(([item]) => item === target.itemId),
    ];
    const was = `${itemName(target.itemId)} x${target.amount}`;
    const records = questRecords(boards, quest.parsed.header.questId);
    let done = false;
    let problem =
      "none of the items its gathering points give can stand in (or its goal line has no room)";
    for (const [item, found] of candidates) {
      const wanted = Math.round(questShare * found);
      const amount = Math.max(1, Math.min(wanted, Math.floor(found), MAX_AMOUNT));
      const goal = deliveryGoal(itemName(item), amount);
      const board = changeBoard(edits, records, target, { itemId: item, amount }, goal);
      if ("problem" in board) {
        problem = board.problem;
        continue;
      }
      // rewriteGoal changes nothing when the line fits nowhere.
      if (!rewriteGoal(edits.quest(quest), goal)) continue;
      for (const [file, data] of board.files) data.copy(edits.dataFile(file.index));
      const payload = edits.quest(quest);
      payload.writeUInt16LE(item, TARGET_ID);
      payload.writeUInt16LE(amount, TARGET_NUM);
      lines.push({
        where: questLabel(quest),
        text: `${itemName(item)} x${amount} (was ${was}; about ${Math.floor(found)} from its gathering points)`,
      });
      changed++;
      done = true;
      break;
    }
    if (!done) {
      lines.push({
        where: questLabel(quest),
        text: `${was}, unchanged: ${problem}`,
      });
    }
  }
  return {
    title: "Delivery quests",
    notes: [
      "Each Village and Guild delivery quest asks for an item its own gathering points give (after the gathering shuffle), never a quest-only item or one in its supply box.",
      `The amount asks for the same share of what the quest's gathering points give as before (${Math.round(usualShare * 100)}% for quests whose item was fished or carved), at most that many.`,
      "The goal line is rewritten in English for every language; the quest description still names the old item.",
      boards.length > 0
        ? "The quest board's copies (level*.mib) of the item, amount and goal line, which the board and Quest Details screen show, change with them."
        : "No quest board file (level*.mib) could be read, so the board and Quest Details screen show the old item and goal.",
      "Paw Pass Ticket quests, Training School and Treasure Hunting are unchanged.",
      `${changed} of ${deliveries.length} delivery quests changed.`,
    ],
    lines,
  };
}
