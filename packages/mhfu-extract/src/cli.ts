#!/usr/bin/env node
/**
 * mhfu-extract CLI entrypoint. See README's "Usage" section.
 *
 *   tsx src/cli.ts unpack  --iso <path> --out <dir> [--eboot <path> | --skip-eboot] [--pspdecrypt-bin <name>]
 *   tsx src/cli.ts extract --unpacked <dir> --out <dir> [--raw]
 *   tsx src/cli.ts diff    --extracted <dir> --data <dir> [--out <path>]
 *   tsx src/cli.ts models  --in <file.pac|dir> --out <dir>
 *   tsx src/cli.ts export-site --unpacked <dir> [--data <dir>] [--out <dir>] [--lossless]
 *   tsx src/cli.ts compare --extracted <dir> --data <dir> [--only <categories>] [--out <path>] [--markdown <path>]
 *   tsx src/cli.ts build-data --extracted <dir> --data <dir> [--only <targets>] [--report <path>] [--markdown <path>] [--dry-run]
 *   tsx src/cli.ts quest-flags --unpacked <dir> [--out <path>]
 *   tsx src/cli.ts find-names --unpacked <dir> [--out <path>] [--tables <list>] [--all]
 *   tsx src/cli.ts locales --unpacked <dir> [--data <dir>] [--out <dir>] [--skip-names] [--all] [--slots <map>] [--report <path>] [--dry-run]
 */
import { fileURLToPath } from "node:url";
import { parseTargets, printBuildSummary, runBuildData } from "./cli/build-data.js";
import { parseCategories, runCompare } from "./cli/compare.js";
import { printDiffSummary, runDiff } from "./cli/diff.js";
import { runExportSite } from "./cli/export-site.js";
import { runExtract } from "./cli/extract.js";
import { runFindNames } from "./cli/find-names.js";
import { runLocales } from "./cli/locales.js";
import { runModels } from "./cli/models.js";
import { runQuestFlags } from "./cli/quest-flags.js";
import { runQuestTextScan } from "./cli/quest-text-scan.js";
import { runMessages } from "./cli/messages.js";
import { readFile, writeFile } from "node:fs/promises";
import { runUnpack } from "./cli/unpack.js";
import { probeQuests, sizeTsv } from "./emit/quest-probe.js";
import type { QuestRawEntry } from "./emit/quests-raw.js";

/** Flags that take no value; present means `"true"`. */
const BOOLEAN_FLAGS = new Set(["skip-eboot", "lossless", "dry-run", "raw", "skip-names", "all"]);

/** Minimal `--flag value` parser — no `=` form; flags in BOOLEAN_FLAGS take no value. */
export function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      flags[key] = "true";
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    flags[key] = value;
    i++;
  }
  return flags;
}

function requireFlag(flags: Record<string, string>, name: string): string {
  const value = flags[name];
  if (!value) throw new Error(`Missing required flag --${name}`);
  return value;
}

const USAGE = `Usage:
  tsx src/cli.ts unpack  --iso <path> --out <dir> [--eboot <path> | --skip-eboot] [--pspdecrypt-bin <name>]
  tsx src/cli.ts extract --unpacked <dir> --out <dir> [--raw]
  tsx src/cli.ts diff    --extracted <dir> --data <dir> [--out <path>]
  tsx src/cli.ts models  --in <file.pac|dir> --out <dir>
  tsx src/cli.ts export-site --unpacked <dir> [--data <dir>] [--out <dir>] [--lossless]
  tsx src/cli.ts compare --extracted <dir> --data <dir> [--only armor,weapons,decorations,monsters] [--out <path>] [--markdown <path>]
  tsx src/cli.ts build-data --extracted <dir> --data <dir> [--only armor,weapons,decorations,monsters,quests] [--report <path>] [--markdown <path>] [--dry-run]
  tsx src/cli.ts quest-flags --unpacked <dir> [--out <path>]
  tsx src/cli.ts find-names --unpacked <dir> [--out <path>] [--tables ItemID,emID,...] [--all]
  tsx src/cli.ts locales --unpacked <dir> [--data <dir>] [--out <dir>] [--skip-names] [--all] [--slots spa=es,...] [--report <path>] [--dry-run]
  tsx src/cli.ts quest-probe --quests <raw/quests.json> [--tsv <path>]
  tsx src/cli.ts quest-text-scan --unpacked <dir> --quest <id> [--out <path>]
  tsx src/cli.ts messages --unpacked <dir> --file <index> [--grep <word>] [--table <n> [--from <i>] [--count <n>]]`;

export async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);

  switch (command) {
    case "unpack": {
      const manifest = await runUnpack({
        iso: requireFlag(flags, "iso"),
        out: requireFlag(flags, "out"),
        eboot: flags.eboot,
        skipEboot: flags["skip-eboot"] === "true",
        pspdecryptBin: flags["pspdecrypt-bin"],
      });
      console.log(
        `\nDone. Region: ${manifest.region}, ${manifest.fileCount} DATA.BIN entries unpacked.`,
      );
      return;
    }
    case "messages": {
      const num = (name: string) => (flags[name] === undefined ? undefined : Number(flags[name]));
      process.stdout.write(
        await runMessages({
          unpacked: requireFlag(flags, "unpacked"),
          file: Number(requireFlag(flags, "file")),
          grep: flags.grep,
          table: num("table"),
          from: num("from"),
          count: num("count"),
        }),
      );
      return;
    }
    case "quest-text-scan": {
      const out = await runQuestTextScan({
        unpacked: requireFlag(flags, "unpacked"),
        questId: Number(requireFlag(flags, "quest")),
        out: flags.out,
      });
      console.log(`\nWrote ${out}`);
      return;
    }
    case "quest-probe": {
      const entries = JSON.parse(
        await readFile(requireFlag(flags, "quests"), "utf8"),
      ) as QuestRawEntry[];
      process.stdout.write(probeQuests(entries));
      if (flags.tsv) {
        await writeFile(flags.tsv, sizeTsv(entries));
        console.log(`\nWrote ${flags.tsv}`);
      }
      return;
    }
    case "extract": {
      const manifest = await runExtract({
        unpacked: requireFlag(flags, "unpacked"),
        out: requireFlag(flags, "out"),
        raw: flags.raw === "true",
      });
      console.log(
        `\nDone. Parsed ${manifest.questsParsed} quests (${manifest.questsSkipped.length} skipped).`,
      );
      return;
    }
    case "diff": {
      const report = await runDiff({
        extracted: requireFlag(flags, "extracted"),
        data: requireFlag(flags, "data"),
        out: flags.out,
      });
      printDiffSummary(report);
      return;
    }
    case "models": {
      const results = await runModels({
        in: requireFlag(flags, "in"),
        out: requireFlag(flags, "out"),
      });
      const converted = results.filter((result) => !result.error).length;
      console.log(`\nDone. Converted ${converted} of ${results.length} packages.`);
      return;
    }
    case "export-site": {
      const manifest = await runExportSite({
        unpacked: requireFlag(flags, "unpacked"),
        data: flags.data ?? "../../data",
        out: flags.out ?? "../../apps/blacksmith/public/models",
        lossless: flags.lossless === "true",
      });
      const count = (record: Record<string, Record<string, unknown>>) =>
        Object.values(record).reduce((sum, r) => sum + Object.keys(r).length, 0);
      console.log(
        `\nDone. Manifest: ${Object.keys(manifest.monsters).length} monsters, ${count(manifest.weapons)} weapons, ${count(manifest.armor)} armor pieces.`,
      );
      return;
    }
    case "compare": {
      await runCompare({
        extracted: requireFlag(flags, "extracted"),
        data: requireFlag(flags, "data"),
        only: parseCategories(flags.only),
        out: flags.out,
        markdown: flags.markdown,
      });
      return;
    }
    case "build-data": {
      const dryRun = flags["dry-run"] === "true";
      const report = await runBuildData({
        extracted: requireFlag(flags, "extracted"),
        data: requireFlag(flags, "data"),
        only: parseTargets(flags.only),
        report: flags.report,
        markdown: flags.markdown,
        dryRun,
      });
      printBuildSummary(report, dryRun);
      return;
    }
    case "quest-flags": {
      await runQuestFlags({ unpacked: requireFlag(flags, "unpacked"), out: flags.out });
      return;
    }
    case "find-names": {
      await runFindNames({
        unpacked: requireFlag(flags, "unpacked"),
        out: flags.out,
        all: flags.all === "true",
        tables: flags.tables,
      });
      return;
    }
    case "locales": {
      await runLocales({
        unpacked: requireFlag(flags, "unpacked"),
        data: flags.data ?? "../../data",
        out: flags.out,
        skipNames: flags["skip-names"] === "true",
        all: flags.all === "true",
        slots: flags.slots,
        report: flags.report,
        dryRun: flags["dry-run"] === "true",
      });
      return;
    }
    default:
      throw new Error(`Unknown command "${command ?? "(none)"}".\n\n${USAGE}`);
  }
}

// Only auto-run when executed directly (`tsx src/cli.ts ...`), not when
// imported for testing.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
