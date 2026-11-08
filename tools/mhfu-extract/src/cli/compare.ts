/**
 * `compare` subcommand: per-file, per-field agreement between `extract`
 * output and committed `data/`, matching items by game ID and comparing
 * values order- and spelling-insensitively (see `build/compare.ts`). Use it
 * to decide which fields `build-data` can take from the disc.
 */
import { writeFile } from "node:fs/promises";
import { CATEGORIES, CATEGORY_NAMES, type CategoryName } from "../build/categories.js";
import { compareCategory, formatComparison, loadInputs, type CategoryComparison } from "../build/compare.js";

export interface CompareOptions {
  extracted: string;
  data: string;
  only?: CategoryName[];
  /** Write the full report (every disagreement and unpaired item) as JSON. */
  out?: string;
  /** Write the agreement tables as Markdown. */
  markdown?: string;
}

export function parseCategories(value: string | undefined): CategoryName[] {
  if (!value) return CATEGORY_NAMES;
  const names = value.split(",").map((s) => s.trim());
  for (const name of names) {
    if (!(name in CATEGORIES)) throw new Error(`Unknown category "${name}" (expected ${CATEGORY_NAMES.join(", ")})`);
  }
  return names as CategoryName[];
}

export async function runCompare(options: CompareOptions): Promise<CategoryComparison[]> {
  const names = options.only ?? CATEGORY_NAMES;
  const { site, committed, extracted, spellings } = await loadInputs(options.extracted, options.data, names);
  const results = names.map((name) =>
    compareCategory(CATEGORIES[name], extracted.get(name)!, committed.get(name)!, site, spellings)
  );
  const markdown = formatComparison(results);
  if (options.out) await writeFile(options.out, `${JSON.stringify(results, null, 2)}\n`, "utf-8");
  if (options.markdown) await writeFile(options.markdown, markdown, "utf-8");
  console.log(markdown);
  return results;
}
