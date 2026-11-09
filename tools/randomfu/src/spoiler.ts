/**
 * The spoiler log: settings, then every changed slot grouped by where it
 * is, then the tier randomfu found each item at.
 */
import type { GameData } from "./game/load.js";
import { tierKey, tierLabel, tierOrder, type Tier } from "./game/tiers.js";
import { itemName } from "./names.js";
import { LOGIC_VERSION, type RandomizeResult } from "./randomize.js";
import { describeSettings, encodeSettings, type Settings } from "./settings.js";

export function formatSpoiler(game: GameData, settings: Settings, result: RandomizeResult): string {
  const out: string[] = [
    "randomfu spoiler log",
    "",
    `Seed:     ${settings.seed}`,
    `Settings: ${encodeSettings(settings)}`,
    `Disc:     ${game.discId} (${game.region})`,
    `Logic:    v${LOGIC_VERSION}`,
    "",
    ...describeSettings(settings).map((line) => `  ${line}`),
    "",
  ];
  if (result.problems.length > 0) {
    out.push("PROBLEMS (recipe materials that moved to a later star level):");
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

  const { sources } = result;
  out.push("== Where items are first found ==", "");
  out.push(
    "  The earliest rank and star level of a Village or Guild quest that rewards the item,",
    "  has a monster that gives it, or has a gathering point with it, before shuffling.",
    "  Shuffles only move items within these tiers.",
    `  Gathering points were read in ${sources.gatheringQuests} quests.`,
  );
  if (sources.gatheringProblems.length > 0) {
    out.push(`  Gathering points that couldn't be read (${sources.gatheringProblems.length}):`);
    for (const p of sources.gatheringProblems.slice(0, 20)) out.push(`    ${p}`);
  }
  out.push("");
  const byTier = new Map<string, { tier: Tier; items: string[] }>();
  for (const [itemId, tier] of sources.tiers) {
    const key = tierKey(tier);
    const entry = byTier.get(key) ?? { tier, items: [] };
    entry.items.push(itemName(itemId));
    byTier.set(key, entry);
  }
  for (const { tier, items } of [...byTier.values()].sort(
    (a, b) => tierOrder(a.tier) - tierOrder(b.tier),
  )) {
    out.push(`${tierLabel(tier)} (${items.length})`);
    out.push(`  ${items.sort().join(", ")}`);
  }
  return `${out.join("\n")}\n`;
}
