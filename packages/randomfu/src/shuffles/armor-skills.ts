/**
 * Armor skills: the skill points on each armor piece.
 *
 * An `ArmorValue` (mhfu-extract's `tables/armor.ts`) has five skill entries
 * at +30, each a skill tree ID (u8) and points (s8). Tree 0 is an empty
 * entry. On the EU disc, 108 pieces have an empty entry between filled
 * ones, so the game reads all five; an entry's position doesn't matter, and
 * empty entries stay empty here. Neither mode gives a piece a tree it
 * already lists.
 *
 * Two modes:
 *
 * - **shuffle**: filled entries (tree and points together) trade places
 *   between pieces of the same rarity and hunter type (Blademaster only,
 *   Gunner only or both), positive with positive and negative with
 *   negative. Every piece keeps how many skills it has and how many are
 *   negative; every rarity keeps its skill points, so the game has the same
 *   skills, on other pieces. A group whose shuffles all put a tree twice on
 *   some piece keeps its entries where they were.
 * - **randomize**: each filled entry gets a new tree and new points. The
 *   tree is drawn from the trees the disc's armor and decorations use, for
 *   that hunter type (below), never one the piece already has. The points
 *   keep the entry's sign; their size is drawn from the sizes entries of
 *   that sign have at that rarity on the disc, so a rarity's pieces stay as
 *   strong as before on average.
 *
 * Which pieces a tree suits comes from where the disc puts it (`treeUses`):
 * on Blademaster-only and Gunner-only pieces, anyone; only on Blademaster-
 * only pieces (and pieces both can wear), Blademasters (Sharpness, Guard);
 * likewise Gunners (Reload, Recoil); only on pieces both can wear, only
 * those (Auto-Guard on the EU disc). Trees only decorations have suit
 * anyone. Randomize draws accordingly; shuffle keeps entries within a
 * hunter type, so they stay where the disc had them.
 *
 * Left alone: piece 0, pieces no create entry makes, pieces with no
 * `HunterType` bits, entries with 0 points, and Torso Up (tree 1,
 * `TORSO_UP`) entries, which add the chest's points again instead of being
 * a skill; it's never drawn either. With `keepArmorOnly`, so are trees no
 * decoration adds points to (seven on the EU disc, Edgemaster and Fury
 * among them): armor is their only source, usually one set's pieces
 * together. Shuffled on the EU disc, six of the seven fell below +10 from
 * armor alone.
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
import { SLOT_NAMES, wearable } from "./armor.js";
import { groupBy, permuteWithinGroups, type ShuffleReport } from "./shuffle.js";

export type ArmorSkillMode = "shuffle" | "randomize";

const HUNTER_TYPE_AT = 4;
const RARITY_AT = 5;
const SKILLS_AT = 30;
const SKILL_COUNT = 5;
/** `SkillID` 1, "Torso Inc": the piece adds the chest's points again. */
const TORSO_UP = 1;
/** Shuffles tried before groups that still repeat a tree keep their entries. */
const SHUFFLE_ATTEMPTS = 20;

type HunterClass = "blade" | "gun" | "both";
/** Which pieces a tree suits: anyone's, one hunter type's, or only pieces both can wear. */
type TreeUse = "anyone" | "blade" | "gun" | "both-only";

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
  /** `HunterType` bits. */
  bits: number;
  hunter: HunterClass;
  /** The five entries as on the disc. */
  before: Skill[];
}

/** An entry that takes part: a filled entry with points whose tree isn't kept. */
interface Entry {
  piece: Piece;
  /** Position in the piece's five entries. */
  position: number;
  skill: Skill;
}

function hunterClass(bits: number): HunterClass | null {
  if (!wearable(bits)) return null;
  const blade = (bits & HUNTER_TYPE_BITS.blademaster) !== 0;
  const gun = (bits & HUNTER_TYPE_BITS.gunner) !== 0;
  return blade && gun ? "both" : blade ? "blade" : "gun";
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
      const bits = reader.u8(at + HUNTER_TYPE_AT);
      const hunter = hunterClass(bits);
      if (!hunter) continue;
      const before = Array.from({ length: SKILL_COUNT }, (_, k) => ({
        tree: reader.u8(at + SKILLS_AT + k * 2),
        points: reader.s8(at + SKILLS_AT + k * 2 + 1),
      }));
      pieces.push({ slot, index, at, rarity: reader.u8(at + RARITY_AT), bits, hunter, before });
    }
  }
  return pieces;
}

const takesPart = (skill: Skill, kept: Set<number>) =>
  skill.tree !== 0 && skill.points !== 0 && !kept.has(skill.tree);

const sign = (points: number) => (points < 0 ? "-" : "+");

const groupKey = (e: Entry) => `${e.piece.rarity}:${e.piece.hunter}:${sign(e.skill.points)}`;

/**
 * Shuffle: entries trade within (rarity, hunter type, sign), avoiding a
 * tree twice on a piece. `fixed` is each piece's trees that don't move.
 * Groups that repeat a tree in every attempt keep their entries.
 */
function shuffleEntries(
  entries: Entry[],
  fixed: Map<Piece, number[]>,
  rng: Rng,
): { skills: Skill[]; keptGroups: number } {
  const indices = entries.map((_, i) => i);
  const groups = [...groupBy(indices, (i) => groupKey(entries[i]!)).values()];
  const groupOf = new Map(groups.flatMap((members) => members.map((i) => [i, members] as const)));
  const onPiece = groupBy(indices, (i) => entries[i]!.piece);

  let now: Skill[] = [];
  // Trees on entry `i`'s piece besides its own.
  const others = (i: number) => {
    const piece = entries[i]!.piece;
    return [
      ...fixed.get(piece)!,
      ...onPiece
        .get(piece)!
        .filter((j) => j !== i)
        .map((j) => now[j]!.tree),
    ];
  };
  const repeats = (i: number) => others(i).includes(now[i]!.tree);

  for (let attempt = 0; attempt < SHUFFLE_ATTEMPTS; attempt++) {
    now = permuteWithinGroups(entries, groupKey, (e) => e.skill, rng);
    // Swap each repeated entry with another in its group where neither piece then repeats.
    for (const i of indices) {
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
    if (!indices.some(repeats)) return { skills: now, keptGroups: 0 };
  }

  // Put back each group with a repeat, until none is left in a moved group.
  // The disc's own layout is the fallback, so this ends.
  const putBack = new Set<number[]>();
  for (;;) {
    const group = indices
      .filter(repeats)
      .map((i) => groupOf.get(i)!)
      .find((g) => !putBack.has(g));
    if (!group) break;
    putBack.add(group);
    for (const i of group) now[i] = entries[i]!.skill;
  }
  return { skills: now, keptGroups: putBack.size };
}

/** Which pieces each tree suits, from the pieces the disc puts it on. */
function treeUses(
  pieces: Piece[],
  decorationTrees: Set<number>,
  kept: Set<number>,
): Map<number, TreeUse> {
  const on = new Map<number, Set<HunterClass>>();
  for (const piece of pieces) {
    for (const s of piece.before) {
      if (!takesPart(s, kept)) continue;
      let set = on.get(s.tree);
      if (!set) on.set(s.tree, (set = new Set()));
      set.add(piece.hunter);
    }
  }
  const out = new Map<number, TreeUse>();
  for (const [tree, set] of on) {
    const blade = set.has("blade");
    const gun = set.has("gun");
    out.set(tree, blade && gun ? "anyone" : blade ? "blade" : gun ? "gun" : "both-only");
  }
  for (const tree of decorationTrees) {
    if (!kept.has(tree) && !out.has(tree)) out.set(tree, "anyone");
  }
  return out;
}

/** Randomize: a new tree for each entry from its hunter type's pool, and new points. */
function randomizeEntries(
  entries: Entry[],
  fixed: Map<Piece, number[]>,
  uses: Map<number, TreeUse>,
  rng: Rng,
): Skill[] {
  const trees = [...uses.keys()].sort((a, b) => a - b);
  const suits: Record<HunterClass, TreeUse[]> = {
    blade: ["anyone", "blade"],
    gun: ["anyone", "gun"],
    both: ["anyone", "both-only"],
  };
  const pools = (hunter: HunterClass) => trees.filter((t) => suits[hunter].includes(uses.get(t)!));
  // Sizes of points by rarity and sign; all rarities as a fallback.
  const sizes = new Map<string, number[]>();
  for (const e of entries) {
    const size = Math.abs(e.skill.points);
    for (const key of [`${e.piece.rarity}:${sign(e.skill.points)}`, `*:${sign(e.skill.points)}`]) {
      sizes.set(key, [...(sizes.get(key) ?? []), size]);
    }
  }

  const now = new Array<Skill>(entries.length);
  const byPiece = groupBy(
    entries.map((_, i) => i),
    (i) => entries[i]!.piece,
  );
  for (const [piece, members] of byPiece) {
    // Without repeats, and never a tree the piece keeps.
    const pool = pools(piece.hunter).filter((t) => !fixed.get(piece)!.includes(t));
    const drawn = rng.shuffle(pool).slice(0, members.length);
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
 * The most points of `tree` armor alone gives one hunter (one hunter type
 * and sex): a piece per slot, or none. A Torso Up piece adds the chest's
 * points again, so every chest is tried.
 */
function bestFromArmor(pieces: Piece[], skillsOf: (p: Piece) => Skill[], tree: number): number {
  const { male, female, blademaster, gunner } = HUNTER_TYPE_BITS;
  const pointsOf = (p: Piece) => skillsOf(p).find((s) => s.tree === tree)?.points ?? 0;
  const torso = (p: Piece) => skillsOf(p).some((s) => s.tree === TORSO_UP);
  let best = 0;
  for (const type of [blademaster, gunner]) {
    for (const sex of [male, female]) {
      const fits = pieces.filter((p) => p.bits & type && p.bits & sex);
      const chests = new Set([0, ...fits.filter((p) => p.slot === "chest").map(pointsOf)]);
      for (const chest of chests) {
        let total = chest;
        for (const slot of ARMOR_SLOTS) {
          if (slot === "chest") continue;
          let most = 0;
          for (const p of fits) {
            if (p.slot === slot) most = Math.max(most, pointsOf(p) + (torso(p) ? chest : 0));
          }
          total += most;
        }
        best = Math.max(best, total);
      }
    }
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
  const entries = pieces.flatMap((piece) =>
    piece.before.flatMap((skill, position) =>
      takesPart(skill, kept) ? [{ piece, position, skill }] : [],
    ),
  );
  // Each piece's filled entries that stay: kept trees and entries with 0 points.
  const fixed = new Map(
    pieces.map((p) => [
      p,
      p.before.filter((s) => s.tree !== 0 && !takesPart(s, kept)).map((s) => s.tree),
    ]),
  );

  let assigned: Skill[];
  const notes: string[] = [];
  if (mode === "shuffle") {
    const { skills, keptGroups } = shuffleEntries(entries, fixed, rng);
    if (keptGroups > 0) {
      notes.push(
        `${keptGroups} group(s) of a rarity, hunter type and sign kept their skills: every shuffle put a tree twice on some piece.`,
      );
    }
    assigned = skills;
  } else {
    assigned = randomizeEntries(entries, fixed, treeUses(pieces, decorationTrees, kept), rng);
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
        : "Each skill on a piece is a new skill tree (one that suits who can wear the piece) with new points: positive skills stay positive and negative ones negative, sized like that rarity's skills on the disc.",
      `Pieces keep how many skills they have. Torso Up${keepArmorOnly ? " and skill trees no decoration has stay" : " stays"} where ${keepArmorOnly ? "they are" : "it is"}. Decorations are unchanged.`,
      ...notes,
      ...(reach.length > 0
        ? [
            `Skill trees no decoration has, and the most points armor alone gives one hunter (Torso Up included): ${reach.join(", ")}.`,
          ]
        : []),
      `${changed} of ${pieces.length} pieces have new skills.`,
    ],
    lines: lines.sort((a, b) => a.order - b.order).map(({ where, text }) => ({ where, text })),
  };
}
