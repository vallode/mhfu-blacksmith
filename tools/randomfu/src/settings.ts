/**
 * Every randomizer option, described once. The CLI, settings files, the
 * shareable settings string and the GUI all work from `OPTIONS`.
 *
 * Settings are a flat object keyed by option (`"recipes.amountSpread"`), so
 * they serialize as they are. A settings string is "RF" plus base64url JSON
 * of the seed, the logic version and every option that isn't its default:
 * with the same disc, it reproduces the same game.
 */
import { LOGIC_VERSION } from "./version.js";

export interface Settings {
  seed: string;
  "logic.tiers": "star" | "rank" | "none";
  "questRewards.enabled": boolean;
  "monsterRewards.enabled": boolean;
  "monsterRewards.captureAndBreaks": boolean;
  "gathering.enabled": boolean;
  "gathering.pool": "gathered" | "rank" | "any";
  "gathering.keepItems": boolean;
  "recipes.materials": boolean;
  "recipes.amounts": boolean;
  "recipes.amountSpread": number;
  "recipes.maxQuantity": number;
  "costs.enabled": boolean;
  "costs.spread": number;
  "weapons.enabled": boolean;
  "weapons.mix": "same-type" | "any-type";
  "armor.enabled": boolean;
  "shops.enabled": boolean;
  "shops.pool": "shop" | "low" | "high" | "any";
  "shops.mix": "each" | "all";
  "shops.keepEssentials": boolean;
  "shops.special": boolean;
  "shops.countSpread": number;
  "shops.prices": boolean;
  "shops.priceSpread": number;
  "shops.stacks": boolean;
  "shops.stackSpread": number;
}

export type OptionKey = Exclude<keyof Settings, "seed">;

export type OptionType =
  | { kind: "boolean" }
  | { kind: "number"; min: number; max: number; step: number; percent?: boolean }
  | { kind: "choice"; choices: { value: string; label: string; help: string }[] };

export interface OptionDef {
  key: OptionKey;
  section: string;
  label: string;
  help: string;
  type: OptionType;
  default: boolean | number | string;
  /** Needs the decrypted EBOOT when on (or, for non-booleans, when `enabledBy` is on). */
  eboot?: boolean;
  /** A boolean option that must be on for this one to matter. */
  enabledBy?: OptionKey;
}

const SPREAD = { kind: "number", min: 0, max: 0.95, step: 0.05, percent: true } as const;

export const OPTIONS: readonly OptionDef[] = [
  {
    key: "logic.tiers",
    section: "Logic",
    label: "Keep items in their place in the game",
    help: "How far an item can move. Shuffles only swap items found first at the same point in the game, so recipes stay craftable as early as before.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "star",
          label: "Same star level",
          help: "Items only move between things first found at the same rank and star level. A 1★ recipe stays makeable at 1★.",
        },
        {
          value: "rank",
          label: "Same rank",
          help: "Items move anywhere within Low, High or G Rank. Early recipes can ask for late Low Rank parts.",
        },
        {
          value: "none",
          label: "Anywhere (chaos)",
          help: "No logic: any item can go anywhere. Recipes may need G Rank parts in Low Rank.",
        },
      ],
    },
    default: "star",
  },
  {
    key: "questRewards.enabled",
    section: "Quest rewards",
    label: "Shuffle quest rewards",
    help: "Items and amounts move between Village and Guild quests; each slot keeps its chance. Training School and Treasure Hunting quests are left alone.",
    type: { kind: "boolean" },
    default: true,
  },
  {
    key: "monsterRewards.enabled",
    section: "Monster rewards",
    label: "Shuffle carves",
    help: "Body, tail and shiny drop items move between monsters; chances stay with each slot.",
    type: { kind: "boolean" },
    default: true,
  },
  {
    key: "monsterRewards.captureAndBreaks",
    section: "Monster rewards",
    label: "Also shuffle capture and break rewards",
    help: "Include capture rewards and part-break rewards in the same pool as carves.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "monsterRewards.enabled",
  },
  {
    key: "gathering.enabled",
    section: "Gathering",
    label: "Shuffle gathering points",
    help: "Items from mining, gathering and bug catching points move between Village and Guild quests (see Logic); each spot keeps its odds. Training School and Treasure Hunting quests are left alone.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "gathering.pool",
    section: "Gathering",
    label: "What gathering points give",
    help: "Where gathering points' items come from.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "gathered",
          label: "Items you could gather",
          help: "The same items, moved between spots at the same point in the game.",
        },
        {
          value: "rank",
          label: "Any item from the same rank",
          help: "A Low Rank quest's spots can give anything first found in Low Rank, monster parts included; likewise High and G Rank.",
        },
        {
          value: "any",
          label: "Any item (chaos)",
          help: "Any item in the game, at any rank.",
        },
      ],
    },
    default: "gathered",
    enabledBy: "gathering.enabled",
  },
  {
    key: "gathering.keepItems",
    section: "Gathering",
    label: "Keep every gatherable item findable",
    help: "With a wider pool, each item you could gather is still at one or more spots at the same point in the game, so recipes stay craftable. The rest of the spots get random items.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "gathering.enabled",
  },
  {
    key: "recipes.materials",
    section: "Crafting",
    label: "Shuffle recipe materials",
    help: "Each crafting and upgrade material is replaced by another (see Logic). Shop, combined and ticket items stay.",
    type: { kind: "boolean" },
    default: false,
    eboot: true,
  },
  {
    key: "recipes.amounts",
    section: "Crafting",
    label: "Randomize material amounts",
    help: "Each amount is rescaled to how many of that material recipes usually ask for, then varied.",
    type: { kind: "boolean" },
    default: false,
    eboot: true,
  },
  {
    key: "recipes.amountSpread",
    section: "Crafting",
    label: "Amount variation",
    help: "How far an amount can move from its usual value, up or down.",
    type: SPREAD,
    default: 0.5,
    enabledBy: "recipes.amounts",
  },
  {
    key: "recipes.maxQuantity",
    section: "Crafting",
    label: "Most of one material",
    help: "The largest amount of a single material a recipe can ask for.",
    type: { kind: "number", min: 1, max: 99, step: 1 },
    default: 99,
    enabledBy: "recipes.amounts",
  },
  {
    key: "costs.enabled",
    section: "Costs",
    label: "Randomize crafting costs",
    help: "Weapon, armor and decoration zenny costs vary, in steps of 10z. A weapon's upgrade cost changes with it.",
    type: { kind: "boolean" },
    default: false,
    eboot: true,
  },
  {
    key: "costs.spread",
    section: "Costs",
    label: "Cost variation",
    help: "How far a cost can move from its usual value, up or down.",
    type: SPREAD,
    default: 0.5,
    enabledBy: "costs.enabled",
  },
  {
    key: "weapons.enabled",
    section: "Weapons",
    label: "Shuffle weapon progression",
    help: "Each place in the smithy gives a different weapon of the same rarity. Places keep their materials and upgrade links; weapons keep their stats and cost.",
    type: { kind: "boolean" },
    default: false,
    eboot: true,
  },
  {
    key: "weapons.mix",
    section: "Weapons",
    label: "Weapon types",
    help: "Whether a place keeps its weapon type.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "same-type",
          label: "Same type",
          help: "A Great Sword place gets another Great Sword.",
        },
        {
          value: "any-type",
          label: "Any type in the family",
          help: "Any Blademaster (or any Gunner) weapon of the same rarity. A Great Sword line can turn into a Hunting Horn line.",
        },
      ],
    },
    default: "same-type",
    enabledBy: "weapons.enabled",
  },
  {
    key: "armor.enabled",
    section: "Armor",
    label: "Shuffle armor progression",
    help: "Each place in the smithy gives a different armor piece for the same slot and rarity, wearable by the same hunters (Blademaster, Gunner or both; male, female or both). Places keep their materials; pieces keep their stats, skills and cost.",
    type: { kind: "boolean" },
    default: false,
    eboot: true,
  },
  {
    key: "shops.enabled",
    section: "Shops",
    label: "Randomize shops",
    help: "Each item a shop sells is replaced by another, the same in every stage of that shop, so later stages still include earlier stock.",
    type: { kind: "boolean" },
    default: false,
  },
  {
    key: "shops.pool",
    section: "Shops",
    label: "What shops can sell",
    help: "Where replacement items come from.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "shop",
          label: "Shop items",
          help: "Only items shops sell anyway, in new places and stages.",
        },
        {
          value: "low",
          label: "Shop items and Low Rank items",
          help: "Also anything first found in Low Rank: herbs, ores, bones, Low Rank monster parts.",
        },
        {
          value: "high",
          label: "Up to High Rank items",
          help: "Also anything first found in High Rank.",
        },
        {
          value: "any",
          label: "Any item (chaos)",
          help: "Any item in the game, G Rank parts and jewels included.",
        },
      ],
    },
    default: "shop",
    enabledBy: "shops.enabled",
  },
  {
    key: "shops.mix",
    section: "Shops",
    label: "Shops share replacements",
    help: "Whether one item is replaced by the same thing in every shop. With shop items only, this also decides whether shops trade stock.",
    type: {
      kind: "choice",
      choices: [
        {
          value: "each",
          label: "Each shop on its own",
          help: "Every shop has its own replacements (shops that share stock lists share them).",
        },
        {
          value: "all",
          label: "All shops together",
          help: "One replacement per item everywhere; with shop items only, granny's herbs can reach the general store.",
        },
      ],
    },
    default: "each",
    enabledBy: "shops.enabled",
  },
  {
    key: "shops.keepEssentials",
    section: "Shops",
    label: "Keep the essentials on sale",
    help: "Potion, Whetstone, pickaxes, bugnets, BBQ Spit, Normal S Lv1/2 and Empty Bottle stay where they are.",
    type: { kind: "boolean" },
    default: true,
    enabledBy: "shops.enabled",
  },
  {
    key: "shops.special",
    section: "Shops",
    label: "Include the sphere and jewel shop",
    help: "Armor Spheres, jewels, Pokke Tickets and Gourmet BBQ Spit. Off keeps armor upgrades as usual.",
    type: { kind: "boolean" },
    default: false,
    enabledBy: "shops.enabled",
  },
  {
    key: "shops.countSpread",
    section: "Shops",
    label: "How many items each shop sells",
    help: "Each shop sells up to this much more or fewer, every stage alike. Above 0, the shop lists are rewritten and the game is pointed at their new places.",
    type: SPREAD,
    default: 0,
    enabledBy: "shops.enabled",
  },
  {
    key: "shops.prices",
    section: "Shops",
    label: "Randomize prices",
    help: "Change the price of everything shops sell. A price is the item's own, so it's the same in every shop.",
    type: { kind: "boolean" },
    default: false,
    eboot: true,
    enabledBy: "shops.enabled",
  },
  {
    key: "shops.priceSpread",
    section: "Shops",
    label: "Price variation",
    help: "How far a price can move, up or down.",
    type: SPREAD,
    default: 0.5,
    enabledBy: "shops.prices",
  },
  {
    key: "shops.stacks",
    section: "Shops",
    label: "Randomize carry limits",
    help: "Change how many of each item you can carry (1 to 99), for everything shops sell. This applies everywhere, not just in shops.",
    type: { kind: "boolean" },
    default: false,
    eboot: true,
    enabledBy: "shops.enabled",
  },
  {
    key: "shops.stackSpread",
    section: "Shops",
    label: "Carry limit variation",
    help: "How far a carry limit can move, up or down.",
    type: SPREAD,
    default: 0.5,
    enabledBy: "shops.stacks",
  },
];

const BY_KEY = new Map(OPTIONS.map((o) => [o.key, o]));

export function defaultSettings(seed: string): Settings {
  const settings: Record<string, unknown> = { seed };
  for (const option of OPTIONS) settings[option.key] = option.default;
  return settings as unknown as Settings;
}

export class SettingsError extends Error {}

/** Checks one value against its option, converting CLI strings ("true", "0.5"). */
export function coerceOption(key: string, value: unknown): Settings[OptionKey] {
  const option = BY_KEY.get(key as OptionKey);
  if (!option) throw new SettingsError(`Unknown setting "${key}"`);
  const type = option.type;
  if (type.kind === "boolean") {
    if (value === true || value === "true" || value === "on") return true;
    if (value === false || value === "false" || value === "off") return false;
    throw new SettingsError(`${key} must be true or false`);
  }
  if (type.kind === "number") {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isFinite(n) || n < type.min || n > type.max) {
      throw new SettingsError(`${key} must be a number from ${type.min} to ${type.max}`);
    }
    return type.step >= 1 ? Math.round(n) : n;
  }
  if (typeof value !== "string" || !type.choices.some((c) => c.value === value)) {
    throw new SettingsError(`${key} must be one of ${type.choices.map((c) => c.value).join(", ")}`);
  }
  return value as Settings[OptionKey];
}

/** `base` with every key in `changes` applied and checked. */
export function applySettings(base: Settings, changes: Record<string, unknown>): Settings {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(changes)) {
    if (key === "seed") {
      if (typeof value !== "string" || value.trim() === "") {
        throw new SettingsError("seed must be a non-empty string");
      }
      out.seed = value.trim();
    } else {
      out[key] = coerceOption(key, value);
    }
  }
  return out as unknown as Settings;
}

/** Parses `key=value,key=value` (the CLI's `--set`). */
export function parseAssignments(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of value.split(",")) {
    if (!part.trim()) continue;
    const eq = part.indexOf("=");
    if (eq === -1) throw new SettingsError(`Expected key=value, got "${part}"`);
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

/** True if any option that needs the decrypted EBOOT is on. */
export function needsEboot(settings: Settings): boolean {
  return OPTIONS.some((o) => o.eboot && settings[o.key] === true && isActive(settings, o));
}

/** True if the option is in effect: its `enabledBy` switch, and that switch's, are on. */
export function isActive(settings: Settings, option: OptionDef): boolean {
  if (!option.enabledBy) return true;
  const parent = BY_KEY.get(option.enabledBy)!;
  return settings[option.enabledBy] === true && isActive(settings, parent);
}

export function encodeSettings(settings: Settings): string {
  const payload: Record<string, unknown> = { v: LOGIC_VERSION, seed: settings.seed };
  for (const option of OPTIONS) {
    if (settings[option.key] !== option.default) payload[option.key] = settings[option.key];
  }
  return `RF${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
}

/** Decodes a settings string. `version` is the logic version it was made with. */
export function decodeSettings(value: string): { settings: Settings; version: number } {
  const text = value.trim();
  if (!text.startsWith("RF")) throw new SettingsError("A settings string starts with RF");
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(text.slice(2), "base64url").toString("utf8"));
  } catch {
    throw new SettingsError("That settings string is damaged");
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new SettingsError("That settings string is damaged");
  }
  const { v, seed, ...options } = payload as Record<string, unknown>;
  if (typeof v !== "number" || typeof seed !== "string") {
    throw new SettingsError("That settings string is damaged");
  }
  return { settings: applySettings(defaultSettings(seed), options), version: v };
}

/** Settings from a JSON file's contents: any subset of options, plus an optional seed. */
export function settingsFromJson(text: string, seed: string): Settings {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new SettingsError(`Settings file isn't valid JSON: ${(error as Error).message}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new SettingsError("Settings file must be a JSON object");
  }
  return applySettings(defaultSettings(seed), data as Record<string, unknown>);
}

/** The settings as a JSON file: every option, so it documents itself. */
export function settingsToJson(settings: Settings): string {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/** One line per option, for the spoiler log and the console. */
export function describeSettings(settings: Settings): string[] {
  return OPTIONS.filter((o) => isActive(settings, o)).map((o) => {
    const value = settings[o.key];
    let shown: string;
    if (o.type.kind === "boolean") shown = value ? "yes" : "no";
    else if (o.type.kind === "number" && o.type.percent)
      shown = `±${Math.round(Number(value) * 100)}%`;
    else if (o.type.kind === "choice") {
      shown = o.type.choices.find((c) => c.value === value)?.label ?? String(value);
    } else shown = String(value);
    return `${o.section} / ${o.label}: ${shown}`;
  });
}

export interface Preset {
  name: string;
  help: string;
  /** Changes from the defaults. */
  changes: Partial<Record<OptionKey, boolean | number | string>>;
}

export const PRESETS: readonly Preset[] = [
  {
    name: "Rewards only",
    help: "Quest rewards and monster drops. No EBOOT needed.",
    changes: {},
  },
  {
    name: "Full",
    help: "Everything, keeping items at their star level, weapons in their type and armor with its hunter type.",
    changes: {
      "recipes.materials": true,
      "recipes.amounts": true,
      "costs.enabled": true,
      "weapons.enabled": true,
      "armor.enabled": true,
      "shops.enabled": true,
      "shops.pool": "low",
      "shops.prices": true,
      "shops.stacks": true,
      "gathering.enabled": true,
      "gathering.pool": "rank",
    },
  },
  {
    name: "Chaos",
    help: "Everything, anywhere: no progression logic, any weapon type, wide amounts and costs. Armor still keeps its rarity, hunter type and sex.",
    changes: {
      "logic.tiers": "none",
      "recipes.materials": true,
      "recipes.amounts": true,
      "recipes.amountSpread": 0.9,
      "costs.enabled": true,
      "costs.spread": 0.9,
      "weapons.enabled": true,
      "weapons.mix": "any-type",
      "armor.enabled": true,
      "shops.enabled": true,
      "shops.pool": "any",
      "shops.mix": "all",
      "shops.keepEssentials": false,
      "shops.special": true,
      "shops.countSpread": 0.5,
      "shops.prices": true,
      "shops.priceSpread": 0.9,
      "shops.stacks": true,
      "shops.stackSpread": 0.9,
      "gathering.enabled": true,
      "gathering.pool": "any",
      "gathering.keepItems": false,
    },
  },
];
