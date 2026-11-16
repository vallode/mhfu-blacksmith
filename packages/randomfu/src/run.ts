/**
 * Running the randomizer end to end over a disc image: load, randomize,
 * write, check, and format the spoiler log. Every write is kept in memory
 * over the user's image (`OverlaySource`), and the finished image comes back
 * as ranges of the original plus the changed bytes, so nothing is copied
 * and the original is never touched. The web app's worker runs this.
 * Progress goes to `log`.
 */
import type { RandomAccessSource } from "mhfu-extract/src/container/source.js";
import { OverlaySource, PatchableImage, type ImageSegment } from "./disc/image.js";
import { loadGame } from "./game/load.js";
import { randomize } from "./randomize.js";
import { describeSettings, encodeSettings, type Settings } from "./settings.js";
import { reportLogLine } from "./shuffles/shuffle.js";
import { formatSpoiler } from "./spoiler.js";
import { writeEdits } from "./write.js";

export type Log = (line: string) => void;

export interface RunOptions {
  /** The spoiler log only: nothing is written. */
  dryRun?: boolean;
  /** For testing in game: a happy Poogie always gives the rarest reward. */
  poogieTest?: boolean;
  /** Prototype: the code loader with its demo blob (see `docs/code-loader.md`). */
  loaderDemo?: boolean;
  /** Adds research detail to the spoiler log. */
  debug?: boolean;
}

export interface RunResult {
  spoiler: string;
  problems: string[];
  /** The finished image; null for a dry run. */
  segments: ImageSegment[] | null;
}

export async function runRandomizer(
  source: RandomAccessSource,
  settings: Settings,
  options: RunOptions,
  log: Log,
): Promise<RunResult> {
  // Testing options aren't in the settings string, so the log and spoiler say so.
  const testing = [
    options.poogieTest &&
      "Poogie test: a happy Poogie always gives the rarest reward. This disc is not for play.",
    options.loaderDemo &&
      "Code loader demo: Guild Cards are capped at 3 and every save load adds 1000z. This disc is not for play.",
    options.debug && "Debug: the spoiler log has research detail.",
  ].filter((line): line is string => typeof line === "string");
  for (const line of testing) log(line);

  const overlay = new OverlaySource(source);
  const image = new PatchableImage(overlay);
  log("Reading the disc...");
  // Always loaded: Poogie's luck patches it whatever the settings.
  const game = await loadGame(overlay, image.iso);
  log(
    `${game.discId} (${game.region}): ${game.quests.length} quests, ${game.skippedQuests.length} skipped.`,
  );
  if (game.monsterNamesProblem) log(`Warning: ${game.monsterNamesProblem}`);
  log(`Seed ${settings.seed}. Settings string: ${encodeSettings(settings)}`);
  for (const line of describeSettings(settings)) log(`  ${line}`);

  const result = randomize(game, settings, {
    poogieTest: options.poogieTest,
    loaderDemo: options.loaderDemo,
    debug: options.debug,
  });
  for (const report of result.reports) log(reportLogLine(report));
  if (result.problems.length > 0) {
    log(
      `Warning: ${result.problems.length} recipe materials can't be found as early as before; see the spoiler log.`,
    );
  }

  let segments: ImageSegment[] | null = null;
  if (!options.dryRun) {
    const summary = writeEdits(image, game, result.edits);
    log(
      `Changed ${summary.quests} quests and ${summary.files} other DATA.BIN files${summary.discFiles ? `, added ${summary.discFiles} disc file${summary.discFiles === 1 ? "" : "s"}` : ""}; EBOOT ${summary.eboot}. Read-back check passed.`,
    );
    segments = overlay.segments();
  }
  const spoiler = [...testing, formatSpoiler(game, settings, result)].join("\n");
  return { spoiler, problems: result.problems, segments };
}
