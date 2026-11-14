/**
 * `diff` subcommand — compares an `extract`-produced directory against the
 * repo's committed `data/` directory, matching items by `name` (or `id` for
 * quests, which don't have one) and reporting field-level value
 * disagreements for keys present on *both* sides.
 *
 * Keys present on only one side are counted separately, not treated as
 * mismatches: several emit modules deliberately omit fields they can't
 * derive yet (see each emit module's "Known gaps" notes in the README), so
 * a raw deep-equal would drown real disagreements in expected
 * incompleteness. This tool surfaces value *disagreements* on fields both
 * sides actually populate, which is what's actually useful for catching a
 * wrong offset/derivation.
 *
 * Committed `skills` are rewritten to the extractor's skill spelling before
 * comparing (`normalizeCommittedItem`, via `overlay/skill-name-aliases.ts`).
 * The extractor's names are canonical. The site's legacy spellings (e.g.
 * `"Defence"` for `"Defense"`) are not, and a spelling difference alone is
 * not a value disagreement.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalDecorationSkill, canonicalSkillName } from "../overlay/skill-name-aliases.js";
import { readData } from "game-data";

export interface DiffOptions {
  extracted: string;
  data: string;
  /** Optional path to write the full machine-readable report to (in addition to the printed summary). */
  out?: string;
}

export interface FieldMismatch {
  itemKey: string;
  field: string;
  extracted: unknown;
  committed: unknown;
}

export interface FileDiff {
  file: string;
  itemsOnlyInExtracted: string[];
  itemsOnlyInCommitted: string[];
  fieldMismatches: FieldMismatch[];
}

export interface DiffReport {
  filesOnlyInExtracted: string[];
  filesOnlyInCommitted: string[];
  files: FileDiff[];
}

async function listJsonFiles(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(subDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(path.join(rootDir, subDir), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = path.join(subDir, entry.name);
      if (entry.isDirectory()) await walk(rel);
      else if (entry.name.endsWith(".json")) out.push(rel);
    }
  }
  await walk("");
  return out.sort();
}

/** Identifies an item across the two sides — `name` for equipment/monsters, falling back to a numeric `id` (quests don't have a name). */
export function itemKeyOf(item: Record<string, unknown>): string {
  if (typeof item.name === "string") return item.name;
  if (typeof item.id === "number") return `#${item.id}`;
  return JSON.stringify(item).slice(0, 60);
}

/**
 * Returns a copy of a committed item with its `skills` rewritten to the
 * extractor's spelling. Handles both committed shapes: armor's
 * `{ name, amount }[]` and decorations' `"Name +N"` strings. Items without
 * a `skills` array are returned as-is.
 */
export function normalizeCommittedItem(item: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(item.skills)) return item;
  const skills = item.skills.map((skill: unknown) => {
    if (typeof skill === "string") return canonicalDecorationSkill(skill);
    if (
      typeof skill === "object" &&
      skill !== null &&
      typeof (skill as { name?: unknown }).name === "string"
    ) {
      const s = skill as { name: string };
      return { ...s, name: canonicalSkillName(s.name) };
    }
    return skill;
  });
  return { ...item, skills };
}

function findArrayKey(obj: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) return key;
  }
  return null;
}

/** Diffs one file's `{ <arrayKey>: [...] }` shape, matching items by itemKeyOf(). Returns an empty-result diff if either side isn't array-shaped. */
export function diffFile(file: string, extracted: unknown, committed: unknown): FileDiff {
  const result: FileDiff = {
    file,
    itemsOnlyInExtracted: [],
    itemsOnlyInCommitted: [],
    fieldMismatches: [],
  };
  if (
    typeof extracted !== "object" ||
    extracted === null ||
    typeof committed !== "object" ||
    committed === null
  ) {
    return result;
  }

  const extractedArrayKey = findArrayKey(extracted as Record<string, unknown>);
  const committedArrayKey = findArrayKey(committed as Record<string, unknown>);
  if (!extractedArrayKey || !committedArrayKey) return result;

  const extractedItems = (extracted as Record<string, unknown>)[extractedArrayKey] as Record<
    string,
    unknown
  >[];
  const committedItems = (
    (committed as Record<string, unknown>)[committedArrayKey] as Record<string, unknown>[]
  ).map(normalizeCommittedItem);

  const committedByKey = new Map(committedItems.map((item) => [itemKeyOf(item), item]));
  const matchedCommittedKeys = new Set<string>();

  for (const extractedItem of extractedItems) {
    const key = itemKeyOf(extractedItem);
    const committedItem = committedByKey.get(key);
    if (!committedItem) {
      result.itemsOnlyInExtracted.push(key);
      continue;
    }
    matchedCommittedKeys.add(key);
    for (const field of Object.keys(extractedItem)) {
      if (!(field in committedItem)) continue; // extra field the emit module adds beyond what's committed today — not a mismatch
      const extractedValue = extractedItem[field];
      const committedValue = committedItem[field];
      if (JSON.stringify(extractedValue) !== JSON.stringify(committedValue)) {
        result.fieldMismatches.push({
          itemKey: key,
          field,
          extracted: extractedValue,
          committed: committedValue,
        });
      }
    }
  }

  for (const key of committedByKey.keys()) {
    if (!matchedCommittedKeys.has(key)) result.itemsOnlyInCommitted.push(key);
  }
  return result;
}

export async function runDiff(options: DiffOptions): Promise<DiffReport> {
  const extractedFiles = await listJsonFiles(options.extracted);
  const committedFiles = (await listJsonFiles(options.data)).filter(
    (f) => !f.startsWith(`schemas${path.sep}`),
  );

  const extractedSet = new Set(extractedFiles);
  const committedSet = new Set(committedFiles);

  const filesOnlyInExtracted = extractedFiles.filter(
    (f) => !committedSet.has(f) && f !== "EXTRACTION.json",
  );
  const filesOnlyInCommitted = committedFiles.filter((f) => !extractedSet.has(f));

  const shared = extractedFiles.filter((f) => committedSet.has(f));
  const files: FileDiff[] = [];
  for (const file of shared) {
    const extracted = JSON.parse(await readFile(path.join(options.extracted, file), "utf-8"));
    const committed = readData(options.data, file);
    files.push(diffFile(file, extracted, committed));
  }

  const report: DiffReport = { filesOnlyInExtracted, filesOnlyInCommitted, files };
  if (options.out) {
    await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  }
  return report;
}

export function printDiffSummary(report: DiffReport): void {
  if (report.filesOnlyInExtracted.length > 0) {
    console.log(`Files only in extracted output (${report.filesOnlyInExtracted.length}):`);
    for (const f of report.filesOnlyInExtracted) console.log(`  + ${f}`);
  }
  if (report.filesOnlyInCommitted.length > 0) {
    console.log(`Files only in committed data/ (${report.filesOnlyInCommitted.length}):`);
    for (const f of report.filesOnlyInCommitted) console.log(`  - ${f}`);
  }

  let anyFileDiffs = false;
  for (const file of report.files) {
    const total =
      file.itemsOnlyInExtracted.length +
      file.itemsOnlyInCommitted.length +
      file.fieldMismatches.length;
    if (total === 0) continue;
    anyFileDiffs = true;
    console.log(`\n${file.file}:`);
    if (file.itemsOnlyInExtracted.length > 0) {
      console.log(
        `  ${file.itemsOnlyInExtracted.length} item(s) only in extracted output: ${file.itemsOnlyInExtracted.slice(0, 5).join(", ")}${file.itemsOnlyInExtracted.length > 5 ? ", ..." : ""}`,
      );
    }
    if (file.itemsOnlyInCommitted.length > 0) {
      console.log(
        `  ${file.itemsOnlyInCommitted.length} item(s) only in committed data: ${file.itemsOnlyInCommitted.slice(0, 5).join(", ")}${file.itemsOnlyInCommitted.length > 5 ? ", ..." : ""}`,
      );
    }
    if (file.fieldMismatches.length > 0) {
      console.log(`  ${file.fieldMismatches.length} field mismatch(es), e.g.:`);
      for (const m of file.fieldMismatches.slice(0, 5)) {
        console.log(
          `    ${m.itemKey}.${m.field}: extracted=${JSON.stringify(m.extracted)} committed=${JSON.stringify(m.committed)}`,
        );
      }
    }
  }

  if (
    !anyFileDiffs &&
    report.filesOnlyInExtracted.length === 0 &&
    report.filesOnlyInCommitted.length === 0
  ) {
    console.log("No differences found.");
  }
}
