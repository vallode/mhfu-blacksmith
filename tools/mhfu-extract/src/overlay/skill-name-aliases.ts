/**
 * Legacy-spelling aliases for `SkillID` names, used only by `diff`.
 *
 * Unlike `item-name-corrections.ts`, this table does **not** change what
 * `extract` emits. The extracted output keeps the extractor's own skill
 * names (the `SkillID` table, currently bootstrapped from the vendored
 * mhp2g-patterns `.enum` file; see `strings/names.ts`). The goal is to
 * build all of `data/` from the disc eventually, so the extractor's
 * spelling is the canonical one and the committed site spelling is the
 * legacy one. `diff` rewrites committed skill names through this table
 * before comparing, so a different spelling of the same skill tree is not
 * reported as a mismatch. A different skill or a different amount still
 * is.
 *
 * Keys are committed `data/` spellings; values are `SkillID` names.
 * Invariants (pinned in `test/skill-name-aliases.test.ts`): every value is
 * a real `SkillID` name, and no key is one, so an alias can never rewrite
 * a name that is already canonical.
 *
 * - `armor`: from a real EU (ULES01213) `extract` + `diff` with the armor
 *   pointer-order fix (vallode/mhfu-blacksmith#61), pairing skills that
 *   appear on only one side of the same name-matched armor piece with an
 *   equal amount, keeping pairs seen at least twice (the smallest count
 *   was 11), then hand-checking each one as the same skill tree. Pairs
 *   involving the site's `Rage` were left out. They didn't pair 1:1 with
 *   a single `SkillID`, so they may be real MHP2G/MHFU differences or
 *   leftover armor misidentification rather than spellings.
 * - `decorations`: typos and spelling variants in the committed
 *   `data/decorations.json` that each have exactly one obvious `SkillID`
 *   counterpart (`"Everlasting"` -> `"Everlastng"`, `"NormalS up"` ->
 *   `"NormalS Up"`). Committed decorations mostly use the `SkillID`
 *   spelling already (`Defense`, `Capacity`, `Constitutn`, ...). The
 *   exception is `"Load"`, which appears alongside `"Reload"` for the same
 *   tree (e.g. "Recoilless Jewel" `Load -1` vs. "Pellet Jewel"
 *   `Reload -1`), so the `armor` bucket's aliases apply to decorations
 *   too. `"Ice Skill"` (Glacier Jewel) is left alone because it has no
 *   clear counterpart.
 *
 * The two buckets are merged into one lookup. They are kept apart in the
 * JSON only to record where each entry came from. No key in either
 * bucket collides with a `SkillID` name, so applying them everywhere is
 * safe.
 *
 * Drop this table once committed `data/` is regenerated from the disc.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ALIASES_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "skill-name-aliases.json",
);

interface AliasTable {
  armor: Record<string, string>;
  decorations: Record<string, string>;
}

let cache: Map<string, string> | null = null;

function load(): Map<string, string> {
  if (!cache) {
    const table: AliasTable = JSON.parse(readFileSync(ALIASES_PATH, "utf-8"));
    cache = new Map([...Object.entries(table.armor), ...Object.entries(table.decorations)]);
  }
  return cache;
}

/** All alias entries (committed spelling -> `SkillID` name), for tests/tools. */
export function skillNameAliases(): ReadonlyMap<string, string> {
  return load();
}

/** Returns the `SkillID` spelling for a committed skill name, or `name` unchanged if it has no alias. */
export function canonicalSkillName(name: string): string {
  return load().get(name) ?? name;
}

/**
 * Rewrites a committed decoration skill string (`"Load -1"`) to the
 * extractor's format and spelling (`"Reload -1"`). It also tolerates the
 * missing space some committed entries have (`"NormalS Up+1"`). Strings
 * that don't end in a signed amount (e.g. the stray `""` entries in a
 * couple of committed decorations) are returned unchanged.
 */
export function canonicalDecorationSkill(skill: string): string {
  const match = /^(.*?)\s*([+-]\d+)$/.exec(skill.trim());
  if (!match) return skill;
  const [, name = "", amount = ""] = match;
  return `${canonicalSkillName(name)} ${amount}`;
}
