import { applySettings, defaultSettings, type OptionKey, type Settings } from "../src/settings.js";

/** Shuffle names as the tests (and the CLI's --shuffles) use them. */
export const SHUFFLE_KEYS = {
  "quest-rewards": "questRewards.mode",
  "monster-rewards": "monsterRewards.mode",
  recipes: "recipes.materials",
  "recipe-amounts": "recipes.amounts",
  costs: "costs.enabled",
  weapons: "weapons.enabled",
  armor: "armor.enabled",
  "armor-skills": "armorSkills.enabled",
  shops: "shops.enabled",
  gathering: "gathering.mode",
  supplies: "supplies.enabled",
  "quest-money": "terms.money",
  "time-limits": "terms.time",
  deliveries: "deliveries.enabled",
  "veggie-trades": "trades.enabled",
} as const satisfies Record<string, OptionKey>;
export type ShuffleName = keyof typeof SHUFFLE_KEYS;

/** Default settings with exactly `shuffles` on, plus any other changes. */
export function settingsWith(
  seed: string,
  shuffles: ShuffleName[],
  changes: Partial<Record<OptionKey, boolean | number | string>> = {},
): Settings {
  const on: Record<string, boolean | string> = {};
  for (const [name, key] of Object.entries(SHUFFLE_KEYS)) {
    const enabled = shuffles.includes(name as ShuffleName);
    // A mode rather than a switch: on means shuffle.
    on[key] = key.endsWith(".mode") ? (enabled ? "shuffle" : "off") : enabled;
  }
  return applySettings(defaultSettings(seed), { ...on, ...changes });
}
