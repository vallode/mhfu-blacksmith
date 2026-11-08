#!/usr/bin/env node
/**
 * mhfu-extract CLI entrypoint. See README's "Usage" section.
 *
 *   tsx src/cli.ts unpack  --iso <path> --out <dir> [--eboot <path> | --skip-eboot] [--pspdecrypt-bin <name>]
 *   tsx src/cli.ts extract --unpacked <dir> --out <dir>
 *   tsx src/cli.ts diff    --extracted <dir> --data <dir> [--out <path>]
 *   tsx src/cli.ts models  --in <file.pac|dir> --out <dir>
 *   tsx src/cli.ts export-site --unpacked <dir> [--data <dir>] [--out <dir>] [--lossless]
 */
import { fileURLToPath } from "node:url";
import { printDiffSummary, runDiff } from "./cli/diff.js";
import { runExportSite } from "./cli/export-site.js";
import { runExtract } from "./cli/extract.js";
import { runModels } from "./cli/models.js";
import { runUnpack } from "./cli/unpack.js";

/** Flags that take no value; present means `"true"`. */
const BOOLEAN_FLAGS = new Set(["skip-eboot", "lossless"]);

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
  tsx src/cli.ts extract --unpacked <dir> --out <dir>
  tsx src/cli.ts diff    --extracted <dir> --data <dir> [--out <path>]
  tsx src/cli.ts models  --in <file.pac|dir> --out <dir>
  tsx src/cli.ts export-site --unpacked <dir> [--data <dir>] [--out <dir>] [--lossless]`;

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
      console.log(`\nDone. Region: ${manifest.region}, ${manifest.fileCount} DATA.BIN entries unpacked.`);
      return;
    }
    case "extract": {
      const manifest = await runExtract({
        unpacked: requireFlag(flags, "unpacked"),
        out: requireFlag(flags, "out"),
      });
      console.log(`\nDone. Parsed ${manifest.questsParsed} quests (${manifest.questsSkipped.length} skipped).`);
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
      const results = await runModels({ in: requireFlag(flags, "in"), out: requireFlag(flags, "out") });
      const converted = results.filter((result) => !result.error).length;
      console.log(`\nDone. Converted ${converted} of ${results.length} packages.`);
      return;
    }
    case "export-site": {
      const manifest = await runExportSite({
        unpacked: requireFlag(flags, "unpacked"),
        data: flags.data ?? "../../data",
        out: flags.out ?? "../../public/models",
        lossless: flags.lossless === "true",
      });
      console.log(`\nDone. Manifest: ${Object.keys(manifest.monsters).length} monsters, ${Object.keys(manifest.weapons).length} weapons, ${Object.keys(manifest.armor).length} armor pieces.`);
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
