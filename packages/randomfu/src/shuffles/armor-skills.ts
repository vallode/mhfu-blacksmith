/**
 * Armor skills: the skill points on each armor piece.
 *
 * An `ArmorValue` (mhfu-extract's `tables/armor.ts`) has five skill entries
 * at +30, each a skill tree ID (u8) and points (s8). Tree 0 is an empty
 * entry. On the EU disc, 108 pieces have an empty entry between filled
 * ones, so the game reads all five; an entry's position doesn't matter, and
 * empty entries stay empty here. No piece lists a tree twice, and neither
 * mode makes one that does.
 *
 * Two modes:
 *
 * - **shuffle**: filled entries (tree and points together) trade places
 *   between pieces of the same rarity and hunter type (Blademaster only,
 *   Gunner only or both), positive with positive and negative with
 *   negative. Every piece keeps how many skills it has and how many are
 *   negative; every rarity keeps its skill points, so the game has the same
 *   skills, on other pieces.
 * - **randomize**: each filled entry gets a new tree and new points. The
 *   tree is drawn from the trees the disc's armor and decorations use, for
 *   that hunter type (below), never one the piece already has. The points
 *   keep the entry's sign; their size is drawn from the sizes entries of
 *   that sign have at that rarity on the disc, so a rarity's pieces stay as
 *   strong as before on average.
 *
 * A tree's hunter type comes from the disc: one found on Blademaster-only
 * pieces and never on Gunner-only ones (Sharpness, Guard) is a Blademaster
 * tree, and the other way round (Reload, Recoil); the rest suit anyone.
 * Randomize gives Blademaster-only pieces anyone's trees and Blademaster
 * trees, Gunner-only pieces likewise, and pieces both can wear only trees
 * that suit anyone. Shuffle keeps entries within a hunter type, so this
 * holds as it did on the disc.
 *
 * Left alone: piece 0, pieces no create entry makes, pieces with no
 * `HunterType` bits, and Torso Up (tree 1, `TORSO_UP`) entries, which
 * double the chest's points instead of being a skill; it's never drawn
 * either. With `keepArmorOnly`, so are trees no decoration adds points to
 * (seven on the EU disc, Edgemaster and Fury among them): armor is their
 * only source, usually one set's pieces together. Shuffled on the EU disc,
 * six of the seven fell below +10 from armor alone.
 *
 * The activation thresholds (10 points for a skill, -10 for a bad one) are
 * not read: mhfu-extract has no table for them and none was found in the
 * EBOOT, and neither mode needs them.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { HUNTER_TYPE_BITS } from "mhfu-extract/src/emit/armor.js";
import {
  ARMOR_SLOT_COUNTS,
  ARMOR_SLOTS,
  armorValuesOffsets,
  type ArmorSlot,
} from "mhfu-extract/src/tables/armor.js";
import { readDecorationSkills } from "mhfu-extract/src/tables/decorations.js";
import { ARMOR_ENTRY_SIZE, EQUIP_CREATE_ENTRY_SIZE } from "mhfu-extract/src/tables/offsets.js";
import { equipmentCreateLayout } from "mhfu-extract/src/tables/recipes.js";
import type { TableAddressResolver } from "mhfu-extract/src/tables/resolver.js";
import type { Edits } from "../edits.js";
import { tableName } from "../names.js";
import type { Rng } from "../rng.js";
import type { ShuffleReport } from "./shuffle.js";
import { SLOT_NAMES } from "./armor.js";

export type ArmorSkillMode = "shuffle" | "randomize";

const HUNTER_TYPE_AT = 4;
const RARITY_AT = 5;
const SKILLS_AT = 30;
const SKILL_COUNT = 5;
/** `SkillID` 1, "Torso Inc": doubles the chest's points. */
export const TORSO_UP = 1;
/** How many times shuffle starts over when it can't avoid a piece listing a tree twice. */
const SHUFFLE_ATTEMPTS = 20;

type HunterClass = "blade" | "gun" | "both";

interface Skill {
  tree: number;
  points: number;
}

interface Piece {
  slot: ArmorSlot;
  index: number;
  /** File offset of the `ArmorValue`. */
  at: number;
  rarity: number;
  hunter: HunterClass;
  /** The five entries as on the disc. */
  before: Skill[];
}

/** An entry that takes part: a filled entry that isn't Torso Up. */
interface Entry {
  piece: Piece;
  /** Position in the piece's five entries. */
  position: number;
  skill: Skill;
}

function hunterClass(bits: number): HunterClass | null {
  const { male, female, blademaster, gunner } = HUNTER_TYPE_BITS;
  if (!(bits & (male | female))) return null;
  const blade = (bits & blademaster) !== 0;
  const gun = (bits & gunner) !== 0;
  if (blade && gun) return "both";
  if (blade) return "blade";
  return gun ? "gun" : null;
}

function treeName(tree: number): string {
  return tableName("SkillID", tree) ?? `Skill ${tree}`;
}

function formatSkills(skills: Skill[]): string {
  const filled = skills.filter((s) => s.tree !== 0);
  if (filled.length === 0) return "none";
  return filled.map((s) => `${treeName(s.tree)} ${s.points > 0 ? "+" : ""}${s.points}`).join(", ");
}

/** Every piece the smithy makes, with its skills. */
function readPieces(eboot: Buffer, resolver: TableAddressResolver | undefined): Piece[] {
  const reader = new BinaryReader(eboot);
  const create = equipmentCreateLayout(reader, resolver);
  const values = armorValuesOffsets(reader, resolver);
  const pieces: Piece[] = [];
  for (const slot of ARMOR_SLOTS) {
    const { offset, count } = create[slot];
    const made = new Set<number>();
    for (let i = 0; i < count; i++) made.add(reader.u16(offset + i * EQUIP_CREATE_ENTRY_SIZE + 2));
    for (const index of [...made].sort((a, b) => a - b)) {
      if (index <= 0 || index >= ARMOR_SLOT_COUNTS[slot]) continue;
      const at = values[slot] + index * ARMOR_ENTRY_SIZE;
      const hunter = hunterClass(reader.u8(at + HUNTER_TYPE_AT));
      if (!hunter) continue;
      const before = Array.from({ length: SKILL_COUNT }, (_, k) => ({
        tree: reader.u8(at + SKILLS_AT + k * 2),
        points: reader.s8(at + SKILLS_AT + k * 2 + 1),
      }));
      pieces.push({ slot, index, at, rarity: reader.u8(at + RARITY_AT), hunter, before });
    }
  }
  return pieces;
}

/** Filled entries whose tree isn't one that stays put. */
function movable(pieces: Piece[], kept: Set<number>): Entry[] {
  return pieces.flatMap((piece) =>
    piece.before.flatMap((skill, position) =>
      skill.tree !== 0 && !kept.has(skill.tree) && skill.points !== 0
        ? [{ piece, position, skill }]
        : [],
    ),
  );
}

const sign = (points: number) => (points < 0 ? "-" : "+");

/**
 * Shuffle: entries trade within (rarity, hunter type, sign). Returns each
 * entry's new skill, or null if no shuffle avoided a repeated tree.
 */
function shuffleEntries(entries: Entry[], kept: Set<number>, rng: Rng): Skill[] | null {
  const groups = new Map<string, number[]>();
  entries.forEach((e, i) => {
    const key = `${e.piece.rarity}:${e.piece.hunter}:${sign(e.skill.points)}`;
    const list = groups.get(key);
    if (list) list.push(i);
    else groups.set(key, [i]);
  });
  const groupOf = new Map<number, number[]>();
  for (const members of groups.values()) for (const i of members) groupOf.set(i, members);
  const onPiece = new Map<Piece, number[]>();
  entries.forEach((e, i) => {
    const list = onPiece.get(e.piece);
    if (list) list.push(i);
    else onPiece.set(e.piece, [i]);
  });

  for (let attempt = 0; attempt < SHUFFLE_ATTEMPTS; attempt++) {
    const now = new Array<Skill>(entries.length);
    for (const members of groups.values()) {
      const skills = rng.shuffle(members.map((i) => entries[i]!.skill));
      members.forEach((i, k) => (now[i] = skills[k]!));
    }
    // Trees on entry `i`'s piece besides its own, the kept ones included.
    const others = (i: number) => {
      const piece = entries[i]!.piece;
      return [
        ...piece.before.filter((s) => kept.has(s.tree)).map((s) => s.tree),
        ...onPiece
          .get(piece)!
          .filter((j) => j !== i)
          .map((j) => now[j]!.tree),
      ];
    };
    const repeats = (i: number) => others(i).includes(now[i]!.tree);

    // Swap each repeated entry with another in its group where neither piece then repeats.
    for (let i = 0; i < entries.length; i++) {
      if (!repeats(i)) continue;
      const candidates = rng.shuffle(
        groupOf.get(i)!.filter((j) => entries[j]!.piece !== entries[i]!.piece),
      );
      for (const j of candidates) {
        if (others(i).includes(now[j]!.tree) || others(j).includes(now[i]!.tree)) continue;
        [now[i], now[j]] = [now[j]!, now[i]!];
        break;
      }
    }
    if (entries.every((_, i) => !repeats(i))) return now;
  }
  return null;
}

/** Each tree's hunter type, from the pieces the disc puts it on. */
function treeClasses(
  pieces: Piece[],
  decorationTrees: Set<number>,
  kept: Set<number>,
): Map<number, HunterClass> {
  const on = new Map<number, Set<HunterClass>>();
  for (const piece of pieces) {
    for (const s of piece.before) {
      if (s.tree === 0 || kept.has(s.tree)) continue;
      let set = on.get(s.tree);
      if (!set) on.set(s.tree, (set = new Set()));
      set.add(piece.hunter);
    }
  }
  const out = new Map<number, HunterClass>();
  for (const [tree, set] of on) {
    if (set.has("blade") && !set.has("gun")) out.set(tree, "blade");
    else if (set.has("gun") && !set.has("blade")) out.set(tree, "gun");
    else out.set(tree, "both");
  }
  for (const tree of decorationTrees) {
    if (!kept.has(tree) && !out.has(tree)) out.set(tree, "both");
  }
  return out;
}

/** Randomize: a new tree for each entry from its hunter type's pool, and new points. */
function randomizeEntries(
  entries: Entry[],
  pieces: Piece[],
  classes: Map<number, HunterClass>,
  rng: Rng,
): Skill[] {
  const trees = [...classes.keys()].sort((a, b) => a - b);
  const pools: Record<HunterClass, number[]> = {
    blade: trees.filter((t) => classes.get(t) !== "gun"),
    gun: trees.filter((t) => classes.get(t) !== "blade"),
    both: trees.filter((t) => classes.get(t) === "both"),
  };
  // Sizes of points by rarity and sign; all rarities as a fallback.
  const sizes = new Map<string, number[]>();
  const addSize = (key: string, size: number) => {
    const list = sizes.get(key);
    if (list) list.push(size);
    else sizes.set(key, [size]);
  };
  for (const e of entries) {
    addSize(`${e.piece.rarity}:${sign(e.skill.points)}`, Math.abs(e.skill.points));
    addSize(`*:${sign(e.skill.points)}`, Math.abs(e.skill.points));
  }

  const now = new Array<Skill>(entries.length);
  const byPiece = new Map<Piece, number[]>();
  entries.forEach((e, i) => {
    const list = byPiece.get(e.piece);
    if (list) list.push(i);
    else byPiece.set(e.piece, [i]);
  });
  for (const piece of pieces) {
    const members = byPiece.get(piece);
    if (!members) continue;
    // Without repeats; pools never hold the kept trees.
    const drawn = rng.shuffle([...pools[piece.hunter]]).slice(0, members.length);
    if (drawn.length < members.length) {
      throw new Error(`Too few skill trees for ${piece.slot} ${piece.index}`);
    }
    members.forEach((i, k) => {
      const s = sign(entries[i]!.skill.points);
      const list = sizes.get(`${piece.rarity}:${s}`) ?? sizes.get(`*:${s}`)!;
      const size = list[rng.int(list.length)]!;
      now[i] = { tree: drawn[k]!, points: s === "-" ? -size : size };
    });
  }
  return now;
}

/**
 * The most points of `tree` armor alone gives one hunter: the best piece
 * per slot, for whichever of Blademaster and Gunner gets more.
 */
function bestFromArmor(pieces: Piece[], skillsOf: (p: Piece) => Skill[], tree: number): number {
  let best = 0;
  for (const hunter of ["blade", "gun"] as const) {
    let total = 0;
    for (const slot of ARMOR_SLOTS) {
      let most = 0;
      for (const piece of pieces) {
        if (piece.slot !== slot || (piece.hunter !== hunter && piece.hunter !== "both")) continue;
        for (const s of skillsOf(piece)) if (s.tree === tree) most = Math.max(most, s.points);
      }
      total += most;
    }
    best = Math.max(best, total);
  }
  return best;
}

export interface ArmorSkillOptions {
  mode: ArmorSkillMode;
  /** Trees no decoration has stay on their pieces and aren't drawn. */
  keepArmorOnly: boolean;
}

export function randomizeArmorSkills(
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
  { mode, keepArmorOnly }: ArmorSkillOptions,
  rng: Rng,
  edits: Edits,
): ShuffleReport {
  const pieces = readPieces(eboot, resolver);
  const decorationTrees = new Set(
    readDecorationSkills(new BinaryReader(eboot), resolver).flatMap((d) =>
      d.skills.filter((s) => s.skill !== 0 && s.amount > 0).map((s) => s.skill),
    ),
  );
  const armorTrees = new Set(pieces.flatMap((p) => p.before.map((s) => s.tree)));
  const armorOnly = [...armorTrees]
    .filter((t) => t !== 0 && t !== TORSO_UP && !decorationTrees.has(t))
    .sort((a, b) => a - b);
  const kept = new Set([TORSO_UP, ...(keepArmorOnly ? armorOnly : [])]);
  const entries = movable(pieces, kept);

  let assigned: Skill[];
  const notes: string[] = [];
  if (mode === "shuffle") {
    const shuffled = shuffleEntries(entries, kept, rng);
    if (!shuffled)
      notes.push("No shuffle avoided a piece listing a skill tree twice, so skills are unchanged.");
    assigned = shuffled ?? entries.map((e) => e.skill);
  } else {
    assigned = randomizeEntries(entries, pieces, treeClasses(pieces, decorationTrees, kept), rng);
  }

  const after = new Map<Piece, Skill[]>(pieces.map((p) => [p, p.before.map((s) => ({ ...s }))]));
  entries.forEach((e, i) => (after.get(e.piece)![e.position] = assigned[i]!));

  const out = edits.eboot();
  const lines: { where: string; text: string; order: number }[] = [];
  let changed = 0;
  for (const piece of pieces) {
    const skills = after.get(piece)!;
    skills.forEach((s, k) => {
      out.writeUInt8(s.tree, piece.at + SKILLS_AT + k * 2);
      out.writeInt8(s.points, piece.at + SKILLS_AT + k * 2 + 1);
    });
    if (formatSkills(skills) === formatSkills(piece.before)) continue;
    changed++;
    const { table, label } = SLOT_NAMES[piece.slot];
    lines.push({
      where: `${label}, rarity ${piece.rarity + 1}`,
      text: `${tableName(table, piece.index) ?? `${label} ${piece.index}`}: ${formatSkills(skills)} (was ${formatSkills(piece.before)})`,
      order: ARMOR_SLOTS.indexOf(piece.slot) * 256 + piece.rarity,
    });
  }

  // Trees no decoration has can only come from armor: how far armor alone gets them.
  const reach = armorOnly.map((t) => {
    const was = bestFromArmor(pieces, (p) => p.before, t);
    const now = bestFromArmor(pieces, (p) => after.get(p)!, t);
    return now === was ? `${treeName(t)} +${now}` : `${treeName(t)} +${now} (was +${was})`;
  });

  return {
    title: "Armor skills",
    notes: [
      mode === "shuffle"
        ? "Skill points traded places between pieces of the same rarity and hunter type (Blademaster, Gunner or both): positive with positive, negative with negative. Every rarity has the same skill points as before."
        : "Each skill on a piece is a new skill tree (for that piece's hunter type) with new points: positive skills stay positive and negative ones negative, sized like that rarity's skills on the disc.",
      `Pieces keep how many skills they have. Torso Up${keepArmorOnly ? " and skill trees no decoration has stay" : " stays"} where ${keepArmorOnly ? "they are" : "it is"}. Decorations are unchanged.`,
      ...notes,
      ...(reach.length > 0
        ? [
            `Skill trees no decoration has, and the most points armor alone gives (one piece per slot): ${reach.join(", ")}.`,
          ]
        : []),
      `${changed} of ${pieces.length} pieces have new skills.`,
    ],
    lines: lines.sort((a, b) => a.order - b.order).map(({ where, text }) => ({ where, text })),
  };
}
