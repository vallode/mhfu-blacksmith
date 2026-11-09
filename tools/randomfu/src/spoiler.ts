/** The spoiler log: settings, then every changed slot grouped by where it is. */
import type { GameData } from "./game/load.js";
import { LOGIC_VERSION, type RandomizeResult, type Settings } from "./randomize.js";

export function formatSpoiler(game: GameData, settings: Settings, result: RandomizeResult): string {
  const out: string[] = [
    "randomfu spoiler log",
    "",
    `Seed:     ${settings.seed}`,
    `Shuffles: ${settings.shuffles.join(", ") || "none"}`,
    `Disc:     ${game.discId} (${game.region})`,
    `Logic:    v${LOGIC_VERSION}`,
    "",
  ];
  if (result.problems.length > 0) {
    out.push("PROBLEMS (recipes whose materials moved up a rank):");
    for (const p of result.problems) out.push(`  ${p}`);
    out.push("");
  }
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
  return `${out.join("\n")}\n`;
}
