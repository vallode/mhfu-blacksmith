import { applySettings, defaultSettings, type OptionKey, type Settings } from "../src/settings.js";

/** Short names for the shuffles, as the tests use them. */
export const SHUFFLE_KEYS = {
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
  const on: Record<string, boolean> = {};
  for (const [name, key] of Object.entries(SHUFFLE_KEYS))
    on[key] = shuffles.includes(name as ShuffleName);
  // The bookshelf guides are on by default; a test asks for them by name.
  const hints = { "hints.bookshelf": false, "hints.almanac": false };
  return applySettings(defaultSettings(seed), { ...on, ...hints, ...changes });
}
