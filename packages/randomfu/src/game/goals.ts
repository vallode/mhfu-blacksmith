/**
 * A quest's goals: what the game checks to clear it. Found in the EU EBOOT
 * (ULES01213):
 *
 * - The quest manager (the object at the global `0x08A62C7C`) sets up its
 *   two goals at `+0x728` from the quest file's header (`0x0886E27C`): each
 *   of the two slots at `0x6C` and `0x74`, `{ u32 flags, u16 id, u16
 *   count }`, that isn't 0, and the byte at `0x6A` (how many must be met: 1
 *   the first, 2 both). The first slot's id and count are `TargetID` and
 *   `TargetNum` (`0x70`, `0x72`). The hexpat calls these bytes `Unkn9` to
 *   `Unkn14`.
 * - The two slots at `0x28` and `0x30` that `spawns.ts` calls objectives
 *   (the hexpat's `UnknPTR3` to `Unkn3`) aren't read by that setup: a quest
 *   to slay 15 Blangos has `{ 1, Blango, 9 }` there. What reads them isn't
 *   known.
 * - A kill (`0x0886AF2C`, from the death code: every species' and the
 *   small monster loop) counts a goal with flag 1 (`GOAL_MONSTER`) down for
 *   that emID, but fails the quest if the goal also has 0x100
 *   (`GOAL_CAPTURE`). A capture (`0x0886E5BC`, from 7 places in
 *   `game_task.ovl`) counts any monster goal down. A delivery goal (flag 2)
 *   counts the item in the delivery box. Elder dragons' goals (0x18004)
 *   clear on enough damage instead (a repel).
 * - 0x200 (`GOAL_SLAY`) is on every Slay goal: small monsters and the large
 *   monsters that can't be captured (Kirin, Lao-Shan Lung, Akantor...). No
 *   code was found that reads it.
 *
 * On the disc's Village and Guild quests, flag 1 alone is "Hunt" and is
 * only ever given to large monsters that can be captured, and 0x201 to the
 * rest; no quest has a capture goal (0x101).
 */
import { QUEST_TYPE } from "./quest-fields.js";

/** How many of the goals must be met to clear the quest (u8): 1 the first, 2 both. */
export const GOALS_NEEDED = 0x6a;
/** The two goal slots, `{ u32 flags, u16 id, u16 count }`; the first's id is `TargetID`. */
export const GOAL_OFFSETS = [0x6c, 0x74] as const;
export const GOAL_SIZE = 8;

/** The goal names a monster by emID (kills and captures count it down). */
export const GOAL_MONSTER = 0x1;
/** The goal names an item, delivered. */
export const GOAL_ITEM = 0x2;
/** A kill fails the quest: only captures count. */
export const GOAL_CAPTURE = 0x100;
/** The disc's Slay goals carry it; nothing is known to read it. */
export const GOAL_SLAY = 0x200;

export const HUNT_FLAGS = GOAL_MONSTER;
export const CAPTURE_FLAGS = GOAL_MONSTER | GOAL_CAPTURE;
export const SLAY_FLAGS = GOAL_MONSTER | GOAL_SLAY;

/** The quest type's low byte (`QUEST_TYPE`) for each kind, as the disc pairs them. */
export const TYPE_SLAY = 1;
export const TYPE_HUNT = 4;

export interface Goal {
  flags: number;
  id: number;
  count: number;
}

/** `base`: where the header is, 0 in a quest file (a board record's is `recordBase`). */
export function readGoals(payload: Buffer, base = 0): Goal[] {
  return GOAL_OFFSETS.map((at) => ({
    flags: payload.readUInt32LE(base + at),
    id: payload.readUInt16LE(base + at + 4),
    count: payload.readUInt16LE(base + at + 6),
  }));
}

/** The goals that are set (flags not 0). */
export function setGoals(payload: Buffer, base = 0): Goal[] {
  return readGoals(payload, base).filter((g) => g.flags !== 0);
}

export function writeGoal(payload: Buffer, slot: number, goal: Goal, base = 0): void {
  const at = base + GOAL_OFFSETS[slot]!;
  payload.writeUInt32LE(goal.flags >>> 0, at);
  payload.writeUInt16LE(goal.id, at + 4);
  payload.writeUInt16LE(goal.count, at + 6);
}

/** The emIDs the quest's monster goals name. */
export function goalMonsters(payload: Buffer, base = 0): number[] {
  return setGoals(payload, base)
    .filter((g) => (g.flags & GOAL_MONSTER) !== 0)
    .map((g) => g.id);
}

/** Sets the quest type's low byte (its kind), keeping its flags. */
export function writeQuestKind(payload: Buffer, kind: number, base = 0): void {
  payload[base + QUEST_TYPE] = kind;
}

export const sameGoals = (a: readonly Goal[], b: readonly Goal[]) =>
  a.length === b.length &&
  a.every((g, i) => g.flags === b[i]!.flags && g.id === b[i]!.id && g.count === b[i]!.count);
