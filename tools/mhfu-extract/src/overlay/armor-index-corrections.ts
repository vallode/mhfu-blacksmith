/**
 * Per-slot raw-`ArmorValue`-array-position -> name-table-index correction
 * map. Fixes fix-plan.md issue #1 ("armor name<->stat index drift"):
 * `ArmorValue`'s stat array and the `.enum`-sourced name array
 * (`src/strings/names.ts`) are two independently-ordered lists this
 * pipeline can't otherwise line up — no in-binary field links them (see
 * `emit/armor.ts`'s module doc comment for the full history, including the
 * disproven "hidden index field" hypothesis tested against `unkn1`/`unkn2`/
 * `unkn3`).
 *
 * This table is the fix-plan's proposed **approach 2**: empirically-derived
 * via fingerprint matching, not a formula. `scripts/generate-armor-
 * corrections.ts` (not shipped/run at runtime) builds it by fingerprinting
 * every raw `ArmorValueEntry` on (defense, 4 resistances, rarity, slots,
 * halved price) and matching that fingerprint 1:1 against the same
 * fingerprint computed from the committed `data/armor/*.json` entry the
 * name belongs to. A correction is only recorded when *both* the raw
 * fingerprint and the committed name are unique within their slot (no
 * ambiguous fingerprint collisions are guessed at), and only when it
 * actually differs from the raw-position assumption (so this table is
 * sparse — most entries need no override).
 *
 * **Known limitation**: only ~37-45% of entries per slot have a unique,
 * confident fingerprint match (the rest share a fingerprint with at least
 * one other armor piece in the same slot, most commonly dummy/near-
 * identical low-rarity pieces, or have no committed counterpart at all) —
 * see `docs/fix-plan.md` issue #1 for the measured per-slot coverage. Raw
 * positions with no entry here fall back to the original raw-index
 * assumption, which may still be wrong; this table only *improves* the
 * match rate, it doesn't claim full coverage. Regenerate if `data/armor/`
 * changes (e.g. wiki corrections) using `scripts/generate-armor-
 * corrections.ts` against a real unpacked EBOOT.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { ArmorSlot } from "../tables/armor.js";

const CORRECTIONS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "armor-index-corrections.json");

interface SlotCorrections {
  corrections: Record<string, number>;
  suppressed: number[];
}

let cache: Record<ArmorSlot, SlotCorrections> | null = null;

function load(): Record<ArmorSlot, SlotCorrections> {
  if (!cache) cache = JSON.parse(readFileSync(CORRECTIONS_PATH, "utf-8"));
  return cache!;
}

/**
 * Returns the name-table index to use for a raw `ArmorValue` array position
 * `rawIndex` in `slot`:
 * - Returns the confirmed correction if one exists for this raw position.
 * - Returns `null` if this raw position's *own* array index was confidently
 *   reassigned to a different raw position (see `suppressed` above) — the
 *   caller should skip emitting this entry rather than falsely duplicate a
 *   name that's already confidently claimed elsewhere.
 * - Otherwise falls back to `rawIndex` itself (the original, unconfirmed,
 *   sometimes-wrong raw-position assumption — no better information exists
 *   for this entry).
 */
export function correctedArmorNameIndex(slot: ArmorSlot, rawIndex: number): number | null {
  const table = load()[slot];
  if (!table) return rawIndex;
  const corrected = table.corrections[rawIndex];
  if (corrected !== undefined) return corrected;
  if (table.suppressed.includes(rawIndex)) return null;
  return rawIndex;
}
