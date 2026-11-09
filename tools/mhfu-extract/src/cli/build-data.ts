/**
 * `build-data` subcommand: rewrites committed `data/` files from `extract`
 * output. Equipment categories are merged field by field
 * (`build/merge.ts`); quests have no committed counterpart and are copied
 * through, with each supply and reward item under its game name. Prints, and optionally writes, a report of every value the disc
 * changed, every reviewed disagreement kept as committed, and every item
 * only one side has.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CATEGORIES, CATEGORY_NAMES, type CategoryName } from "../build/categories.js";
import { loadInputs, type Unpaired } from "../build/compare.js";
import { discMaterialId, loadSiteIndex, type SiteIndex } from "../build/ids.js";
import {
  loadKeepSiteValues,
  mergeCategory,
  serializeDataFile,
  type Change,
  type KeptDisagreement,
} from "../build/merge.js";
import {
  buildStyleIndex,
  loadStyleOverrides,
  normalizeMaterials,
  type MaterialLook,
} from "../build/material-styles.js";

export type BuildTarget = CategoryName | "quests";
export const BUILD_TARGETS: BuildTarget[] = [...CATEGORY_NAMES, "quests"];

export interface BuildDataOptions {
  extracted: string;
  data: string;
  only?: BuildTarget[];
  /** Write the change report as JSON. */
  report?: string;
  /** Write the change report as Markdown. */
  markdown?: string;
  /** Compute and report, but don't write `data/`. */
  dryRun?: boolean;
}

/** One material renamed to its game name and/or restyled, with how many recipe rows it touched. */
export interface MaterialChange {
  before: MaterialLook;
  after: MaterialLook;
  count: number;
}

export interface CategoryBuildReport {
  category: CategoryName;
  changes: Change[];
  /** Material names and icon styles normalized per item (`build/material-styles.ts`). */
  materials: MaterialChange[];
  kept: KeptDisagreement[];
  siteOnly: Unpaired[];
  discOnly: Unpaired[];
  filesWritten: string[];
}

export interface BuildDataReport {
  categories: CategoryBuildReport[];
  questFiles: string[];
}

export function parseTargets(value: string | undefined): BuildTarget[] {
  if (!value) return BUILD_TARGETS;
  const names = value.split(",").map((s) => s.trim());
  for (const name of names) {
    if (!BUILD_TARGETS.includes(name as BuildTarget))
      throw new Error(`Unknown target "${name}" (expected ${BUILD_TARGETS.join(", ")})`);
  }
  return names as BuildTarget[];
}

async function readJsonOrNull(file: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(file, "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

interface QuestItem {
  item: string;
}

/**
 * Writes each quest supply and reward item under its game name
 * (`data/items.json`). `extract` names them from the `ItemID` enum, which
 * only differs from `items.json` on a few Japanese promo tickets.
 */
export function nameQuestItems(content: unknown, site: SiteIndex): unknown {
  const rename = (entry: QuestItem) => {
    const id = discMaterialId(entry.item);
    const name = id === null ? undefined : site.items.get(id)?.name;
    return name && name !== entry.item ? { ...entry, item: name } : entry;
  };
  const doc = content as { quests?: Record<string, unknown>[] };
  if (!Array.isArray(doc?.quests)) return content;
  return {
    ...doc,
    quests: doc.quests.map((quest) => {
      const out = { ...quest };
      if (Array.isArray(quest.supplies)) out.supplies = (quest.supplies as QuestItem[]).map(rename);
      if (Array.isArray(quest.reward_tables))
        out.reward_tables = (quest.reward_tables as { items?: QuestItem[] }[]).map((table) =>
          Array.isArray(table.items) ? { ...table, items: table.items.map(rename) } : table,
        );
      return out;
    }),
  };
}

async function copyQuests(options: BuildDataOptions): Promise<string[]> {
  const from = path.join(options.extracted, "quests");
  const files = (await readdir(from)).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0)
    throw new Error(`${from} has no quest files; rerun extract with DATA.BIN unpacked`);
  const site = loadSiteIndex(options.data);
  const written: string[] = [];
  for (const file of files) {
    const content = nameQuestItems(
      JSON.parse(await readFile(path.join(from, file), "utf-8")),
      site,
    );
    const rel = path.join("quests", file);
    if (!options.dryRun) {
      await mkdir(path.join(options.data, "quests"), { recursive: true });
      await writeFile(path.join(options.data, rel), JSON.stringify(content, null, 2), "utf-8");
    }
    written.push(rel);
  }
  return written;
}

export async function runBuildData(options: BuildDataOptions): Promise<BuildDataReport> {
  const targets = options.only ?? BUILD_TARGETS;
  const categoryNames = targets.filter((t): t is CategoryName => t !== "quests");
  const { site, committed, extracted, spellings, byContext } = await loadInputs(
    options.extracted,
    options.data,
    categoryNames,
  );
  const keep = loadKeepSiteValues();
  const styleOf = buildStyleIndex(byContext, site, loadStyleOverrides());

  const categories: CategoryBuildReport[] = [];
  for (const name of categoryNames) {
    const category = CATEGORIES[name];
    if (category.take.length === 0) {
      console.log(
        `${name}: no fields are taken from the disc yet (see build/categories.ts); skipped.`,
      );
      continue;
    }
    const result = mergeCategory(
      category,
      extracted.get(name)!,
      committed.get(name)!,
      site,
      spellings,
      keep,
    );
    const materials = new Map<string, MaterialChange>();
    for (const [file, items] of result.files) {
      result.files.set(
        file,
        items.map((item) =>
          normalizeMaterials(item, site, styleOf, (m, after) => {
            const before = { name: m.name, type: m.type, color: m.color };
            const key = JSON.stringify([before, after]);
            const entry = materials.get(key) ?? { before, after, count: 0 };
            entry.count++;
            materials.set(key, entry);
          }),
        ),
      );
    }
    const filesWritten: string[] = [];
    for (const [file, items] of result.files) {
      const absPath = path.join(options.data, file);
      const original = await readJsonOrNull(absPath);
      if (!original) continue; // build-data rewrites committed files; it doesn't create new ones
      const next = serializeDataFile(category.arrayKey, original, items);
      const previous = original ? await readFile(absPath, "utf-8") : null;
      if (next === previous) continue;
      if (!options.dryRun) await writeFile(absPath, next, "utf-8");
      filesWritten.push(file);
    }
    categories.push({
      category: name,
      changes: result.changes,
      materials: [...materials.values()].sort((a, b) => a.before.name.localeCompare(b.before.name)),
      kept: result.kept,
      siteOnly: result.pairing.siteOnly,
      discOnly: result.pairing.discOnly,
      filesWritten,
    });
  }

  const questFiles = targets.includes("quests") ? await copyQuests(options) : [];
  const report: BuildDataReport = { categories, questFiles };
  if (options.report)
    await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  if (options.markdown) await writeFile(options.markdown, formatBuildReport(report), "utf-8");
  return report;
}

export function printBuildSummary(report: BuildDataReport, dryRun = false): void {
  const verb = dryRun ? "would write" : "wrote";
  for (const c of report.categories) {
    const byField = new Map<string, number>();
    for (const change of c.changes) byField.set(change.field, (byField.get(change.field) ?? 0) + 1);
    const fields = [...byField].map(([f, n]) => `${f} ${n}`).join(", ") || "none";
    const materialRows = c.materials.reduce((n, r) => n + r.count, 0);
    console.log(
      `${c.category}: ${c.changes.length} value(s) changed (${fields}); ${materialRows} material(s) renamed or restyled; ${c.kept.length} kept as committed; ${verb} ${c.filesWritten.length} file(s).`,
    );
    if (c.siteOnly.length > 0)
      console.log(
        `  ${c.siteOnly.length} committed item(s) with no disc match, left as-is: ${c.siteOnly
          .slice(0, 8)
          .map((u) => u.name)
          .join(", ")}${c.siteOnly.length > 8 ? ", ..." : ""}`,
      );
    if (c.discOnly.length > 0)
      console.log(
        `  ${c.discOnly.length} disc item(s) the site doesn't list, not added: ${c.discOnly
          .slice(0, 8)
          .map((u) => u.name)
          .join(", ")}${c.discOnly.length > 8 ? ", ..." : ""}`,
      );
  }
  if (report.questFiles.length > 0) console.log(`quests: ${verb} ${report.questFiles.join(", ")}`);
}

/** Short display form of a field value for the Markdown report. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "–";
  if (Array.isArray(value)) {
    if (value.length === 0) return "–";
    return value
      .map((v) => {
        if (v && typeof v === "object" && "name" in v && "amount" in v) {
          const { name, amount } = v as { name: string; amount: number };
          return "type" in v ? `${name} ×${amount}` : `${name} ${amount >= 0 ? "+" : ""}${amount}`;
        }
        if (v && typeof v === "object" && "name" in v && "chance" in v)
          return `${(v as { name: string }).name} ${(v as { chance: string }).chance}`;
        if (v && typeof v === "object" && "name" in v && "attack" in v)
          return `${(v as { name: string }).name} ${(v as { attack: number }).attack}`;
        if (v && typeof v === "object" && "name" in v && "capacity" in v) {
          const { name, capacity } = v as { name: string; capacity: number[] };
          return `${name} ${capacity.join("/")}`;
        }
        if (v && typeof v === "object" && "name" in v && "level" in v)
          return `${(v as { name: string }).name} ${(v as { level: string }).level}`;
        return String(v);
      })
      .join(", ");
  }
  return String(value);
}

const cell = (s: string) => s.replace(/\|/g, "\\|");

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * For nested object fields (monster `hitzones`, `drops`): the paths whose
 * values differ, as `[path, before, after]`, so the report lists only what
 * changed (`chest.cut: 30 → 10`) instead of the whole object.
 */
export function changedLeaves(
  before: unknown,
  after: unknown,
  prefix = "",
): [string, unknown, unknown][] {
  if (!isRecord(before) || !isRecord(after)) {
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [[prefix, before, after]];
  }
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.flatMap((k) => changedLeaves(before[k], after[k], prefix ? `${prefix}.${k}` : k));
}

/** Markdown listing of every change, kept disagreement and unpaired item. */
export function formatBuildReport(report: BuildDataReport): string {
  const out: string[] = [];
  for (const c of report.categories) {
    out.push(`## ${c.category}`, "");
    const byField = new Map<string, Change[]>();
    for (const change of c.changes)
      byField.set(change.field, [...(byField.get(change.field) ?? []), change]);
    out.push(`${c.changes.length} value(s) changed by the disc.`, "");
    for (const [field, changes] of byField) {
      out.push(
        `### ${field} (${changes.length})`,
        "",
        "| file | item | site (before) | disc (after) |",
        "|---|---|---|---|",
      );
      for (const ch of changes) {
        const leaves =
          isRecord(ch.before) && isRecord(ch.after)
            ? changedLeaves(ch.before, ch.after)
            : [["", ch.before, ch.after] as [string, unknown, unknown]];
        for (const [leaf, before, after] of leaves) {
          const item = leaf ? `${ch.name} — ${leaf}` : ch.name;
          out.push(
            `| ${ch.file} | ${cell(item)} | ${cell(formatValue(before))} | ${cell(formatValue(after))} |`,
          );
        }
      }
      out.push("");
    }
    if (c.materials.length > 0) {
      const rows = c.materials.reduce((n, r) => n + r.count, 0);
      const look = (m: MaterialLook) => `${cell(m.name)} (${m.type}/${m.color})`;
      out.push(
        `### Materials renamed or restyled (${rows} rows, ${c.materials.length} spellings)`,
        "",
        "| before | after | rows |",
        "|---|---|---|",
      );
      for (const r of c.materials)
        out.push(`| ${look(r.before)} | ${look(r.after)} | ${r.count} |`);
      out.push("");
    }
    if (c.kept.length > 0) {
      out.push(
        `### Kept as committed (${c.kept.length})`,
        "",
        "| file | item | field | disc | reason |",
        "|---|---|---|---|---|",
      );
      for (const k of c.kept)
        out.push(
          `| ${k.file} | ${cell(k.name)} | ${k.field} | ${cell(formatValue(k.disc))} | ${cell(k.reason)} |`,
        );
      out.push("");
    }
    if (c.siteOnly.length > 0) {
      out.push(`### Site items with no disc match (${c.siteOnly.length}, unchanged)`, "");
      for (const u of c.siteOnly)
        out.push(`- ${u.file}: ${u.name}${u.id === null ? " (no game ID)" : ` (ID ${u.id})`}`);
      out.push("");
    }
    if (c.discOnly.length > 0) {
      out.push(`### Disc items the site doesn't list (${c.discOnly.length}, not added)`, "");
      for (const u of c.discOnly)
        out.push(`- ${u.file}: ${u.name}${u.id === null ? "" : ` (ID ${u.id})`}`);
      out.push("");
    }
  }
  if (report.questFiles.length > 0)
    out.push(
      "## quests",
      "",
      `${report.questFiles.length} file(s) copied from the disc.`,
      "",
      ...report.questFiles.map((f) => `- ${f}`),
      "",
    );
  return out.join("\n");
}
