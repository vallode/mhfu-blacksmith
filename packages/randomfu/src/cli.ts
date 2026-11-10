#!/usr/bin/env node
/**
 * randomfu CLI. See README.md and `tsx src/cli.ts help`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDiscImage } from "mhfu-extract/src/container/image.js";
import { ebootInfo } from "./eboot-info.js";
import { loadGame } from "./game/load.js";
import { randomSeed } from "./rng.js";
import { runRandomizer } from "./run.js";
import {
  OPTIONS,
  applySettings,
  decodeSettings,
  defaultSettings,
  parseAssignments,
  settingsFromJson,
  settingsToJson,
  type OptionKey,
  type Settings,
} from "./settings.js";
import { LOGIC_VERSION } from "./version.js";
import { roundTrip } from "./write.js";

const BOOLEAN_FLAGS = new Set(["dry-run", "force", "no-open"]);

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

/** `--shuffles` names, kept from before settings files existed. */
const SHUFFLE_FLAGS: Record<string, OptionKey> = {
  "quest-rewards": "questRewards.enabled",
  "monster-rewards": "monsterRewards.enabled",
  recipes: "recipes.materials",
  "recipe-amounts": "recipes.amounts",
  costs: "costs.enabled",
  weapons: "weapons.enabled",
  armor: "armor.enabled",
  "armor-skills": "armorSkills.enabled",
  shops: "shops.enabled",
  gathering: "gathering.enabled",
};

/** Shorthand flags for single settings. */
const SETTING_FLAGS: Record<string, OptionKey> = {
  "amount-spread": "recipes.amountSpread",
  "cost-spread": "costs.spread",
  "weapon-mix": "weapons.mix",
  tiers: "logic.tiers",
};

/**
 * Settings from flags, later ones winning: defaults, `--settings` file,
 * `--settings-string`, `--shuffles`, shorthand flags, `--set`, `--seed`.
 */
export function settingsFromFlags(flags: Record<string, string>): Settings {
  let settings = defaultSettings(randomSeed());
  if (flags.settings)
    settings = settingsFromJson(readFileSync(flags.settings, "utf-8"), settings.seed);
  if (flags["settings-string"]) {
    const decoded = decodeSettings(flags["settings-string"]);
    if (decoded.version !== LOGIC_VERSION) {
      console.warn(
        `Warning: this settings string was made with logic v${decoded.version}; this is v${LOGIC_VERSION}, so the same seed gives a different game.`,
      );
    }
    settings = decoded.settings;
  }
  if (flags.shuffles) {
    const changes: Record<string, boolean> = {};
    for (const key of Object.values(SHUFFLE_FLAGS)) changes[key] = false;
    for (const name of flags.shuffles
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      const key = SHUFFLE_FLAGS[name];
      if (!key) {
        throw new Error(
          `Unknown shuffle "${name}" (expected ${Object.keys(SHUFFLE_FLAGS).join(", ")})`,
        );
      }
      changes[key] = true;
    }
    settings = applySettings(settings, changes);
  }
  for (const [flag, key] of Object.entries(SETTING_FLAGS)) {
    if (flags[flag] !== undefined) settings = applySettings(settings, { [key]: flags[flag] });
  }
  if (flags.set) settings = applySettings(settings, parseAssignments(flags.set));
  if (flags.seed) settings = applySettings(settings, { seed: flags.seed });
  return settings;
}

const USAGE = `Usage:
  randomize --iso <in.iso|in.cso> --out <out.iso> [settings] [--spoiler <path>]
            [--eboot <decrypted EBOOT>] [--pspdecrypt-bin <name>] [--force]
  randomize --iso <in> --dry-run [settings]         print the spoiler log, write nothing
  roundtrip --iso <in>                              check files re-encrypt to the disc's bytes
  eboot-info --iso <in> [--eboot <dump>]            how the disc's EBOOT decrypts (vs a dump)
  gui [--port <n>] [--no-open]                      open the settings page in a browser
  settings [--write <file.json>]                    list every setting, or write the defaults
  shop-scan --iso <in> [--eboot <dump>] [--out <report.txt>]
                                                    research: look for the shops' item lists
  shop-lists --iso <in> [--out <report.txt>]        research: map the shop lists in lobby_task.ovl

Settings (later ones win):
  --settings <file.json>       any subset of settings (see "settings")
  --settings-string <RF...>    a shared settings string, seed included
  --shuffles <list>            turn on exactly these: ${Object.keys(SHUFFLE_FLAGS).join(", ")}
  --tiers star|rank|none       --amount-spread <0-0.95>   --cost-spread <0-0.95>
  --weapon-mix same-type|any-type
  --set key=value,key=value    any setting by name
  --seed <seed>`;

function printSettings(): void {
  let section = "";
  for (const option of OPTIONS) {
    if (option.section !== section) {
      section = option.section;
      console.log(`\n${section}`);
    }
    const type = option.type;
    const values =
      type.kind === "boolean"
        ? "true|false"
        : type.kind === "number"
          ? `${type.min}-${type.max}`
          : type.choices.map((c) => c.value).join("|");
    console.log(`  ${option.key} = ${String(option.default)}   (${values})`);
    console.log(`      ${option.label}. ${option.help}`);
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
    case "randomize": {
      const dryRun = flags["dry-run"] === "true";
      const result = await runRandomizer(
        {
          iso: requireFlag(flags, "iso"),
          out: dryRun ? null : requireFlag(flags, "out"),
          settings: settingsFromFlags(flags),
          eboot: flags.eboot,
          pspdecryptBin: flags["pspdecrypt-bin"],
          spoiler: flags.spoiler,
          force: flags.force === "true",
        },
        (line) => console.log(line),
      );
      if (!result.spoilerPath) process.stdout.write(result.spoiler);
      return;
    }
    case "roundtrip":
      return runRoundTrip(flags);
    case "eboot-info":
      for (const line of ebootInfo(requireFlag(flags, "iso"), flags.eboot)) console.log(line);
      return;
    case "gui": {
      const { startGui } = await import("./gui/server.js");
      await startGui({
        port: flags.port ? Number(flags.port) : 0,
        open: flags["no-open"] !== "true",
      });
      return;
    }
    case "shop-scan": {
      const { formatShopScan, runShopScan } = await import("./research/shop-scan.js");
      const candidates = await runShopScan(requireFlag(flags, "iso"), flags.eboot, (l) =>
        console.log(l),
      );
      const report = formatShopScan(candidates);
      if (flags.out) {
        writeFileSync(flags.out, `${report}\n`, "utf-8");
        writeFileSync(
          flags.out.replace(/(\.txt)?$/, ".json"),
          `${JSON.stringify(candidates, null, 1)}\n`,
          "utf-8",
        );
        console.log(`Wrote ${flags.out} and the full candidate list as JSON next to it.`);
      } else {
        console.log(report);
      }
      return;
    }
    case "shop-lists": {
      const { formatShopLists, runShopLists } = await import("./research/shop-lists.js");
      const report = formatShopLists(await runShopLists(requireFlag(flags, "iso")));
      if (flags.out) {
        writeFileSync(flags.out, `${report}\n`, "utf-8");
        console.log(`Wrote ${flags.out}`);
      } else {
        console.log(report);
      }
      return;
    }
    case "settings":
      if (flags.write) {
        writeFileSync(flags.write, settingsToJson(defaultSettings("MYSEED")), "utf-8");
        console.log(`Wrote ${flags.write}`);
      } else {
        printSettings();
      }
      return;
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
