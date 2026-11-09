/**
 * What `compare` and `build-data` know about each `data/` category: which
 * files it spans, how its items are identified, which fields the disc
 * provides, and which of those `build-data` takes from the disc.
 *
 * `take` is a reviewed decision, not "everything `extract` emits". A field
 * is only taken once `compare` against a real disc showed its
 * disagreements are site errors rather than extractor gaps; see
 * `tools/mhfu-extract/README.md`'s "Building data/ from the disc" for the
 * numbers each decision was based on. Every other field, including ones
 * the disc doesn't have at all (armor `hr`/`elder`,
 * decoration `category`), is kept
 * from the committed file.
 */
import type { NameTable } from "../strings/names.js";
import type { FieldSpec } from "./fields.js";
import type { EquipmentSlot } from "./ids.js";

export type CategoryName = "armor" | "weapons" | "decorations" | "monsters";

export interface CategoryFile {
  /** Path relative to `data/` (and to the extract output directory). */
  file: string;
  /** The enum table the extracted names come from. */
  table: NameTable;
  /** `data/equipment-ids.json` slot; decorations have none and match through `data/items.json`. */
  slot?: EquipmentSlot;
  /** Weapon type of every item in this file (weapons share one ID space across types). */
  weaponType?: string;
  /** Category `take` fields kept from the committed file for this file only. */
  keepFields?: string[];
}

/** Which kind of recipe a material or skill belongs to; armor spells some skills differently. */
export type MaterialContext = "armor" | "weapon" | "decoration";

export interface Category {
  name: CategoryName;
  /** The array key inside each file (`{ "armor": [...] }`). */
  arrayKey: "armor" | "weapons" | "decorations" | "monsters";
  files: CategoryFile[];
  materialContext: MaterialContext;
  /** Fields the disc provides, in the order reports list them. */
  fields: FieldSpec[];
  /** Fields `build-data` writes from the disc. */
  take: string[];
}

const ARMOR_FILES: CategoryFile[] = [
  { file: "armor/helmet.json", table: "HeadArmorID", slot: "helmet" },
  { file: "armor/plate.json", table: "ChestArmorID", slot: "plate" },
  { file: "armor/gauntlets.json", table: "ArmArmorID", slot: "gauntlets" },
  { file: "armor/waist.json", table: "WaistArmorID", slot: "waist" },
  { file: "armor/leggings.json", table: "LegArmorID", slot: "leggings" },
];

const MELEE_TYPES = [
  "great-sword",
  "long-sword",
  "sword-and-shield",
  "dual-blades",
  "hammer",
  "hunting-horn",
  "lance",
  "gunlance",
];
const RANGED_TYPES = ["light-bowgun", "heavy-bowgun", "bow"];

const WEAPON_FILES: CategoryFile[] = [
  ...MELEE_TYPES.map((t) => ({
    file: `weapons/${t}.json`,
    table: "WepBMID" as const,
    slot: "melee" as const,
    weaponType: t,
  })),
  ...RANGED_TYPES.map((t) => ({
    file: `weapons/${t}.json`,
    table: "WepGunID" as const,
    slot: "ranged" as const,
    weaponType: t,
  })),
];

const MONSTER_TYPES = [
  "bird-wyvern",
  "carapaceon",
  "elder-dragon",
  "flying-wyvern",
  "herbivore",
  "lynian",
  "neopteron",
  "pelagus",
  "piscine-wyvern",
];

/**
 * Monsters come from `game_task.ovl`/`game_sub.ovl` (`monsters/*.ts`) with
 * part names and drop-group labels from `overlay/monsters.json`, so only
 * the parts and groups that overlay maps are compared; the rest, and every
 * other field (`description`, `habitats`, `sizes`, `icon`), stay as
 * committed. Monsters pair by emID through the same overlay.
 */
const MONSTERS: Category = {
  name: "monsters",
  arrayKey: "monsters",
  files: MONSTER_TYPES.map((t) => ({ file: `monsters/${t}.json`, table: "emID" as const })),
  // Monsters have no materials or skills; any context works.
  materialContext: "decoration",
  fields: [
    { field: "base_hp", kind: "scalar" },
    { field: "hitzones", kind: "hitzones" },
    { field: "drops", kind: "drops" },
    { field: "breaks", kind: "scalar" },
    { field: "flinch_thresholds", kind: "scalar" },
  ],
  // Reviewed against the EU disc (README "Monster overlays"): of 400
  // mapped hitzone parts 389 agree and the 11 that don't are site errors;
  // of 695 mapped drop groups 601 agree, and the 94 that don't are site
  // errors (lists not summing to 100, missing or 0% entries, another
  // rank's list pasted in).
  // `base_hp` (chunk +0x100) is new to the site: it has no committed value
  // to disagree with, and is the HP before a quest's multiplier.
  // `breaks` (monsters/breaks.ts, overlay/breaks.json) and
  // `flinch_thresholds` (hitzones.ts) are new too.
  take: ["base_hp", "hitzones", "drops", "breaks", "flinch_thresholds"],
};

export const CATEGORIES: Record<CategoryName, Category> = {
  armor: {
    name: "armor",
    arrayKey: "armor",
    files: ARMOR_FILES,
    materialContext: "armor",
    fields: [
      { field: "rarity", kind: "scalar" },
      { field: "rank", kind: "scalar" },
      { field: "slots", kind: "scalar" },
      { field: "defence", kind: "scalar" },
      { field: "fire_res", kind: "scalar" },
      { field: "thunder_res", kind: "scalar" },
      { field: "dragon_res", kind: "scalar" },
      { field: "water_res", kind: "scalar" },
      { field: "ice_res", kind: "scalar" },
      { field: "sex", kind: "scalar" },
      { field: "hunter_type", kind: "scalar" },
      { field: "max_defence", kind: "scalar" },
      { field: "max_defence_pre_ukanlos", kind: "scalar" },
      { field: "create_cost", kind: "scalar" },
      { field: "skills", kind: "armor-skills" },
      { field: "create_mats", kind: "materials" },
    ],
    take: [
      "rarity",
      "rank",
      "slots",
      "defence",
      "fire_res",
      "thunder_res",
      "dragon_res",
      "water_res",
      "ice_res",
      "sex",
      "hunter_type",
      "max_defence",
      "max_defence_pre_ukanlos",
      "create_cost",
      "skills",
      "create_mats",
    ],
  },
  weapons: {
    name: "weapons",
    arrayKey: "weapons",
    files: WEAPON_FILES,
    materialContext: "weapon",
    fields: [
      { field: "type", kind: "scalar" },
      { field: "attack", kind: "scalar" },
      { field: "affinity", kind: "percent" },
      { field: "slots", kind: "scalar" },
      { field: "rarity", kind: "scalar" },
      { field: "elements", kind: "set" },
      { field: "sharpness", kind: "scalar" },
      { field: "sharpness_plus", kind: "scalar" },
      { field: "coatings", kind: "set" },
      { field: "shots", kind: "scalar" },
      { field: "max_attack", kind: "scalar" },
      { field: "rapid_fire", kind: "joined-set" },
      { field: "reload", kind: "scalar" },
      { field: "recoil", kind: "scalar" },
      { field: "ammo", kind: "ammo" },
      { field: "status_ammo", kind: "ammo" },
      { field: "element_ammo", kind: "ammo" },
      { field: "misc_ammo", kind: "ammo" },
      { field: "create_cost", kind: "scalar" },
      { field: "improve_cost", kind: "scalar" },
      { field: "create_mats", kind: "materials" },
      { field: "improve_mats", kind: "materials" },
      { field: "alternative_create_mats", kind: "materials" },
      { field: "improve_from", kind: "weapon-refs" },
      { field: "improve_to", kind: "weapon-refs" },
      { field: "bonus", kind: "signed-number" },
      { field: "notes", kind: "scalar" },
      { field: "shelling", kind: "scalar" },
      { field: "melodies", kind: "melodies" },
    ],
    // `sharpness`/`sharpness_plus` are read through each class's
    // `SharpnessTable.PTR` (vallode/mhfu-blacksmith#31). The disagreements
    // left are site errors: almost all are bars no table entry can produce.
    // `affinity` is the struct's base value plus a bonus for
    // `sharpnessAmount` (`blademasterAffinity()`, vallode/mhfu-blacksmith#33).
    // It compares by number, so heavy bowgun's old bare `"0"` matched `"0%"`.
    // `elements` is taken in every file: melee includes the 15
    // dual-element dual blades (`WepDualAttr`), bows the coating bonuses
    // ("Poison Add", `ShotCoatings` bits 7-9).
    // Gunner fields (vallode/mhfu-blacksmith#32, emit/gunner.ts): ammo
    // lists, `reload`, `recoil`, `rapid_fire`, `max_attack`, bow `shots`
    // and `coatings` are taken; what still disagrees is single site cells
    // (one ammo capacity, a "Normal " with a trailing space, "Posion S")
    // and a few whole site entries the disc contradicts (Black Belt
    // Bowgun's ammo, Dragonhead Harp's and Blue Blade Bow's coatings).
    // `bonus` is the struct's `Defense` byte, `notes` an index into the
    // EBOOT's note-set table and `shelling` a type/level code, the last two
    // both from `NoteGLType`; `melodies` come from `game_task.ovl`'s melody
    // table (tables/horn.ts). On the EU disc only 3 bonuses (missing on
    // the site) and 2 gunlance shelling levels disagree.
    // Not taken: `improve_cost` (derived as half the
    // sell price, unconfirmed) and `alternative_create_mats` (the disc
    // lacks the ticket alternatives the site lists).
    take: [
      "attack",
      "affinity",
      "slots",
      "rarity",
      "elements",
      "sharpness",
      "sharpness_plus",
      "create_cost",
      "create_mats",
      "improve_mats",
      "improve_from",
      "improve_to",
      "coatings",
      "shots",
      "max_attack",
      "rapid_fire",
      "reload",
      "recoil",
      "ammo",
      "status_ammo",
      "element_ammo",
      "misc_ammo",
      "bonus",
      "notes",
      "shelling",
      "melodies",
    ],
  },
  decorations: {
    name: "decorations",
    arrayKey: "decorations",
    files: [{ file: "decorations.json", table: "ItemID" }],
    materialContext: "decoration",
    fields: [
      { field: "rarity", kind: "scalar" },
      { field: "slots", kind: "scalar" },
      { field: "create_cost", kind: "scalar" },
      { field: "skills", kind: "decoration-skills" },
      { field: "create_mats", kind: "materials" },
      { field: "alternative_create_mats", kind: "materials" },
    ],
    take: ["rarity", "slots", "create_cost", "skills", "create_mats", "alternative_create_mats"],
  },
  monsters: MONSTERS,
};

export const CATEGORY_NAMES = Object.keys(CATEGORIES) as CategoryName[];
