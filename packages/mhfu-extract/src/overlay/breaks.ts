/**
 * Breaks set by a species' own code rather than the break table
 * (`monsters/breaks.ts`), read by hand from the EU disc; see the JSON's
 * `$comment`.
 */
import overlay from "./breaks.json" with { type: "json" };

export type BreakDamage = "cut" | "fire" | "dragon";

export interface CodeBreak {
  /** `capbreakindex` break type. */
  break: number;
  /** Body parts (hitbox capsule part numbers). */
  parts: number[];
  /** Flinch count that triggers it, or null when an event counter does. */
  flinches: number | null;
  /** Every part must reach the count (else any one). */
  all_parts?: boolean;
  /** Fraction of max HP the monster must be under. */
  below_hp?: number;
  /** Damage the part must have taken. */
  damage?: BreakDamage;
  /** Limits the entry to these emIDs. */
  only?: number[];
  source: string;
}

const SPECIES = (overlay as unknown as { species: Record<string, CodeBreak[]> }).species;

/** The code-set breaks of a monster: its species' entries that apply to its emID. */
export function codeBreaks(species: number, emId: number): CodeBreak[] {
  return (SPECIES[String(species)] ?? []).filter((b) => !b.only || b.only.includes(emId));
}
