/**
 * Running Whetstone end to end over a disc image: load, apply the mods,
 * write, check, and format the log of what went in. Every write is kept in
 * memory over the user's image (`OverlaySource`), and the finished image
 * comes back as ranges of the original plus the changed bytes, so nothing is
 * copied and the original is never touched. The web app's worker runs this.
 * Progress goes to `log`.
 */
import type { RandomAccessSource } from "mhfu-extract/src/container/source.js";
import { OverlaySource, PatchableImage, type ImageSegment } from "./disc/image.js";
import { loadGame, type GameData } from "./game/load.js";
import { applyMods, type ModsResult } from "./mods.js";
import { reportLogLine } from "./report.js";
import {
  describeWhetstoneSettings,
  encodeWhetstoneSettings,
  type WhetstoneSettings,
} from "./settings.js";
import { WHETSTONE_VERSION } from "./version.js";
import { Edits } from "./edits.js";
import { writeEdits } from "./write.js";

export type Log = (line: string) => void;

export interface RunOptions {
  /** The log only: nothing is written. */
  dryRun?: boolean;
  /** For testing in game: a happy Poogie always gives the rarest reward. */
  poogieTest?: boolean;
  /** Prototype: the code loader with its demo blob (see `docs/code-loader.md`). */
  loaderDemo?: boolean;
}

export interface RunResult {
  /** What went in, as a text file: the settings, then each mod's notes. */
  report: string;
  /** The finished image; null for a dry run. */
  segments: ImageSegment[] | null;
}

/** The log of what went in: settings, then each mod's notes and changes. */
export function formatReport(
  game: GameData,
  settings: WhetstoneSettings,
  result: ModsResult,
): string {
  const out: string[] = [
    "Whetstone log",
    "",
    `Settings: ${encodeWhetstoneSettings(settings)}`,
    `Disc:     ${game.discId} (${game.region})`,
    `Version:  v${WHETSTONE_VERSION}`,
    "",
    ...describeWhetstoneSettings(settings).map((line) => `  ${line}`),
    "",
  ];
  for (const report of result.reports) {
    out.push(`== ${report.title} ==`, "");
    for (const note of report.notes) out.push(`  ${note}`);
    out.push("");
    let where = "";
    for (const line of report.lines) {
      if (line.where !== where) {
        where = line.where;
        out.push(where);
      }
      out.push(`  ${line.text}`);
    }
    out.push("");
  }
  return out.join("\n");
}

export async function runWhetstone(
  source: RandomAccessSource,
  settings: WhetstoneSettings,
  options: RunOptions,
  log: Log,
): Promise<RunResult> {
  const overlay = new OverlaySource(source);
  const image = new PatchableImage(overlay);
  log("Reading the disc...");
  const game = await loadGame(overlay, image.iso);
  log(`${game.discId} (${game.region}).`);
  if (game.monsterNamesProblem) log(`Warning: ${game.monsterNamesProblem}`);
  log(`Settings string: ${encodeWhetstoneSettings(settings)}`);
  for (const line of describeWhetstoneSettings(settings)) log(`  ${line}`);

  const edits = new Edits(game);
  const result = applyMods(game, edits, settings, {
    poogieTest: options.poogieTest,
    loaderDemo: options.loaderDemo,
  });
  // Testing options that only show once applied (the loader can be skipped).
  for (const line of result.testing) log(line);
  for (const report of result.reports) log(reportLogLine(report));

  let segments: ImageSegment[] | null = null;
  if (!options.dryRun) {
    const summary = writeEdits(image, game, edits);
    log(
      `Changed ${summary.files} DATA.BIN files${summary.discFiles ? `, added ${summary.discFiles} disc file${summary.discFiles === 1 ? "" : "s"}` : ""}; EBOOT ${summary.eboot}. Read-back check passed.`,
    );
    segments = overlay.segments();
  }
  const report = [...result.testing, formatReport(game, settings, result)].join("\n");
  return { report, segments };
}
