/**
 * Order-insensitive comparison of `extract` output against committed
 * `data/`, matching items by game ID (see `ids.ts`) and comparing each
 * field in its canonical form (see `fields.ts`). Unlike `diff`, a renamed
 * item still pairs up, and a skill list that differs only in order or
 * spelling counts as agreeing.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CATEGORIES, type Category, type CategoryName } from "./categories.js";
import {
  buildSpellingIndex,
  fieldsAgree,
  type FieldContext,
  type SpellingIndex,
} from "./fields.js";
import { assignDiscIds, loadSiteIndex, type SiteIndex } from "./ids.js";
import type { MaterialContext } from "../overlay/item-name-corrections.js";
import { monsterIdOf } from "../overlay/monsters.js";

export type Item = Record<string, unknown>;

/** File (relative to `data/`) -> its items. A missing file reads as empty. */
export type CategoryItems = Map<string, Item[]>;

export async function readCategoryItems(dir: string, category: Category): Promise<CategoryItems> {
  const out: CategoryItems = new Map();
  for (const { file } of category.files) {
    let items: Item[] = [];
    try {
      const json = JSON.parse(await readFile(path.join(dir, file), "utf-8")) as Record<
        string,
        Item[]
      >;
      items = json[category.arrayKey] ?? [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    out.set(file, items);
  }
  return out;
}

export interface Pair {
  /** Committed file the site item lives in. */
  file: string;
  /** Position of the site item in that file. */
  index: number;
  id: number;
  site: Item;
  disc: Item;
  /** Extract output file the disc item came from (differs from `file` when the disc routes a weapon to another type). */
  discFile: string;
}

export interface Unpaired {
  file: string;
  name: string;
  id: number | null;
}

export interface Pairing {
  pairs: Pair[];
  /** Committed items with no disc counterpart (kept unchanged by `build-data`). */
  siteOnly: Unpaired[];
  /** Disc items the site doesn't list (not added by `build-data`). */
  discOnly: Unpaired[];
}

function idKey(category: Category, file: string, id: number): string {
  const spec = category.files.find((f) => f.file === file)!;
  return `${spec.slot ?? spec.table}:${id}`;
}

export function pairCategory(
  category: Category,
  extracted: CategoryItems,
  committed: CategoryItems,
  site: SiteIndex,
): Pairing {
  const disc = new Map<string, { file: string; item: Item; id: number }>();
  const discOnly: Unpaired[] = [];
  for (const spec of category.files) {
    const items = extracted.get(spec.file) ?? [];
    const ids = assignDiscIds(
      items.map((i) => String(i.name)),
      spec.table,
    );
    items.forEach((item, i) => {
      const id = ids[i];
      if (id === null || id === undefined) {
        discOnly.push({ file: spec.file, name: String(item.name), id: null });
        return;
      }
      disc.set(idKey(category, spec.file, id), { file: spec.file, item, id });
    });
  }

  const pairs: Pair[] = [];
  const siteOnly: Unpaired[] = [];
  const claimed = new Set<string>();
  for (const spec of category.files) {
    (committed.get(spec.file) ?? []).forEach((item, index) => {
      const name = String(item.name);
      const id = spec.slot
        ? site.equipmentIdOf(spec.slot, {
            name,
            type: spec.weaponType,
            sex: item.sex as string | undefined,
          })
        : spec.table === "emID"
          ? monsterIdOf(name)
          : site.itemIdOf(name);
      const match = id === null ? undefined : disc.get(idKey(category, spec.file, id));
      if (id === null || !match) {
        siteOnly.push({ file: spec.file, name, id });
        return;
      }
      claimed.add(idKey(category, spec.file, id));
      pairs.push({
        file: spec.file,
        index,
        id,
        site: item,
        disc: match.item,
        discFile: match.file,
      });
    });
  }
  for (const [key, entry] of disc) {
    if (!claimed.has(key))
      discOnly.push({ file: entry.file, name: String(entry.item.name), id: entry.id });
  }
  return { pairs, siteOnly, discOnly };
}

export function fieldContext(
  category: Category,
  file: string,
  site: SiteIndex,
  spellings: SpellingIndex,
): FieldContext {
  const spec = category.files.find((f) => f.file === file)!;
  return {
    site,
    spellings,
    materialContext: category.materialContext,
    weaponSlot: spec.slot,
    weaponTable: spec.table,
  };
}

export interface FieldStats {
  field: string;
  agree: number;
  disagree: number;
  /** The disc has the field but the committed item doesn't. */
  siteMissing: number;
}

export interface Disagreement {
  file: string;
  name: string;
  id: number;
  field: string;
  site: unknown;
  disc: unknown;
}

export interface FileComparison {
  file: string;
  matched: number;
  siteOnly: number;
  discOnly: number;
  fields: FieldStats[];
}

export interface CategoryComparison {
  category: CategoryName;
  files: FileComparison[];
  /** Totals across `files`. */
  total: FileComparison;
  disagreements: Disagreement[];
  siteOnly: Unpaired[];
  discOnly: Unpaired[];
}

function emptyStats(category: Category, file: string): FileComparison {
  return {
    file,
    matched: 0,
    siteOnly: 0,
    discOnly: 0,
    fields: category.fields.map((f) => ({ field: f.field, agree: 0, disagree: 0, siteMissing: 0 })),
  };
}

export function compareCategory(
  category: Category,
  extracted: CategoryItems,
  committed: CategoryItems,
  site: SiteIndex,
  spellings: SpellingIndex,
): CategoryComparison {
  const pairing = pairCategory(category, extracted, committed, site);
  const files = new Map(category.files.map((f) => [f.file, emptyStats(category, f.file)]));
  const total = emptyStats(category, "total");
  const disagreements: Disagreement[] = [];

  for (const pair of pairing.pairs) {
    const stats = files.get(pair.file)!;
    stats.matched++;
    total.matched++;
    const ctx = fieldContext(category, pair.file, site, spellings);
    category.fields.forEach((spec, i) => {
      if (!(spec.field in pair.disc)) return;
      const bump = (key: "agree" | "disagree" | "siteMissing") => {
        stats.fields[i]![key]++;
        total.fields[i]![key]++;
      };
      if (!(spec.field in pair.site)) {
        if (pair.disc[spec.field] !== null && pair.disc[spec.field] !== undefined)
          bump("siteMissing");
        return;
      }
      const siteValue = pair.site[spec.field];
      const discValue = pair.disc[spec.field];
      if (fieldsAgree(spec, siteValue, discValue, ctx)) {
        bump("agree");
      } else {
        bump("disagree");
        disagreements.push({
          file: pair.file,
          name: String(pair.site.name),
          id: pair.id,
          field: spec.field,
          site: siteValue,
          disc: discValue,
        });
      }
    });
  }
  for (const u of pairing.siteOnly) {
    files.get(u.file)!.siteOnly++;
    total.siteOnly++;
  }
  for (const u of pairing.discOnly) {
    files.get(u.file)!.discOnly++;
    total.discOnly++;
  }

  return {
    category: category.name,
    files: [...files.values()],
    total,
    disagreements,
    siteOnly: pairing.siteOnly,
    discOnly: pairing.discOnly,
  };
}

/** Loads both sides and the site lookups once for a set of categories. */
export async function loadInputs(extractedDir: string, dataDir: string, names: CategoryName[]) {
  const site = loadSiteIndex(dataDir);
  const committed = new Map<CategoryName, CategoryItems>();
  const extracted = new Map<CategoryName, CategoryItems>();
  // Spellings come from every committed category, so a skill or material
  // new to armor is spelled the way weapons/decorations already spell it.
  const byContext = new Map<MaterialContext, Item[]>();
  for (const name of Object.keys(CATEGORIES) as CategoryName[]) {
    const items = await readCategoryItems(dataDir, CATEGORIES[name]);
    committed.set(name, items);
    const context = CATEGORIES[name].materialContext;
    byContext.set(context, [...(byContext.get(context) ?? []), ...[...items.values()].flat()]);
  }
  for (const name of names)
    extracted.set(name, await readCategoryItems(extractedDir, CATEGORIES[name]));
  const spellings = buildSpellingIndex(byContext, site);
  return { site, committed, extracted, spellings, byContext };
}

function pct(agree: number, disagree: number): string {
  const n = agree + disagree;
  return n === 0 ? "–" : `${((100 * agree) / n).toFixed(1)}%`;
}

/** Markdown agreement tables: one row per file, one column per field. */
export function formatComparison(results: CategoryComparison[]): string {
  const out: string[] = [];
  for (const r of results) {
    const fields = r.total.fields.map((f) => f.field);
    out.push(`### ${r.category}`, "");
    out.push(`| file | matched | site only | disc only | ${fields.join(" | ")} |`);
    out.push(`|---|---|---|---|${fields.map(() => "---").join("|")}|`);
    for (const f of [...r.files, r.total]) {
      const label = f.file === "total" ? "**total**" : f.file;
      const cells = f.fields.map((s) =>
        s.disagree > 0 ? `${pct(s.agree, s.disagree)} (${s.disagree})` : pct(s.agree, s.disagree),
      );
      out.push(
        `| ${label} | ${f.matched} | ${f.siteOnly} | ${f.discOnly} | ${cells.join(" | ")} |`,
      );
    }
    out.push(
      "",
      "Cells: share of matched items whose field agrees, with the number that disagree in brackets.",
      "",
    );
  }
  return out.join("\n");
}
