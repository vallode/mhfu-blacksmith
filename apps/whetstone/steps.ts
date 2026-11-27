/**
 * What the builder (app.ts) is made of, as plain data so tests can check it:
 * the option steps, each a group of `OptionDef.section`s from
 * `WHETSTONE_OPTIONS`, the sprites beside them, and the presets.
 */
import {
  WHETSTONE_OPTIONS,
  applyWhetstoneSettings,
  defaultWhetstoneSettings,
  type WhetstoneSettings,
} from "whetstone/src/settings.js";

/** A game sprite from images/ (copied in by build.mjs), and its tint (a site colour token). */
export interface Sprite {
  icon: string;
  tint?: string;
}

export interface Step extends Sprite {
  id: string;
  title: string;
  /** For option steps: the `OptionDef.section`s it shows, and a line above them. */
  sections?: string[];
  intro?: string;
}

const optionSteps: Step[] = [
  {
    id: "camera",
    title: "Camera",
    icon: "binoculars",
    tint: "var(--color-gem-cyan)",
    sections: ["Camera"],
    intro:
      "How the camera sees the hunt. Those marked In game can be switched any time from the START menu's Whetstone entry.",
  },
  {
    id: "hud",
    title: "HUD",
    icon: "fluid",
    tint: "var(--color-gem-red)",
    sections: ["HUD"],
    intro:
      "What the game knows but doesn't show: monster health, damage dealt, attacks about to land.",
  },
  {
    id: "comfort",
    title: "Quality of life",
    icon: "ticket",
    tint: "var(--color-gem-green)",
    sections: [
      "Reward screen",
      "Pokke Farm",
      "Item pouch",
      "Improve pips",
      "Key quests",
      "Quest end",
      "Area map",
      "Monster List",
    ],
    intro: "Less waiting, fewer menus, and more on the game's own screens.",
  },
  {
    id: "monsters",
    title: "Monsters & Poogie",
    icon: "dragon",
    sections: ["Monster stats", "Elite monsters", "Weapons", "Poogie"],
    intro: "How monsters fight, the odd elite, element on heavy hits, and Poogie's luck.",
  },
  {
    id: "boot",
    title: "Boot & buttons",
    icon: "note",
    tint: "var(--color-gem-slate)",
    sections: ["Boot", "Buttons"],
    intro: "A faster start, and the buttons the game draws.",
  },
];

// A section no step claims still gets a step, so a new option always shows up.
const claimed = new Set(optionSteps.flatMap((s) => s.sections ?? []));
const unclaimed = [...new Set(WHETSTONE_OPTIONS.map((o) => o.section))].filter(
  (s) => !claimed.has(s),
);
if (unclaimed.length > 0) {
  optionSteps.push({ id: "more", title: "More", icon: "deco", sections: unclaimed });
}

export const OPTION_STEPS: readonly Step[] = optionSteps;

/** The sprite beside each option section's heading, in steps of more than one section. */
export const SECTION_ICONS: Record<string, Sprite> = {
  "Reward screen": { icon: "sac", tint: "var(--color-gem-orange)" },
  "Pokke Farm": { icon: "ore", tint: "var(--color-gem-blue)" },
  "Item pouch": { icon: "fluid", tint: "var(--color-gem-green)" },
  "Improve pips": { icon: "great-sword", tint: "var(--color-gem-orange)" },
  "Key quests": { icon: "star", tint: "var(--color-gem-yellow)" },
  "Quest end": { icon: "ticket", tint: "var(--color-gem-green)" },
  "Area map": { icon: "binoculars" },
  "Monster List": { icon: "scroll", tint: "var(--color-gem-orange)" },
  "Monster stats": { icon: "ko" },
  "Elite monsters": { icon: "monsters/elder-dragon", tint: "var(--color-gem-slate)" },
  Weapons: { icon: "fire" },
  Poogie: { icon: "meat", tint: "var(--color-gem-pink)" },
  Boot: { icon: "note", tint: "var(--color-gem-slate)" },
  Buttons: { icon: "ticket", tint: "var(--color-gem-yellow)" },
};

export interface Preset {
  name: string;
  /** Its main points, under its name. */
  points: string[];
  /** What it changes from `defaultWhetstoneSettings()`. */
  changes: Partial<WhetstoneSettings>;
}

const recommended: Partial<WhetstoneSettings> = {
  "camera.photoMode": true,
  "quests.keyLabel": true,
  "mods.nodeMap": true,
  "rewards.sendAll": true,
  "smithy.improvePips": true,
  "farm.harvestAll": true,
  "pouch.bulkCombine": true,
};

export const PRESETS: readonly Preset[] = [
  {
    name: "Recommended",
    points: [
      "Photo mode, key quest marks and gathering nodes on the area map",
      "Send All to Item Box, improve pips, harvest all and bulk combine",
      "The camera, HUD and monsters as the game has them",
    ],
    changes: recommended,
  },
  {
    name: "Recommended + HUD",
    points: [
      "Everything in Recommended",
      "Monster health, damage numbers and attack hitboxes",
      "A wider camera further back, and a target camera on L",
    ],
    changes: {
      ...recommended,
      "hud.monsterHp": "always",
      "hud.damageNumbers": "total",
      "hud.attackHitboxes": true,
      "camera.fov": "wide",
      "camera.distance": "far",
      "camera.target": "tap",
    },
  },
  {
    name: "Challenge",
    points: [
      "Everything in Recommended",
      "Elite monsters, and monsters that attack more and stay in reach",
      "Heavy hits carry more element",
    ],
    changes: {
      ...recommended,
      "elites.enabled": true,
      "monsterAi.aggression": "more",
      "monsterAi.reach": "less",
      "weapons.elementMotion": true,
    },
  },
  {
    name: "Defaults",
    points: [
      "Send All to Item Box, improve pips, harvest all, bulk combine and Poogie's luck",
      "Everything else as the game has it",
    ],
    changes: {},
  },
];

export function presetSettings(preset: Preset): WhetstoneSettings {
  return applyWhetstoneSettings(defaultWhetstoneSettings(), preset.changes);
}
