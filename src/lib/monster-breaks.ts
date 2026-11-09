import type { MonsterBreak } from "./types";

const DAMAGE: Record<NonNullable<MonsterBreak["damage"]>, string> = {
  cut: "cutting",
  fire: "fire",
  dragon: "dragon",
};

const SUFFIX: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };

const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? "th" : (SUFFIX[n % 10] ?? "th")}`;
};

/**
 * What it takes to break a part, as short phrases: "2nd flinch", "under
 * 50% HP", "dragon damage". Empty when the game breaks it on an event
 * rather than a flinch count.
 */
export function breakConditions(b: MonsterBreak): string[] {
  const out: string[] = [];
  if (b.flinches !== null) {
    const each = b.all_parts && b.parts.length > 1 ? " of each" : "";
    out.push(`${ordinal(b.flinches)} flinch${each}`);
  }
  if (b.below_hp !== undefined) out.push(`under ${Math.round(b.below_hp * 100)}% HP`);
  if (b.damage) out.push(`${DAMAGE[b.damage]} damage`);
  return out;
}

/** Key of a break in the highlight state, distinct from hitzone part names. */
export const breakKey = (index: number) => `break:${index}`;

/** The break index a highlight key names, or null if it names a hitzone part. */
export function breakIndex(key: string): number | null {
  const match = /^break:(\d+)$/.exec(key);
  return match ? Number(match[1]) : null;
}

/**
 * A hitzone row's flinch threshold from its body parts' (`Monster.flinch_thresholds`
 * by capsule `part`): one value, or "min–max" when the row covers parts with
 * different ones. Null when none of the parts has one.
 */
export function flinchThreshold(thresholds: (number | null)[], parts: number[]): string | null {
  const values = parts
    .map((part) => thresholds[part])
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? String(min) : `${min}–${max}`;
}
