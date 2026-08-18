/**
 * `ItemID` (material) name-transcription correction table. Fixes fix-plan.md
 * issue #2 ("`create_mats` material-name transcription noise"): the game's
 * `.enum`-sourced `ItemID` name table has a long tail of typos/abbreviation
 * inconsistencies (e.g. `"Firestone"` vs. `"Fire Stone"`, `"Eldr Dragon
 * Bone"` vs. `"Elder Drgn Bone"`) relative to the committed `data/`
 * material names used in `create_mats`/`alternative_create_mats`/
 * `improve_mats`. This also indirectly corrupts `resolveMaterialStyle()`'s
 * `type`/`color` lookup (`overlay/materials.ts`), which matches by exact
 * name and silently falls back to `UNKNOWN_MATERIAL_STYLE` on a mismatch.
 *
 * Built by a one-off analysis (not shipped as a script, since — unlike
 * `generate-armor-corrections.ts` — it needed several rounds of hand review;
 * see fix-plan.md issue #2 for the full methodology) that diffed extracted
 * vs. committed `create_mats` entries at matching array position + quantity
 * to find name-only mismatches, scored candidates by normalized edit-
 * distance/token-set similarity, then hand-reviewed borderline cases to drop
 * likely-different-item pairs (different tier, body part, or monster;
 * reciprocal cross-wiring bugs) from the mechanical similarity ranking.
 *
 * **Critical finding driving this table's two-bucket shape**: the committed
 * `data/` corpus is itself internally inconsistent about several dozen
 * material names between armor files and weapons/decorations files for the
 * exact same real item (e.g. armor commits spell it `"Fire Stone"`,
 * weapons/decorations commit `"Firestone"` — both spellings are already
 * correct *somewhere*, since `ItemID` resolution is one global lookup that
 * can't itself distinguish caller context). A single global rename would
 * therefore fix one category's mismatches while *regressing* the other
 * category's already-correct entries. So corrections are split into:
 * - `global`: the extracted spelling never appears as a legitimate
 *   committed name anywhere (`armor`/`weapons`/`decorations`) — zero
 *   collision risk, safe to apply regardless of caller.
 * - `armor`: the extracted spelling is already legitimately used in
 *   weapons/decorations recipes (so must NOT be touched there), but the
 *   committed *armor* data consistently expects the other spelling instead
 *   — scoped to only apply when resolving materials for armor recipes.
 *
 * ~17 additional high-similarity candidate pairs were found and *excluded*
 * despite passing the mechanical filters, because both spellings are
 * already in legitimate concurrent use within the *same* category (e.g.
 * `"Blue Kut-Ku Scl"` and `"Kut-Ku Scale"` both already appear correctly in
 * armor *and* weapons recipes) — too ambiguous to safely correct without
 * risking a regression; see fix-plan.md issue #2 for the full list.
 *
 * Regenerate/re-review if `data/` material names change (e.g. wiki
 * corrections) — the collision analysis is only valid as of this snapshot.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CORRECTIONS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "item-name-corrections.json");

export type MaterialContext = "armor" | "weapon" | "decoration";

interface CorrectionsTable {
  global: Record<string, string>;
  armor: Record<string, string>;
}

let cache: CorrectionsTable | null = null;

function load(): CorrectionsTable {
  if (!cache) cache = JSON.parse(readFileSync(CORRECTIONS_PATH, "utf-8"));
  return cache!;
}

/**
 * Returns the corrected material display name for a raw `ItemID`-resolved
 * `name` in the given recipe `context`, or `name` unchanged if no
 * correction applies (the overwhelming majority of names — this table only
 * overrides a confirmed-safe subset). `global` corrections apply in every
 * context; `armor`-scoped corrections apply only when `context === "armor"`
 * (see module doc comment for why weapon/decoration recipes must NOT get
 * the armor-scoped corrections).
 */
export function correctedItemName(name: string, context: MaterialContext): string {
  const table = load();
  const global = table.global[name];
  if (global !== undefined) return global;
  if (context === "armor") {
    const armor = table.armor[name];
    if (armor !== undefined) return armor;
  }
  return name;
}
