/**
 * `locales` subcommand: writes `data/locales/<code>.json` for every
 * language found on an `unpack`ed disc. See README, "Localized text".
 *
 * - Quest board text from every `LangPTRs` slot (locales/quests.ts): German,
 *   French, Spanish and Italian on the EU disc, Japanese on the JP disc.
 * - Names from the name table search (strings/name-search.ts), only for
 *   tables and languages that pass its confidence checks; `find-names`
 *   shows the rest.
 *
 * Existing files are merged: sections this run didn't produce are kept.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  loadLocaleSchema,
  LOCALE_CODES,
  mergeLocale,
  serializeLocale,
  sourceLabel,
  validateLocale,
  type LocaleCode,
  type LocaleFile,
  type ProducedLocale,
} from "../locales/file.js";
import { loadSiteKeys, nameSections } from "../locales/names.js";
import {
  EU_SLOT_LOCALES,
  parseSlotMap,
  questLocales,
  type QuestSlotReport,
} from "../locales/quests.js";
import { LANGUAGE_NAMES } from "../strings/language.js";
import { translatedNames, type NameTableResult } from "../strings/name-search.js";
import type { NameTable } from "../strings/names.js";
import { readQuestsFromUnpackedDir } from "./extract.js";
import {
  loadScanFiles,
  parseTables,
  printNameSummary,
  readManifest,
  resultJson,
  searchAll,
} from "./find-names.js";

export interface LocalesOptions {
  unpacked: string;
  /** The repo's `data/` directory (for the site's names and the schema). */
  data: string;
  /** Where the locale files go; defaults to `<data>/locales`. */
  out?: string;
  /** Don't search for name tables (quest text only). */
  skipNames?: boolean;
  /** Scan every DATA.BIN file for name tables (see `find-names --all`). */
  all?: boolean;
  /** `--slots`: EU quest slot -> locale, e.g. `ger=de,fre=fr,spa=es,ita=it`. */
  slots?: string;
  /** Write a JSON report (slot checks and the name search) here. */
  report?: string;
  /** Print what would be written without writing. */
  dryRun?: boolean;
}

export interface LocalesResult {
  written: Partial<Record<LocaleCode, { quests: number; names: Record<string, number> }>>;
  slots: QuestSlotReport[];
}

function printSlots(slots: QuestSlotReport[]): void {
  console.log("\nQuest text slots:");
  for (const s of slots) {
    const g = s.guess;
    const guess = g.language
      ? `${g.language} (confidence ${g.confidence}; ${g.evidence.slice(0, 3).join(", ")})`
      : "no guess";
    const target = s.locale
      ? `-> ${s.locale}`
      : s.skipped
        ? `SKIPPED: ${s.skipped}`
        : "(English, not written)";
    console.log(
      `  ${s.slot.padEnd(5)} expected ${s.expected}, reads as ${guess}\n` +
        `        ${s.quests} quests, ${s.translated} with text that differs from English ` +
        `(${s.identicalFields} fields identical, ${s.placeholderFields} placeholders, ${s.invalidUtf8Fields} not UTF-8) ${target}`,
    );
    if (s.locale && g.language && g.language !== s.expected) {
      console.log(
        `        WARNING: expected ${LANGUAGE_NAMES[s.expected]} but the text reads more like ${LANGUAGE_NAMES[g.language]}; written anyway (low confidence). Check the samples.`,
      );
    }
  }
}

export async function runLocales(options: LocalesOptions): Promise<LocalesResult> {
  const manifest = await readManifest(options.unpacked);
  const outDir = options.out ?? path.join(options.data, "locales");
  const source = sourceLabel(manifest.region, manifest.discId, new Date());

  console.log(`Reading quests (${manifest.region.toUpperCase()} disc ${manifest.discId})...`);
  const { quests, skipped } = await readQuestsFromUnpackedDir(options.unpacked, manifest.region);
  console.log(`Parsed ${quests.length} quests, skipped ${skipped.length}.`);
  const questResult = questLocales(
    quests,
    manifest.region,
    options.slots ? parseSlotMap(options.slots) : EU_SLOT_LOCALES,
  );
  printSlots(questResult.slots);

  const produced: Partial<Record<LocaleCode, ProducedLocale>> = {};
  for (const [code, section] of Object.entries(questResult.sections) as [
    LocaleCode,
    ProducedLocale["quest"],
  ][]) {
    produced[code] = { names: {}, quest: section };
  }

  let nameResults: NameTableResult[] = [];
  if (options.skipNames) {
    console.log("\nSkipping the name table search (--skip-names).");
  } else if (manifest.eboot === false) {
    console.log("\nSkipping the name table search: unpacked with --skip-eboot.");
  } else {
    const files = await loadScanFiles(options.unpacked, manifest, options.all);
    console.log(`\nSearching ${files.length} files for name tables...`);
    nameResults = searchAll(files, parseTables(undefined));
    printNameSummary(nameResults);
    const keys = loadSiteKeys(options.data);
    for (const code of LOCALE_CODES) {
      const translations: Partial<Record<NameTable, (string | null)[]>> = {};
      for (const r of nameResults) {
        const texts = translatedNames(r, code);
        if (texts) translations[r.table] = texts;
      }
      if (Object.keys(translations).length === 0) continue;
      const sections = nameSections(translations, keys);
      for (const c of sections.conflicts.slice(0, 10)) console.log(`  ${code} conflict: ${c}`);
      (produced[code] ??= { names: {} }).names = sections.names;
    }
  }

  const schema = await loadLocaleSchema(options.data);
  const written: LocalesResult["written"] = {};
  console.log("");
  for (const code of LOCALE_CODES) {
    const p = produced[code];
    if (!p || (!p.quest && Object.keys(p.names).length === 0)) continue;
    const file = path.join(outDir, `${code}.json`);
    let existing: LocaleFile | null = null;
    try {
      existing = JSON.parse(await readFile(file, "utf-8")) as LocaleFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const merged = mergeLocale(code, existing, p, source);
    const errors = validateLocale(merged, schema);
    if (errors.length) {
      throw new Error(
        `${code}.json doesn't match locale.schema.json:\n  ${errors.slice(0, 10).join("\n  ")}`,
      );
    }
    const names = Object.fromEntries(
      Object.entries(p.names).map(([k, v]) => [k, Object.keys(v).length]),
    );
    written[code] = { quests: Object.keys(p.quest ?? {}).length, names };
    const what = [
      p.quest ? `${Object.keys(p.quest).length} quests` : null,
      ...Object.entries(names).map(([k, n]) => `${n} ${k} names`),
    ]
      .filter(Boolean)
      .join(", ");
    if (options.dryRun) {
      console.log(`Would write ${file}: ${what}`);
      continue;
    }
    await mkdir(outDir, { recursive: true });
    await writeFile(file, serializeLocale(merged), "utf-8");
    console.log(`Wrote ${file}: ${what} (other sections kept)`);
  }
  if (Object.keys(written).length === 0) console.log("No locale text found; nothing written.");

  if (options.report) {
    const report = {
      region: manifest.region,
      discId: manifest.discId,
      source,
      slots: questResult.slots,
      names: nameResults.map(resultJson),
    };
    await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
    console.log(`Wrote ${options.report}`);
  }
  return { written, slots: questResult.slots };
}
