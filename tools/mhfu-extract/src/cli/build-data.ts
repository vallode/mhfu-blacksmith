/**
 * `build-data` subcommand: rewrites committed `data/` files from `extract`
 * output. Equipment categories are merged field by field
 * (`build/merge.ts`); quests have no committed counterpart and are copied
 * through. Prints, and optionally writes, a report of every value the disc
 * changed, every reviewed disagreement kept as committed, and every item
 * only one side has.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CATEGORIES, CATEGORY_NAMES, type CategoryName } from "../build/categories.js";
import { loadInputs, type Unpaired } from "../build/compare.js";
import { loadKeepSiteValues, mergeCategory, serializeDataFile, type Change, type KeptDisagreement } from "../build/merge.js";

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

export interface CategoryBuildReport {
  category: CategoryName;
  changes: Change[];
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
    if (!BUILD_TARGETS.includes(name as BuildTarget)) throw new Error(`Unknown target "${name}" (expected ${BUILD_TARGETS.join(", ")})`);
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

async function copyQuests(options: BuildDataOptions): Promise<string[]> {
  const from = path.join(options.extracted, "quests");
  const files = (await readdir(from)).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`${from} has no quest files; rerun extract with DATA.BIN unpacked`);
  const written: string[] = [];
  for (const file of files) {
    const content = JSON.parse(await readFile(path.join(from, file), "utf-8"));
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
  const { site, committed, extracted, spellings } = await loadInputs(options.extracted, options.data, categoryNames);
  const keep = loadKeepSiteValues();

  const categories: CategoryBuildReport[] = [];
  for (const name of categoryNames) {
    const category = CATEGORIES[name];
    if (category.take.length === 0) {
      console.log(`${name}: no fields are taken from the disc yet (see build/categories.ts); skipped.`);
      continue;
    }
    const result = mergeCategory(category, extracted.get(name)!, committed.get(name)!, site, spellings, keep);
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
      kept: result.kept,
      siteOnly: result.pairing.siteOnly,
      discOnly: result.pairing.discOnly,
      filesWritten,
    });
  }

  const questFiles = targets.includes("quests") ? await copyQuests(options) : [];
  const report: BuildDataReport = { categories, questFiles };
  if (options.report) await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  if (options.markdown) await writeFile(options.markdown, formatBuildReport(report), "utf-8");
  return report;
}

export function printBuildSummary(report: BuildDataReport, dryRun = false): void {
  const verb = dryRun ? "would write" : "wrote";
  for (const c of report.categories) {
    const byField = new Map<string, number>();
    for (const change of c.changes) byField.set(change.field, (byField.get(change.field) ?? 0) + 1);
    const fields = [...byField].map(([f, n]) => `${f} ${n}`).join(", ") || "none";
    console.log(`${c.category}: ${c.changes.length} value(s) changed (${fields}); ${c.kept.length} kept as committed; ${verb} ${c.filesWritten.length} file(s).`);
    if (c.siteOnly.length > 0) console.log(`  ${c.siteOnly.length} committed item(s) with no disc match, left as-is: ${c.siteOnly.slice(0, 8).map((u) => u.name).join(", ")}${c.siteOnly.length > 8 ? ", ..." : ""}`);
    if (c.discOnly.length > 0) console.log(`  ${c.discOnly.length} disc item(s) the site doesn't list, not added: ${c.discOnly.slice(0, 8).map((u) => u.name).join(", ")}${c.discOnly.length > 8 ? ", ..." : ""}`);
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
        if (v && typeof v === "object" && "name" in v && "attack" in v) return `${(v as { name: string }).name} ${(v as { attack: number }).attack}`;
        return String(v);
      })
      .join(", ");
  }
  return String(value);
}

const cell = (s: string) => s.replace(/\|/g, "\\|");

/** Markdown listing of every change, kept disagreement and unpaired item. */
export function formatBuildReport(report: BuildDataReport): string {
  const out: string[] = [];
  for (const c of report.categories) {
    out.push(`## ${c.category}`, "");
    const byField = new Map<string, Change[]>();
    for (const change of c.changes) byField.set(change.field, [...(byField.get(change.field) ?? []), change]);
    out.push(`${c.changes.length} value(s) changed by the disc.`, "");
    for (const [field, changes] of byField) {
      out.push(`### ${field} (${changes.length})`, "", "| file | item | site (before) | disc (after) |", "|---|---|---|---|");
      for (const ch of changes) {
        out.push(`| ${ch.file} | ${cell(ch.name)} | ${cell(formatValue(ch.before))} | ${cell(formatValue(ch.after))} |`);
      }
      out.push("");
    }
    if (c.kept.length > 0) {
      out.push(`### Kept as committed (${c.kept.length})`, "", "| file | item | field | disc | reason |", "|---|---|---|---|---|");
      for (const k of c.kept) out.push(`| ${k.file} | ${cell(k.name)} | ${k.field} | ${cell(formatValue(k.disc))} | ${cell(k.reason)} |`);
      out.push("");
    }
    if (c.siteOnly.length > 0) {
      out.push(`### Site items with no disc match (${c.siteOnly.length}, unchanged)`, "");
      for (const u of c.siteOnly) out.push(`- ${u.file}: ${u.name}${u.id === null ? " (no game ID)" : ` (ID ${u.id})`}`);
      out.push("");
    }
    if (c.discOnly.length > 0) {
      out.push(`### Disc items the site doesn't list (${c.discOnly.length}, not added)`, "");
      for (const u of c.discOnly) out.push(`- ${u.file}: ${u.name}${u.id === null ? "" : ` (ID ${u.id})`}`);
      out.push("");
    }
  }
  if (report.questFiles.length > 0) out.push("## quests", "", `${report.questFiles.length} file(s) copied from the disc.`, "", ...report.questFiles.map((f) => `- ${f}`), "");
  return out.join("\n");
}
