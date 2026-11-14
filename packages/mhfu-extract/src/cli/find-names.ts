/**
 * `find-names` subcommand: searches an `unpack`ed disc for the name string
 * tables (strings/name-search.ts) and reports every candidate, so a real
 * run can be pasted back and the tables pinned. See README, "Localized
 * text".
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { elfLoadSegments } from "../container/elf.js";
import { OVL_HEADER_SIZE } from "../container/ovl.js";
import { MHP2G_PROFILE } from "../games/mhp2g.js";
import { BinaryReader } from "../binary/reader.js";
import {
  confidenceProblem,
  failedResult,
  settleByFileLanguage,
  FileIndex,
  searchNameTable,
  SEARCHED_TABLES,
  type EnglishTable,
  type LanguageTable,
  type NameTableResult,
  type ScanFile,
} from "../strings/name-search.js";
import type { NameTable } from "../strings/names.js";
import { JP_BASE_ADDRESS } from "../tables/offsets.js";
import { sharpnessVaddrBase } from "../tables/sharpness.js";
import { assertCurrentFileNames, type UnpackManifest } from "./unpack.js";

export interface FindNamesOptions {
  unpacked: string;
  /** Report path; defaults to `<unpacked>/find-names.json`. */
  out?: string;
  /** Scan every DATA.BIN file, not just the likely ones. */
  all?: boolean;
  /** Only these tables (comma-separated `NameTable`s). */
  tables?: string;
}

/**
 * DATA.BIN folders that hold models, sound, movies, quests and textures,
 * skipped unless `--all`. Everything else (overlays, `message_jpn/`, the
 * EU-only `_unindexed/` entries, `system/`, ...) is scanned.
 */
const SKIPPED_DIRS = new Set([
  "player",
  "weapon",
  "sound",
  "emmodel",
  "movie",
  "stage",
  "mission_jpn",
  "motion",
  "cockpit",
  "npc",
]);
const MAX_FILE = 16 * 1024 * 1024;

const hex = (n: number): string => `${n < 0 ? "-" : ""}0x${Math.abs(n).toString(16)}`;

async function* walk(dir: string, rel = ""): AsyncGenerator<string> {
  for (const entry of (await readdir(path.join(dir, rel), { withFileTypes: true })).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) yield* walk(dir, child);
    else yield child;
  }
}

/** The EBOOT's candidate bases: ELF segments, the JP base, and EU's sharpness-calibrated one. */
function ebootBases(buf: Buffer, manifest: UnpackManifest): number[] {
  const bases = new Set(elfLoadSegments(buf).map((s) => s.base));
  bases.add(JP_BASE_ADDRESS);
  try {
    const resolver = MHP2G_PROFILE.resolverForRegion(manifest.region);
    if (resolver)
      bases.add(sharpnessVaddrBase(resolver.resolve("sharpnessTable", buf), new BinaryReader(buf)));
  } catch {
    // No sharpness table on this region's resolver; the vote doesn't need it.
  }
  return [...bases];
}

/** Reads the manifest, rejecting stale or EBOOT-less unpacks. */
export async function readManifest(unpacked: string): Promise<UnpackManifest> {
  const manifest: UnpackManifest = JSON.parse(
    await readFile(path.join(unpacked, "manifest.json"), "utf-8"),
  );
  assertCurrentFileNames(manifest, unpacked);
  return manifest;
}

/** The files the name search reads: the EBOOT and every DATA.BIN file outside `SKIPPED_DIRS` (all of them with `all`). */
export async function loadScanFiles(
  unpacked: string,
  manifest: UnpackManifest,
  all = false,
): Promise<ScanFile[]> {
  const files: ScanFile[] = [];
  if (manifest.eboot !== false) {
    const buf = await readFile(path.join(unpacked, "eboot.bin"));
    files.push({ name: "eboot.bin", buf, bases: ebootBases(buf, manifest) });
  }
  const dataBin = path.join(unpacked, "data-bin");
  for await (const rel of walk(dataBin)) {
    if (!all && SKIPPED_DIRS.has(rel.split("/")[0]!)) continue;
    const full = path.join(dataBin, rel);
    if ((await stat(full)).size > MAX_FILE) continue;
    const buf = await readFile(full);
    const mwo3 = buf.length > OVL_HEADER_SIZE && buf.toString("latin1", 0, 4) === "MWo3";
    files.push({ name: `data-bin/${rel}`, buf, bases: mwo3 ? [buf.readUInt32LE(8)] : [] });
  }
  return files;
}

/** Runs the search over `files` for `tables`, logging progress. */
export function searchAll(files: ScanFile[], tables: readonly NameTable[]): NameTableResult[] {
  const indexes = files.map((f) => new FileIndex(f));
  const results = tables.map((table) => {
    const started = Date.now();
    const seconds = () => ((Date.now() - started) / 1000).toFixed(1);
    try {
      const result = searchNameTable(table, indexes);
      console.log(`  ${table}: ${seconds()}s`);
      return result;
    } catch (err) {
      // One table's failure shouldn't lose the others' results.
      const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
      console.log(`  ${table}: failed after ${seconds()}s`);
      return failedResult(table, message);
    }
  });
  settleByFileLanguage(results);
  return results;
}

/** Entry indices shown side by side: spread over the table, plus a few with non-ASCII text. */
export function sampleIndices(result: NameTableResult, count = 8): number[] {
  const english = result.english[0];
  if (!english) return [];
  const named = english.texts.map((t, i) => (t ? i : -1)).filter((i) => i > 0);
  const picked = new Set<number>();
  for (let k = 0; k < count && named.length; k++)
    picked.add(named[Math.floor((k * named.length) / count)]!);
  const accented = named.filter((i) =>
    result.languages.some((l) => /[^\x20-\x7e]/.test(l.texts[i] ?? "")),
  );
  for (const i of accented.slice(0, 4)) picked.add(i);
  return [...picked].sort((a, b) => a - b);
}

const englishJson = (t: EnglishTable) => ({
  file: t.file,
  offset: hex(t.offset),
  address: hex(t.offset + t.base),
  stride: t.stride,
  base: hex(t.base),
  matchRatio: t.matchRatio,
  exact: t.exact,
  close: t.close,
  considered: t.considered,
  mismatches: t.mismatches,
});

const languageJson = (
  t: LanguageTable,
  english: EnglishTable,
  samples: number[],
  written: LanguageTable[],
) => ({
  file: t.file,
  offset: hex(t.offset),
  address: hex(t.offset + t.base),
  stride: t.stride,
  base: hex(t.base),
  via: t.via,
  valid: t.valid,
  identical: t.identical,
  lengthCorrelation: t.lengthCorrelation,
  markerAgreement: t.markerAgreement,
  alignment: t.alignment,
  encoding: t.encoding,
  language: t.guess,
  notWrittenBecause: written.includes(t)
    ? null
    : (confidenceProblem(english, t) ?? "another table was written for its language"),
  samples: samples.map((i) => [i, english.texts[i] ?? null, t.texts[i] ?? null]),
});

/** A result as report JSON: addresses in hex, string arrays cut down to samples. */
export function resultJson(result: NameTableResult) {
  const samples = sampleIndices(result);
  const best = result.english[0];
  return {
    table: result.table,
    enumCount: result.enumCount,
    confident: Object.fromEntries(
      Object.entries(result.confident).map(([lang, t]) => [lang, `${t.file} @${hex(t.offset)}`]),
    ),
    notes: result.notes,
    clusters: result.clusters.slice(0, 5).map((c) => ({
      ...c,
      densest: { from: hex(c.densest.from), to: hex(c.densest.to), names: c.densest.names },
    })),
    bases: result.bases.slice(0, 8).map((b) => ({ ...b, base: hex(b.base) })),
    english: result.english.map(englishJson),
    languages: best
      ? result.languages.map((l) => languageJson(l, best, samples, Object.values(result.confident)))
      : [],
  };
}

const cut = (s: string | null | undefined, width: number): string => {
  const text = (s ?? "-").replace(/\n/g, "\\n");
  return ([...text].length > width ? `${[...text].slice(0, width - 1).join("")}…` : text).padEnd(
    width,
  );
};

/** The console summary: per table, the English table, each candidate, and samples side by side. */
export function printNameSummary(results: NameTableResult[]): void {
  for (const r of results) {
    console.log(`\n${r.table} (${r.enumCount} enum names)`);
    const c = r.clusters[0];
    if (c) {
      console.log(
        `  Strings: ${c.names} names in ${c.file}, densest ${c.densest.names} at ${hex(c.densest.from)}-${hex(c.densest.to)}, ${Math.round(c.inEnumOrder * 100)}% in enum order` +
          (r.clusters.length > 1 ? ` (also in ${r.clusters.length - 1} other file(s))` : ""),
      );
    }
    const e = r.english[0];
    if (!e) {
      for (const n of r.notes) console.log(`  ${n}`);
      continue;
    }
    console.log(
      `  English: ${e.file} @${hex(e.offset)} (address ${hex(e.offset + e.base)}), stride ${e.stride}, base ${hex(e.base)}: ` +
        `${(e.matchRatio * 100).toFixed(1)}% match (${e.exact} exact, ${e.close} close of ${e.considered})`,
    );
    for (const m of e.mismatches.slice(0, 3))
      console.log(`    #${m.index}: enum "${m.expected}", disc "${m.found ?? "(none)"}"`);
    const shown = r.languages.slice(0, 5);
    shown.forEach((l, k) => {
      const lang = l.guess.language ?? "?";
      const writes = Object.values(r.confident).includes(l) ? ` -> writes ${lang}` : "";
      const why = writes ? "" : ` (not written: ${confidenceProblem(e, l)})`;
      console.log(
        `  [${k + 1}] ${l.file} @${hex(l.offset)} base ${hex(l.base)}, ${l.via}\n` +
          `      ${lang} (confidence ${l.guess.confidence}), ${l.encoding.encoding}, valid ${l.valid}, alignment ${l.alignment} ` +
          `(lengths r=${l.lengthCorrelation}, markers ${l.markerAgreement ?? "-"}), identical ${l.identical}${writes}${why}`,
      );
      if (l.encoding.encoding === "unknown-8bit" || l.encoding.encoding === "latin1") {
        for (const h of l.encoding.highBytes.slice(0, 6))
          console.log(`      byte ${h.byte} x${h.count}: ${h.sample}`);
      }
    });
    const samples = sampleIndices(r);
    if (samples.length && shown.length) {
      console.log(
        `      #    ${cut("English", 22)} ${shown.map((_, k) => cut(`[${k + 1}]`, 22)).join(" ")}`,
      );
      for (const i of samples) {
        console.log(
          `  ${String(i).padStart(5)}    ${cut(e.texts[i], 22)} ${shown.map((l) => cut(l.texts[i], 22)).join(" ")}`,
        );
      }
    }
    for (const n of r.notes) console.log(`  Note: ${n}`);
  }
}

/** Parses `--tables`; every name must be a searched table. */
export function parseTables(value: string | undefined): NameTable[] {
  if (!value) return [...SEARCHED_TABLES];
  const tables = value.split(",").filter(Boolean);
  for (const t of tables) {
    if (!SEARCHED_TABLES.includes(t as NameTable))
      throw new Error(`--tables: unknown table "${t}" (one of ${SEARCHED_TABLES.join(", ")})`);
  }
  return tables as NameTable[];
}

export async function runFindNames(options: FindNamesOptions): Promise<NameTableResult[]> {
  const manifest = await readManifest(options.unpacked);
  const files = await loadScanFiles(options.unpacked, manifest, options.all);
  const size = files.reduce((n, f) => n + f.buf.length, 0);
  console.log(
    `Searching ${files.length} files (${(size / 1048576).toFixed(1)} MiB, ${manifest.region.toUpperCase()} disc ${manifest.discId}) for name tables...`,
  );
  const results = searchAll(files, parseTables(options.tables));
  printNameSummary(results);
  const report = {
    region: manifest.region,
    discId: manifest.discId,
    generatedAt: new Date().toISOString(),
    files: files.map((f) => ({
      name: f.name,
      length: f.buf.length,
      bases: (f.bases ?? []).map(hex),
    })),
    tables: results.map(resultJson),
  };
  const out = options.out ?? path.join(options.unpacked, "find-names.json");
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  console.log(`\nWrote ${out}`);
  return results;
}
