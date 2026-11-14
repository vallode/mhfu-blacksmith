/**
 * `build-data` subcommand: rewrites committed `data/` files from `extract`
 * output. Equipment categories are merged field by field
 * (`build/merge.ts`); item stats are written into `data/items.json` by ID
 * (`build/items.ts`); quests, gathering points and shops have no committed
 * counterpart and are copied through, with each item under its game name.
 * Prints, and optionally writes, a report of every value the disc
 * changed, every reviewed disagreement kept as committed, and every item
 * only one side has.
 *
 * Everything here works on the named view of `data/` (game-data's
 * `readData`). `writeData` writes it back: records with game IDs, names and
 * quest text into `data/strings/en.json`. A second run writes nothing.
 */
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readData, writeData } from "game-data";
import { CATEGORIES, CATEGORY_NAMES, type CategoryName } from "../build/categories.js";
import { loadInputs, type Unpaired } from "../build/compare.js";
import { discMaterialId, loadSiteIndex, type SiteIndex } from "../build/ids.js";
import {
  loadKeepSiteValues,
  mergeCategory,
  type Change,
  type KeptDisagreement,
} from "../build/merge.js";
import {
  buildStyleIndex,
  loadStyleOverrides,
  normalizeMaterials,
  type MaterialLook,
} from "../build/material-styles.js";
import { mergeItemStats, type ItemStatChange } from "../build/items.js";
import type { EmittedItem } from "../emit/items.js";

/** Targets copied from the disc whole, rather than merged with committed files. */
export type CopiedTarget =
  "quests" | "gathering" | "shops" | "combinations" | "veggie-trades" | "farm";
const COPIED_TARGETS: CopiedTarget[] = [
  "quests",
  "gathering",
  "shops",
  "combinations",
  "veggie-trades",
  "farm",
];
/**
 * Copied targets `extract` skips with a warning when it can't find them: a
 * run that doesn't name them in `only` leaves them as they are instead of
 * failing.
 */
const OPTIONAL_TARGETS: CopiedTarget[] = ["veggie-trades", "farm"];
export type BuildTarget = CategoryName | "items" | CopiedTarget;
export const BUILD_TARGETS: BuildTarget[] = [...CATEGORY_NAMES, "items", ...COPIED_TARGETS];

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

/** Item stats (rarity, carry limit, price, icon, colour) written into `data/items.json`. */
export interface ItemsBuildReport {
  changes: ItemStatChange[];
  /** Committed items the disc has no entry for, left as they were. */
  missing: { id: number; name: string }[];
  filesWritten: string[];
}

export interface BuildDataReport {
  categories: CategoryBuildReport[];
  items: ItemsBuildReport | null;
  /** Files copied from the disc (quests, gathering points, shops, combinations), relative to `data/`. */
  copiedFiles: string[];
  /** Optional files the extract doesn't have, left as they are in `data/`. */
  skippedFiles: string[];
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
 * An item entry under its game name (`data/items.json`). `extract` names
 * items from the `ItemID` enum, which only differs from `items.json` on a
 * few Japanese promo tickets.
 */
function itemRenamer(site: SiteIndex) {
  return <T extends QuestItem>(entry: T): T => {
    const id = discMaterialId(entry.item);
    const name = id === null ? undefined : site.items.get(id)?.name;
    return name && name !== entry.item ? { ...entry, item: name } : entry;
  };
}

/** Writes each quest supply and reward item under its game name. */
export function nameQuestItems(content: unknown, site: SiteIndex): unknown {
  const rename = itemRenamer(site);
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

interface GatheringDoc {
  layouts?: { areas: { nodes: { items: QuestItem[] }[] }[] }[];
}

/** Writes each gathering point's items under their game names. */
export function nameGatheringItems(content: unknown, site: SiteIndex): unknown {
  const rename = itemRenamer(site);
  const doc = content as GatheringDoc;
  if (!Array.isArray(doc?.layouts)) return content;
  return {
    ...doc,
    layouts: doc.layouts.map((layout) => ({
      ...layout,
      areas: layout.areas.map((area) => ({
        ...area,
        nodes: area.nodes.map((node) => ({ ...node, items: node.items.map(rename) })),
      })),
    })),
  };
}

/** Writes each shop item under its game name. */
export function nameShopItems(content: unknown, site: SiteIndex): unknown {
  const rename = itemRenamer(site);
  const doc = content as { shops?: { items: QuestItem[] }[] };
  if (!Array.isArray(doc?.shops)) return content;
  return {
    ...doc,
    shops: doc.shops.map((shop) => ({ ...shop, items: shop.items.map(rename) })),
  };
}

/** Writes each Veggie Elder trade's items under their game names. */
export function nameVeggieTradeItems(content: unknown, site: SiteIndex): unknown {
  const rename = itemRenamer(site);
  const name = (item: string) => rename({ item }).item;
  const doc = content as { elders?: { trades: Record<"give" | "common" | "rare", string>[] }[] };
  if (!Array.isArray(doc?.elders)) return content;
  return {
    ...doc,
    elders: doc.elders.map((elder) => ({
      ...elder,
      trades: elder.trades.map((t) => ({
        give: name(t.give),
        common: name(t.common),
        rare: name(t.rare),
      })),
    })),
  };
}

/** Writes each Pokke Farm point's items under their game names. */
export function nameFarmItems(content: unknown, site: SiteIndex): unknown {
  const rename = itemRenamer(site);
  const doc = content as { points?: { items: QuestItem[] }[] };
  if (!Array.isArray(doc?.points)) return content;
  return {
    ...doc,
    points: doc.points.map((point) => ({ ...point, items: point.items.map(rename) })),
  };
}

interface ItemRef {
  id: number;
  name: string;
}

/**
 * Names every item in a `combinations.json` by its ID in
 * `data/items.json`; `extract` names them from the `ItemID` enum.
 */
export function nameCombinationItems(content: unknown, site: SiteIndex): unknown {
  const rename = (ref: ItemRef): ItemRef => {
    const name = site.items.get(ref.id)?.name;
    return name && name !== ref.name ? { ...ref, name } : ref;
  };
  const doc = content as { books?: ItemRef[]; combinations?: Record<string, unknown>[] };
  if (!Array.isArray(doc?.combinations)) return content;
  return {
    ...doc,
    books: (doc.books ?? []).map(rename),
    combinations: doc.combinations.map((c) => ({
      ...c,
      result: rename(c.result as ItemRef),
      ingredients: (c.ingredients as ItemRef[]).map(rename),
    })),
  };
}

/** Each copied target's files (relative to the extracted and `data/` directories) and renamer. */
async function copiedFiles(
  target: CopiedTarget,
  extractedDir: string,
): Promise<{ files: string[]; name: (content: unknown, site: SiteIndex) => unknown }> {
  if (target === "gathering") return { files: ["gathering.json"], name: nameGatheringItems };
  if (target === "shops") return { files: ["shops.json"], name: nameShopItems };
  if (target === "veggie-trades")
    return { files: ["veggie-trades.json"], name: nameVeggieTradeItems };
  if (target === "farm") return { files: ["farm.json"], name: nameFarmItems };
  if (target === "combinations")
    return { files: ["combinations.json"], name: nameCombinationItems };
  const from = path.join(extractedDir, "quests");
  const files = (await readdir(from)).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0)
    throw new Error(`${from} has no quest files; rerun extract with DATA.BIN unpacked`);
  return { files: files.map((f) => path.join("quests", f)), name: nameQuestItems };
}

/** Writes the disc's item stats into `data/items.json`. */
async function buildItems(options: BuildDataOptions): Promise<ItemsBuildReport> {
  const source = await readJsonOrNull(path.join(options.extracted, "items.json"));
  if (!source) throw new Error(`items.json is missing from ${options.extracted}; rerun extract`);
  const { items, colors } = source as { items: EmittedItem[]; colors?: string[] };
  const merged = mergeItemStats(readData(options.data, "items.json"), items, colors);
  const filesWritten = writeData(options.data, "items.json", merged.content, {
    dryRun: options.dryRun,
  });
  return { changes: merged.changes, missing: merged.missing, filesWritten };
}

async function copyTarget(
  target: CopiedTarget,
  options: BuildDataOptions,
  skipped: string[],
): Promise<string[]> {
  const { files, name } = await copiedFiles(target, options.extracted);
  const site = loadSiteIndex(options.data);
  const optional = OPTIONAL_TARGETS.includes(target) && !options.only?.includes(target);
  const written: string[] = [];
  for (const rel of files) {
    const source = await readJsonOrNull(path.join(options.extracted, rel));
    if (!source && optional) {
      skipped.push(rel);
      continue;
    }
    if (!source) throw new Error(`${rel} is missing from ${options.extracted}; rerun extract`);
    writeData(options.data, rel, name(source, site), { dryRun: options.dryRun });
    written.push(rel);
  }
  return written;
}

/** Merges each equipment category into its committed files. */
async function buildCategories(
  categoryNames: CategoryName[],
  options: BuildDataOptions,
): Promise<CategoryBuildReport[]> {
  if (categoryNames.length === 0) return [];
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
      // build-data rewrites committed files; it doesn't create new ones.
      if (!existsSync(path.join(options.data, file))) continue;
      const original = readData<Record<string, unknown>>(options.data, file);
      const written = writeData(
        options.data,
        file,
        { ...original, [category.arrayKey]: items },
        { dryRun: options.dryRun },
      );
      filesWritten.push(...written.filter((f) => !filesWritten.includes(f)));
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

  return categories;
}

/**
 * Copies each of `targets`' disc files into `data/`. An optional target
 * (`OPTIONAL_TARGETS`) that the extract lacks is skipped unless
 * `options.only` names it; any other missing file is an error.
 */
export async function copyTargets(
  targets: readonly BuildTarget[],
  options: BuildDataOptions,
): Promise<{ copied: string[]; skipped: string[] }> {
  const copied: string[] = [];
  const skipped: string[] = [];
  for (const target of COPIED_TARGETS) {
    if (targets.includes(target)) copied.push(...(await copyTarget(target, options, skipped)));
  }
  return { copied, skipped };
}

export async function runBuildData(options: BuildDataOptions): Promise<BuildDataReport> {
  const targets = options.only ?? BUILD_TARGETS;
  const categoryNames = targets.filter(
    (t): t is CategoryName => t !== "items" && !COPIED_TARGETS.includes(t as CopiedTarget),
  );
  const categories = await buildCategories(categoryNames, options);
  const items = targets.includes("items") ? await buildItems(options) : null;
  const { copied, skipped } = await copyTargets(targets, options);
  const report: BuildDataReport = {
    categories,
    items,
    copiedFiles: copied,
    skippedFiles: skipped,
  };
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
  if (report.items) {
    const { changes, missing, filesWritten } = report.items;
    const added = changes.filter((c) => c.before === undefined).length;
    console.log(
      `items: ${added} stat(s) added, ${changes.length - added} changed; ${verb} ${filesWritten.length} file(s).`,
    );
    if (missing.length > 0)
      console.log(
        `  ${missing.length} committed item(s) with no disc entry, left as-is: ${missing
          .slice(0, 8)
          .map((m) => m.name)
          .join(", ")}${missing.length > 8 ? ", ..." : ""}`,
      );
  }
  if (report.copiedFiles.length > 0)
    console.log(`copied from the disc: ${verb} ${report.copiedFiles.join(", ")}`);
  if (report.skippedFiles.length > 0)
    console.warn(
      `not in the extract, left as they are: ${report.skippedFiles.join(", ")} (rerun extract to update them)`,
    );
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
  if (report.items) {
    const { changes, missing } = report.items;
    const added = changes.filter((c) => c.before === undefined);
    const changed = changes.filter((c) => c.before !== undefined);
    out.push("## items", "");
    const byField = (list: ItemStatChange[]) =>
      ["rarity", "carry", "price"].map((f) => `${f} ${list.filter((c) => c.field === f).length}`);
    out.push(
      `${added.length} stat(s) added (${byField(added).join(", ")}), ${changed.length} changed by the disc.`,
      "",
    );
    if (changed.length > 0) {
      out.push("| ID | item | field | site (before) | disc (after) |", "|---|---|---|---|---|");
      for (const c of changed)
        out.push(`| ${c.id} | ${cell(c.name)} | ${c.field} | ${c.before} | ${c.after} |`);
      out.push("");
    }
    if (missing.length > 0) {
      out.push(`### Items with no disc entry (${missing.length}, unchanged)`, "");
      for (const m of missing) out.push(`- ${m.name} (ID ${m.id})`);
      out.push("");
    }
  }
  if (report.copiedFiles.length > 0)
    out.push(
      "## Copied from the disc",
      "",
      `${report.copiedFiles.length} file(s): quests, gathering points, shops, combinations, Veggie Elder trades and Pokke Farm.`,
      "",
      ...report.copiedFiles.map((f) => `- ${f}`),
      "",
    );
  if (report.skippedFiles.length > 0)
    out.push(
      "## Not in the extract",
      "",
      "Left as they are; rerun extract to update them.",
      "",
      ...report.skippedFiles.map((f) => `- ${f}`),
      "",
    );
  return out.join("\n");
}
