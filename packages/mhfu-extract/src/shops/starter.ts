/**
 * A new hunter's equipment: what character creation puts in the equipment
 * box.
 *
 * It isn't a table. `overlay/edit_task.ovl` calls an EBOOT routine, "add to
 * the equipment box" (EU `0x08850724`, JP `0x08850668`), once per piece with
 * constants:
 *
 *     lui   $v0, hi(save)
 *     lw    $a0, lo(save)($v0)
 *     addiu $a1, $zero, category     (or `addu $a1, $zero, $zero` for 0)
 *     addiu $a2, $zero, id
 *     jal   add_to_box
 *     addu  $a3, $zero, $zero
 *
 * The categories are the smithy store's (`equipment.ts`): 0-4 armor (leg,
 * head, chest, arm, waist), 5 a Blademaster weapon, 6 a Gunner one. On the
 * EU and JP (FUC) discs there are 20 calls, in three runs:
 *
 * - A new hunter: Bone Kris, which is then worn (its box slot goes to an
 *   equip routine), and Bone Blade, Bone, Longhorn, Bone Gunlance, Bone
 *   Scythe, Bone Club, Ivory Horn, Shooter's Barrel, Bone Shooter, Hunter's
 *   Bow I and the Mafumofu Hood. Those weapons are the ones the smithy's
 *   first create entries make. Another run gives the rest of the Mafumofu
 *   set (chest, arms, waist, legs), each worn.
 * - A third run gives the same four Mafumofu pieces, not worn, behind a
 *   save flag (2) that it then sets, so a save gets them once.
 *
 * A piece is worn when the call's result (its box slot) goes straight to
 * another routine: `andi $a1, $v0, 0xffff` then a `jal` right after it.
 *
 * The ID is the immediate of the `addiu $a2`: the low halfword of that
 * instruction word, sign-extended, so an ID must stay below 0x8000.
 *
 * A call only counts when its arguments are set in the few words before it
 * with no jump, branch or call in between (a call clobbers argument
 * registers), and no branch elsewhere lands between a setter and the call
 * (that path would skip it).
 */
import type { OvlFile } from "../container/ovl.js";
import { CATEGORY_COUNTS } from "./equipment.js";

export interface StarterEntry {
  /** File offset of the `addiu $a2, $zero, id` word; the ID is the u16 at this offset. */
  at: number;
  category: number;
  id: number;
  /** Whether the hunter starts wearing it. */
  worn: boolean;
}

export interface StarterGear {
  /** The add-to-box routine's address. */
  routine: number;
  entries: StarterEntry[];
}

const REGIMM = 1;
const J = 2;
const JAL = 3;
const A1 = 5;
const A2 = 6;
/** `addu $a3, $zero, $zero`: the call's delay slot. */
const CLEAR_A3 = 0x00003821;
/** `addu $a1, $zero, $zero`. */
const CLEAR_A1 = 0x00002821;
/** `andi $a1, $v0, 0xffff`: the box slot the call returned, passed on to be worn. */
const SLOT_TO_A1 = 0x3045ffff;
/** `addiu $rt, $zero, imm` with `rt` and `imm` zeroed. */
const ADDIU_ZERO = 0x24000000;
/** How many words before the `jal` the arguments may be set. */
const WINDOW = 4;
/** How many words after the delay slot the slot may be passed on to be worn. */
const WORN_WINDOW = 4;

/** Conditional branches: beq, bne, blez, bgtz and their likely forms. */
const isBranchOp = (op: number) =>
  op === REGIMM || (op >= 4 && op <= 7) || (op >= 0x14 && op <= 0x17);

/** True for any jump, branch or call, whose path the argument scan mustn't cross. */
function isControlFlow(word: number): boolean {
  const op = word >>> 26;
  if (op === 0) {
    const fn = word & 0x3f;
    return fn === 0x08 || fn === 0x09; // jr, jalr
  }
  return op === J || op === JAL || isBranchOp(op);
}

/** The register an instruction writes, or null (stores, branches, jumps but `jal`). */
function writes(word: number): number | null {
  const op = word >>> 26;
  if (op === 0) {
    const fn = word & 0x3f;
    // jr, mult/div and the like write no general register.
    return fn === 0x08 || (fn >= 0x18 && fn <= 0x1b) ? null : (word >>> 11) & 31;
  }
  if (op === JAL) return 31;
  if ((op >= 0x08 && op <= 0x0f) || (op >= 0x20 && op <= 0x27)) return (word >>> 16) & 31;
  return null;
}

/** The constant `word` puts in `reg` (`addiu reg, $zero, imm`), or null. */
function constantIn(word: number, reg: number): number | null {
  if (reg === A1 && word === CLEAR_A1) return 0;
  if ((word & 0xffff0000) >>> 0 !== (ADDIU_ZERO | (reg << 16)) >>> 0) return null;
  const imm = word & 0xffff;
  return imm < 0x8000 ? imm : null;
}

/** File offsets that a branch or `j` in the overlay lands on. */
function branchTargets(ovl: OvlFile): Set<number> {
  const r = ovl.reader;
  const targets = new Set<number>();
  for (let at = 0x80; at + 4 <= r.length; at += 4) {
    const word = r.u32(at);
    const op = word >>> 26;
    if (isBranchOp(op)) {
      const imm = (word << 16) >> 16;
      targets.add(at + 4 + imm * 4);
    } else if (op === J) {
      const vaddr = ((ovl.loadBase + at) & 0xf0000000) | ((word & 0x3ffffff) << 2);
      targets.add(ovl.vaddrToOffset(vaddr >>> 0));
    }
  }
  return targets;
}

/** Whether the box slot returned by the call at `at` is passed on to be worn. */
function isWorn(ovl: OvlFile, at: number): boolean {
  const r = ovl.reader;
  for (let p = at + 8; p < at + 8 + WORN_WINDOW * 4 && p + 4 <= r.length; p += 4) {
    if (r.u32(p) !== SLOT_TO_A1) continue;
    for (let q = p + 4; q < p + 4 + WORN_WINDOW * 4 && q + 4 <= r.length; q += 4) {
      if (r.u32(q) >>> 26 === JAL) return true;
      if (writes(r.u32(q)) === A1) return false;
    }
    return false;
  }
  return false;
}

/** The (category, ID) a call at `at` passes, or null if they aren't both constants. */
function callArguments(ovl: OvlFile, at: number, targets: Set<number>): StarterEntry | null {
  const r = ovl.reader;
  let category: number | null = null;
  let categoryAt = at;
  let idAt: number | null = null;
  // Walk back from the call: the first word that writes $a1 (or $a2) must set it.
  for (let k = 1; k <= WINDOW && at - k * 4 >= 0x80; k++) {
    const p = at - k * 4;
    const word = r.u32(p);
    if (category !== null && idAt !== null) break;
    if (isControlFlow(word)) return null;
    const reg = writes(word);
    if (reg === A1 && category === null) {
      category = constantIn(word, A1);
      if (category === null) return null;
      categoryAt = p;
    } else if (reg === A2 && idAt === null) {
      if (constantIn(word, A2) === null) return null;
      idAt = p;
    }
  }
  if (category === null || idAt === null) return null;
  // A path that lands after a setter skips it.
  for (let p = Math.min(categoryAt, idAt) + 4; p <= at; p += 4) if (targets.has(p)) return null;
  const id = r.u16(idAt);
  const limit = CATEGORY_COUNTS[category];
  if (limit === undefined || id === 0 || id >= limit) return null;
  return { at: idAt, category, id, worn: isWorn(ovl, at) };
}

/**
 * Finds the new hunter's equipment in `edit_task.ovl`: the routine called
 * most often with a constant weapon (category 5 or 6) and ID, and every call
 * to it with constant arguments. Null when no call gives a weapon.
 */
export function findStarterGear(ovl: OvlFile): StarterGear | null {
  const r = ovl.reader;
  const targets = branchTargets(ovl);
  const calls = new Map<number, StarterEntry[]>();
  for (let at = 0x80; at + 8 <= r.length; at += 4) {
    const word = r.u32(at);
    if (word >>> 26 !== JAL || r.u32(at + 4) !== CLEAR_A3) continue;
    const entry = callArguments(ovl, at, targets);
    if (!entry) continue;
    const target = ((ovl.loadBase + at) & 0xf0000000) | ((word & 0x3ffffff) << 2);
    const list = calls.get(target) ?? [];
    list.push(entry);
    calls.set(target, list);
  }
  const weapons = (list: StarterEntry[]) =>
    list.filter((e) => e.category === 5 || e.category === 6).length;
  let best: StarterGear | null = null;
  for (const [routine, entries] of calls) {
    if (weapons(entries) > (best ? weapons(best.entries) : 0)) best = { routine, entries };
  }
  return best;
}
