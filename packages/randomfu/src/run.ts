/**
 * Running the randomizer end to end, for the CLI and the GUI: copy the
 * image, load, randomize, write, check, write the spoiler log. Progress
 * goes to `log`.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { detectRegion, parseSfo } from "mhfu-extract/src/container/sfo.js";
import { copyAsIso, openPatchableImage } from "./disc/node-file.js";
import { loadGame } from "./game/load.js";
import { randomize } from "./randomize.js";
import { describeSettings, encodeSettings, needsEboot, type Settings } from "./settings.js";
import { formatSpoiler } from "./spoiler.js";
import { writeEdits } from "./write.js";

export type Log = (line: string) => void;

export interface RunOptions {
  iso: string;
  /** Output image; null for a dry run (spoiler only, nothing written). */
  out: string | null;
  settings: Settings;
  /** Decrypted EBOOT dump, for settings that edit the EBOOT. */
  eboot?: string;
  pspdecryptBin?: string;
  /** Spoiler log path. Defaults to next to the output; a dry run returns it only. */
  spoiler?: string;
  force?: boolean;
}

export interface RunResult {
  spoiler: string;
  spoilerPath: string | null;
  problems: string[];
}

export function defaultSpoilerPath(out: string): string {
  return `${out.replace(/\.iso$/i, "")}.spoiler.txt`;
}

export async function runRandomizer(options: RunOptions, log: Log): Promise<RunResult> {
  const { iso: input, out: output, settings } = options;
  const eboot = needsEboot(settings)
    ? { overridePath: options.eboot || undefined, pspdecryptBin: options.pspdecryptBin }
    : null;

  if (output) {
    if (path.resolve(output) === path.resolve(input)) {
      throw new Error("The output must be a different file from the input disc");
    }
    if (existsSync(output) && !options.force) {
      throw new Error(`${output} already exists (allow overwriting to replace it)`);
    }
    log(`Copying ${input} to ${output}...`);
    copyAsIso(input, output);
  }

  // Read from the copy when there is one, so the same file is read and patched.
  const image = output ? openPatchableImage(output) : null;
  const opened = image ? null : openDiscImage(input);
  let finished = false;
  try {
    const source = image?.source ?? opened!.source;
    const iso = image?.iso ?? opened!.iso;
    const game = await loadGame(source, iso, { eboot });
    log(
      `${game.discId} (${game.region}): ${game.quests.length} quests, ${game.skippedQuests.length} skipped.`,
    );
    log(`Seed ${settings.seed}. Settings string: ${encodeSettings(settings)}`);
    for (const line of describeSettings(settings)) log(`  ${line}`);

    const result = randomize(game, settings);
    for (const report of result.reports) log(`${report.title}: ${report.lines.length} slots`);
    if (result.problems.length > 0) {
      log(
        `Warning: ${result.problems.length} recipe materials can't be found as early as before; see the spoiler log.`,
      );
    }

    if (image) {
      const summary = writeEdits(image, game, result.edits);
      log(
        `Wrote ${summary.quests} quests and ${summary.files} other DATA.BIN files; EBOOT ${summary.eboot}. Read-back check passed.`,
      );
    }

    const spoiler = formatSpoiler(game, settings, result);
    const spoilerPath = options.spoiler ?? (output ? defaultSpoilerPath(output) : null);
    if (spoilerPath) {
      writeFileSync(spoilerPath, spoiler, "utf-8");
      log(`Wrote ${spoilerPath}`);
    }
    if (output) log(`Done: ${output}`);
    finished = true;
    return { spoiler, spoilerPath, problems: result.problems };
  } finally {
    image?.close();
    opened?.source.close();
    // Don't leave a half-patched image behind.
    if (output && !finished) rmSync(output, { force: true });
  }
}

export interface DiscCheck {
  discId: string | null;
  region: string | null;
  supported: boolean;
  /** Set when an EBOOT path was given. */
  eboot?: { ok: boolean; detail: string };
}

/** Quick checks for the GUI: is this a supported disc, is this file a decrypted EBOOT. */
export function checkDisc(isoPath: string, ebootPath?: string): DiscCheck {
  const { source, iso } = openDiscImage(isoPath);
  let result: DiscCheck;
  try {
    const { region, discId } = detectRegion(parseSfo(iso.readFile("/PSP_GAME/PARAM.SFO")));
    result = { discId, region, supported: region === "jp" || region === "eu" };
  } finally {
    source.close();
  }
  if (ebootPath) {
    if (!existsSync(ebootPath)) {
      result.eboot = { ok: false, detail: "No file at that path" };
    } else {
      const head = readFileSync(ebootPath).subarray(0, 4);
      const ok = head.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
      result.eboot = {
        ok,
        detail: ok ? "Decrypted EBOOT (ELF)" : "Not a decrypted EBOOT (no ELF header)",
      };
    }
  }
  return result;
}
