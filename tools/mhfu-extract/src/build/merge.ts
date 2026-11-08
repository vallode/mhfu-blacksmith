/**
 * Merges `extract` output into committed `data/` files for one category.
 *
 * - Item order, file layout and key order come from the committed file.
 *   Only items the disc also has change, and only in the category's `take`
 *   fields (see `categories.ts`), minus the file's own `keepFields`.
 *   Everything else is copied through.
 * - A taken field is written in the site's vocabulary (`fields.ts`
 *   `toSite`): site names for the item's materials and upgrade-tree
 *   references, site skill spellings, and the committed value untouched
 *   when it already agrees with the disc.
 * - Disc items the site doesn't list are not added. They'd need fields the
 *   disc doesn't have (`hr`, `sex`, ...); they're reported instead.
 * - `overlay/keep-site-values.json` lists reviewed disagreements where the
 *   committed value is right and the disc reading is wrong. Those stay as
 *   committed. An entry that no longer matches a disagreement is an error,
 *   so the list can't silently go stale.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Category } from "./categories.js";
import { canonical, toSite, type SpellingIndex } from "./fields.js";
import {
  fieldContext,
  pairCategory,
  type CategoryItems,
  type Item,
  type Pairing,
} from "./compare.js";
import type { SiteIndex } from "./ids.js";

export interface KeepSiteValue {
  file: string;
  name: string;
  field: string;
  reason: string;
}

const KEEP_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "overlay",
  "keep-site-values.json",
);

export function loadKeepSiteValues(file = KEEP_PATH): KeepSiteValue[] {
  return (JSON.parse(readFileSync(file, "utf-8")) as { entries: KeepSiteValue[] }).entries;
}

export interface Change {
  file: string;
  name: string;
  id: number;
  field: string;
  before: unknown;
  after: unknown;
}

export interface KeptDisagreement extends KeepSiteValue {
  disc: unknown;
}

export interface MergeResult {
  /** Committed file -> its new items, in committed order. */
  files: Map<string, Item[]>;
  changes: Change[];
  /** Disagreements left as committed because of `keep-site-values.json`. */
  kept: KeptDisagreement[];
  pairing: Pairing;
}

export function mergeCategory(
  category: Category,
  extracted: CategoryItems,
  committed: CategoryItems,
  site: SiteIndex,
  spellings: SpellingIndex,
  keep: KeepSiteValue[],
): MergeResult {
  const pairing = pairCategory(category, extracted, committed, site);
  const take = category.fields.filter((f) => category.take.includes(f.field));
  const keepKey = (file: string, name: string, field: string) =>
    `${file}\u0000${name}\u0000${field}`;
  const fileNames = new Set(category.files.map((f) => f.file));
  const keepFieldsByFile = new Map(category.files.map((f) => [f.file, f.keepFields ?? []]));
  const relevantKeep = keep.filter((k) => fileNames.has(k.file));
  const keepByKey = new Map(relevantKeep.map((k) => [keepKey(k.file, k.name, k.field), k]));
  const usedKeep = new Set<string>();

  const files = new Map<string, Item[]>();
  for (const [file, items] of committed) files.set(file, [...items]);

  const changes: Change[] = [];
  const kept: KeptDisagreement[] = [];
  for (const pair of pairing.pairs) {
    const ctx = fieldContext(category, pair.file, site, spellings);
    const name = String(pair.site.name);
    const merged: Item = { ...pair.site };
    const keepFields = keepFieldsByFile.get(pair.file) ?? [];
    for (const spec of take) {
      if (keepFields.includes(spec.field)) continue;
      if (!(spec.field in pair.disc)) continue;
      const discValue = pair.disc[spec.field];
      if (!(spec.field in pair.site) && (discValue === null || discValue === undefined)) continue;

      const agrees =
        spec.field in pair.site &&
        canonical(spec, pair.site[spec.field], "site", ctx) ===
          canonical(spec, discValue, "disc", ctx);
      const override = keepByKey.get(keepKey(pair.file, name, spec.field));
      if (override) {
        usedKeep.add(keepKey(pair.file, name, spec.field));
        if (agrees) continue; // reported as stale below
        kept.push({ ...override, disc: discValue });
        continue;
      }

      const after = toSite(spec, discValue, pair.site, ctx);
      merged[spec.field] = after;
      if (JSON.stringify(after) !== JSON.stringify(pair.site[spec.field])) {
        changes.push({
          file: pair.file,
          name,
          id: pair.id,
          field: spec.field,
          before: pair.site[spec.field],
          after,
        });
      }
    }
    files.get(pair.file)![pair.index] = merged;
  }

  const stale = relevantKeep.filter((k) => {
    const key = keepKey(k.file, k.name, k.field);
    return !usedKeep.has(key) || !kept.some((e) => keepKey(e.file, e.name, e.field) === key);
  });
  if (stale.length > 0) {
    const list = stale.map((k) => `  - ${k.file} "${k.name}" ${k.field}`).join("\n");
    throw new Error(
      `keep-site-values.json has entries that no longer match a disc disagreement; remove them:\n${list}`,
    );
  }

  return { files, changes, kept, pairing };
}

/** The committed files' layout: `JSON.stringify(_, null, 2)`, no trailing newline. */
export function serializeDataFile(
  arrayKey: string,
  original: Record<string, unknown> | null,
  items: Item[],
): string {
  return JSON.stringify({ ...(original ?? {}), [arrayKey]: items }, null, 2);
}
