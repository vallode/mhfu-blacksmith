/**
 * Per-slot raw-`ArmorValue`-array-position -> name-table-index correction
 * map. Fixes vallode/mhfu-blacksmith#30 ("armor name<->stat index drift"):
 * `ArmorValue`'s stat array and the `.enum`-sourced name array
 * (`src/strings/names.ts`) are two independently-ordered lists this
 * pipeline can't otherwise line up — no in-binary field links them (see
 * `emit/armor.ts`'s module doc comment for the full history, including the
 * disproven "hidden index field" hypothesis tested against `unkn1`/`unkn2`/
 * `unkn3`).
 *
 * This table is the proposed **approach 2** from vallode/mhfu-blacksmith#30: empirically-derived
 * via fingerprint matching, not a formula (a structural root cause — a real
 * in-binary index/permutation table, or a simple sort-order rule — was
 * searched for and not found; see vallode/mhfu-blacksmith#30's second
 * "Update" for the full investigation, including why a promising near-
 * monotonic raw-index/name-index correlation *didn't* pan out into a
 * position-based interpolation scheme). `scripts/generate-armor-
 * corrections.ts` (not shipped/run at runtime) builds it by fingerprinting
 * every raw `ArmorValueEntry` against the committed `data/armor/*.json`
 * entry the name belongs to, in two confidence tiers — see that script's
 * module doc comment for the full methodology (in short: a "core"
 * fingerprint deliberately excludes `slots`, since it's independently
 * unreliable for a large, structured subset of entries, with `slots` used
 * only as a tiebreaker when the core fingerprint alone is ambiguous). A
 * correction is only recorded when both the raw fingerprint and the
 * committed name are unique within the slot *and* the result survives a
 * global monotonicity check (raw index and name index are empirically
 * almost-perfectly rank-correlated; any resolved pair that breaks that
 * trend is treated as a coincidental collision and dropped), and only when
 * it actually differs from the raw-position assumption (so this table is
 * sparse — most entries need no override).
 *
 * **Known limitation**: ~68-73% of entries per slot have a unique,
 * confident fingerprint match (up from ~28-55% under the original
 * slots-inclusive fingerprint) — the rest share a fingerprint with at
 * least one other armor piece in the same slot (most commonly dummy/
 * near-identical low-rarity pieces), or have no committed counterpart at
 * all — see vallode/mhfu-blacksmith#30 for the measured per-slot coverage.
 * Raw positions with no entry here fall back to the original raw-index
 * assumption, which may still be wrong; this table only *improves* the
 * match rate, it doesn't claim full coverage. Note also that a confirmed
 * name/stat match does **not** imply every stat field on that entry is
 * correct — `slots` specifically is known-unreliable for many entries even
 * once correctly named (see `generate-armor-corrections.ts`'s doc comment)
 * and is emitted as-is from the raw struct, uncorrected. Regenerate if
 * `data/armor/` changes (e.g. wiki corrections) using `scripts/generate-
 * armor-corrections.ts` against a real unpacked EBOOT.
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
