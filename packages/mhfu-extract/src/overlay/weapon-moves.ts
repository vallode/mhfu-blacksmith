/**
 * Each weapon type's attacks as rows of the motion value table
 * (`tables/motion-values.ts`). The disc names none of them, nor says
 * which rows make up one move: this is hand-made (see the JSON's
 * `_comment` for how it was worked out).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface MoveHit {
  /** Row of the motion value table. */
  row: number;
  /** How many times the move deals this hit; 1 when absent. */
  count?: number;
}

export interface WeaponMove {
  /** The move's key; the site names it (its `motionValues.moves` messages). */
  move: string;
  /** A Dual Blades move done only in Demon Mode. */
  demon?: boolean;
  /** The cut hitzone weight the move sets in place of its weapon's (Great Sword charges). */
  cutWeight?: number;
  /** The Lance's charge, whose hits weigh hitzones differently once it runs at full speed. */
  fullSpeed?: boolean;
  hits: MoveHit[];
}

const MOVES_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "weapon-moves.json");

/** Weapon type (the site's slug) to its moves, in the order the site lists them. */
export function weaponMoves(): Record<string, WeaponMove[]> {
  const file = JSON.parse(readFileSync(MOVES_PATH, "utf-8")) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(file).filter(([key]) => !key.startsWith("_"))) as Record<
    string,
    WeaponMove[]
  >;
}
