#!/usr/bin/env node
/**
 * mhfu-extract CLI entrypoint. See README's "Usage" section.
 *
 *   tsx src/cli.ts unpack  --iso <path> --out <dir> [--eboot <path> | --skip-eboot] [--pspdecrypt-bin <name>]
 *   tsx src/cli.ts extract --unpacked <dir> --out <dir>
 *   tsx src/cli.ts diff    --extracted <dir> --data <dir> [--out <path>]
 */
import { fileURLToPath } from "node:url";
import { printDiffSummary, runDiff } from "./cli/diff.js";
import { runExtract } from "./cli/extract.js";
import { runUnpack } from "./cli/unpack.js";

/** Flags that take no value; present means `"true"`. */
const BOOLEAN_FLAGS = new Set(["skip-eboot"]);

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
  tsx src/cli.ts diff    --extracted <dir> --data <dir> [--out <path>]`;

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
    case "extract": {
      const manifest = await runExtract({
        unpacked: requireFlag(flags, "unpacked"),
        out: requireFlag(flags, "out"),
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
