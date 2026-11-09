#!/usr/bin/env node
/**
 * randomfu CLI. See README.md.
 *
 *   tsx src/cli.ts randomize --iso <in> --out <out.iso> [--seed <seed>] [--shuffles <list>]
 *                            [--amount-spread <0-1>] [--cost-spread <0-1>] [--spoiler <path>]
 *                            [--eboot <decrypted EBOOT>] [--pspdecrypt-bin <name>] [--dry-run] [--force]
 *   tsx src/cli.ts roundtrip --iso <in>
 */
import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDiscImage } from "../../mhfu-extract/src/container/image.js";
import { copyAsIso, PatchableImage } from "./disc/image.js";
import { loadGame, type EbootOptions } from "./game/load.js";
import {
  DEFAULT_SHUFFLES,
  DEFAULT_SPREAD,
  EBOOT_SHUFFLES,
  SHUFFLES,
  parseShuffles,
  parseSpread,
  randomize,
  type Settings,
} from "./randomize.js";
import { randomSeed } from "./rng.js";
import { formatSpoiler } from "./spoiler.js";
import { roundTrip, writeEdits } from "./write.js";

const BOOLEAN_FLAGS = new Set(["dry-run", "force"]);

export function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument "${arg}"`);
    const key = arg.slice(2);
    if (BOOLEAN_FLAGS.has(key)) {
      flags[key] = "true";
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`Missing value for --${key}`);
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
  randomize --iso <in.iso|in.cso> --out <out.iso> [--seed <seed>] [--shuffles ${SHUFFLES.join(",")}]
            [--amount-spread <0-1>] [--cost-spread <0-1>] [--spoiler <path>]
            [--eboot <decrypted EBOOT>] [--pspdecrypt-bin <name>] [--dry-run] [--force]
  roundtrip --iso <in.iso|in.cso>

Default shuffles: ${DEFAULT_SHUFFLES.join(", ")}. ${EBOOT_SHUFFLES.join(", ")} also need the
decrypted EBOOT (pspdecrypt on PATH, or --eboot). Spreads default to ${DEFAULT_SPREAD} (50% to 150%).`;

async function runRandomize(flags: Record<string, string>): Promise<void> {
  const input = requireFlag(flags, "iso");
  const dryRun = flags["dry-run"] === "true";
  const output = dryRun ? null : requireFlag(flags, "out");
  const settings: Settings = {
    seed: flags.seed ?? randomSeed(),
    shuffles: flags.shuffles ? parseShuffles(flags.shuffles) : DEFAULT_SHUFFLES,
    amountSpread: flags["amount-spread"]
      ? parseSpread(flags["amount-spread"], "amount-spread")
      : DEFAULT_SPREAD,
    costSpread: flags["cost-spread"]
      ? parseSpread(flags["cost-spread"], "cost-spread")
      : DEFAULT_SPREAD,
  };
  const eboot: EbootOptions | null = settings.shuffles.some((s) => EBOOT_SHUFFLES.includes(s))
    ? { overridePath: flags.eboot, pspdecryptBin: flags["pspdecrypt-bin"] }
    : null;

  if (output) {
    if (path.resolve(output) === path.resolve(input))
      throw new Error("--out must differ from --iso");
    if (existsSync(output) && flags.force !== "true") {
      throw new Error(`${output} already exists (pass --force to overwrite it)`);
    }
    console.log(`Copying ${input} to ${output}...`);
    copyAsIso(input, output);
  }

  // Read from the copy when there is one, so the same file is read and patched.
  const image = output ? new PatchableImage(output) : null;
  const opened = image ? null : openDiscImage(input);
  let finished = false;
  try {
    const source = image?.source ?? opened!.source;
    const iso = image?.iso ?? opened!.iso;
    const game = await loadGame(source, iso, { eboot });
    console.log(
      `${game.discId} (${game.region}): ${game.quests.length} quests, ${game.skippedQuests.length} skipped.`,
    );
    console.log(`Seed ${settings.seed}; shuffling ${settings.shuffles.join(", ") || "nothing"}.`);

    const result = randomize(game, settings);
    for (const report of result.reports)
      console.log(`  ${report.title}: ${report.lines.length} slots`);
    if (result.problems.length > 0) {
      console.warn(
        `Warning: ${result.problems.length} recipe materials moved up a rank; see the spoiler log.`,
      );
    }

    if (image) {
      const summary = writeEdits(image, game, result.edits);
      console.log(
        `Wrote ${summary.quests} quests and ${summary.files} other DATA.BIN files; EBOOT ${summary.eboot}. Read-back check passed.`,
      );
    }

    const spoilerPath =
      flags.spoiler ?? (output ? output.replace(/\.iso$/i, "") + ".spoiler.txt" : null);
    const spoiler = formatSpoiler(game, settings, result);
    if (spoilerPath) {
      writeFileSync(spoilerPath, spoiler, "utf-8");
      console.log(`Wrote ${spoilerPath}`);
    } else {
      process.stdout.write(spoiler);
    }
    if (output) console.log(`Done: ${output}`);
    finished = true;
  } finally {
    image?.close();
    opened?.source.close();
    // Don't leave a half-patched image behind.
    if (output && !finished) rmSync(output, { force: true });
  }
}

async function runRoundTrip(flags: Record<string, string>): Promise<void> {
  const { source, iso } = openDiscImage(requireFlag(flags, "iso"));
  try {
    const game = await loadGame(source, iso, { eboot: null });
    console.log(
      `${game.discId} (${game.region}): ${game.quests.length} quests, ${game.skippedQuests.length} skipped.`,
    );
    const result = roundTrip(game, (offset, length) => source.read(offset, length));
    if (result.mismatches.length > 0) {
      console.error(
        `${result.mismatches.length} of ${result.checked} files don't re-encrypt to the disc's bytes:`,
      );
      for (const m of result.mismatches.slice(0, 20)) console.error(`  ${m}`);
      process.exitCode = 1;
      return;
    }
    console.log(`All ${result.checked} files re-encrypt to the disc's exact bytes.`);
  } finally {
    source.close();
  }
}

export async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  switch (command) {
    case "randomize":
      return runRandomize(flags);
    case "roundtrip":
      return runRoundTrip(flags);
    default:
      console.log(USAGE);
      if (command !== undefined && command !== "help") process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
