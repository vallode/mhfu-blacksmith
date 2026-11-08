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
 * the disc doesn't have at all (armor `hr`/`elder`/`sex`/`hunter_type`,
 * decoration `category`, weapon `bonus`/`shelling`/`notes`), is kept
 * from the committed file.
 */
import type { MaterialContext } from "../overlay/item-name-corrections.js";
import type { NameTable } from "../strings/names.js";
import type { FieldSpec } from "./fields.js";
import type { EquipmentSlot } from "./ids.js";

export type CategoryName = "armor" | "weapons" | "decorations";

export interface CategoryFile {
  /** Path relative to `data/` (and to the extract output directory). */
  file: string;
  /** The enum table the extracted names come from. */
  table: NameTable;
  /** `data/equipment-ids.json` slot; decorations have none and match through `data/items.json`. */
  slot?: EquipmentSlot;
  /** Weapon type of every item in this file (weapons share one ID space across types). */
  weaponType?: string;
}

export interface Category {
  name: CategoryName;
  /** The array key inside each file (`{ "armor": [...] }`). */
  arrayKey: "armor" | "weapons" | "decorations";
  files: CategoryFile[];
  materialContext: MaterialContext;
  /** Fields the disc provides, in the order reports list them. */
  fields: FieldSpec[];
  /** Fields `build-data` writes from the disc. */
  take: string[];
  /** Fields in `take` that are only taken in these files; kept from the committed file elsewhere. */
  takeOnlyIn?: Record<string, string[]>;
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
    ],
    // `sharpness`/`sharpness_plus` are read through each class's
    // `SharpnessTable.PTR` (vallode/mhfu-blacksmith#31). The disagreements
    // left are site errors: almost all are bars no table entry can produce.
    // `affinity` is the struct's base value plus a bonus for
    // `sharpnessAmount` (`blademasterAffinity()`, vallode/mhfu-blacksmith#33).
    // It compares by number, so heavy bowgun's old bare `"0"` matched `"0%"`.
    // Gunner fields (vallode/mhfu-blacksmith#32, emit/gunner.ts): ammo
    // lists, `reload`, `recoil`, `rapid_fire`, `max_attack`, bow `shots`
    // and `coatings` are taken; what still disagrees is single site cells
    // (one ammo capacity, a "Normal " with a trailing space, "Posion S")
    // and a few whole site entries the disc contradicts (Black Belt
    // Bowgun's ammo, Dragonhead Harp's and Blue Blade Bow's coatings).
    // `elements` is taken for bows only, where it adds the coating bonuses
    // ("Poison Add") the site stores there; melee `elements` lacks the
    // dual-element weapons on the disc side.
    // Not taken: `improve_cost` (derived as half the
    // sell price, unconfirmed) and `alternative_create_mats` (the disc
    // lacks the ticket alternatives the site lists).
    take: [
      "attack",
      "affinity",
      "slots",
      "rarity",
      "sharpness",
      "sharpness_plus",
      "create_cost",
      "create_mats",
      "improve_mats",
      "improve_from",
      "improve_to",
      "elements",
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
    ],
    takeOnlyIn: { elements: ["weapons/bow.json"] },
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
};

export const CATEGORY_NAMES = Object.keys(CATEGORIES) as CategoryName[];
