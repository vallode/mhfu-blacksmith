/**
 * The game's names and descriptions for items, equipment and skills, per
 * language, from the str_tbl message files (strings/messages.ts). On the EU
 * disc DATA.BIN 19-23 are str_tbl in English, French, German, Italian and
 * Spanish; each has 23 tables, the same layout in every language:
 *
 *   0       interface text; skill trees at 806 + tree ID (100, `SkillID`
 *           order), then skills at 906 + skill ID (218, the "Skills 2" list
 *           in equip.enum)
 *   1, 2    item names and descriptions, by item ID
 *   3, 4    blademaster weapon names (by ID) and descriptions
 *   5, 6    gunner weapons
 *   7, 8    head armor; 9, 10 chest; 11, 12 arm; 13, 14 waist; 15, 16 leg
 *   17      monster descriptions (62, not mapped to monsters yet)
 *   18      save and load messages; 19-22 the name filter's word lists
 *
 * Items have a description each. Equipment shares descriptions, so the
 * EBOOT maps each ID to one (tables/descriptions.ts). Skills have names
 * only: the disc describes a skill only through its decoration's item
 * description.
 */
import {
  DESCRIPTION_INDEX_COUNTS,
  type DescriptionIndexes,
  type DescriptionIndexSlot,
} from "../tables/descriptions.js";
import type { MessageTable } from "./messages.js";

/** EU str_tbl, by language: DATA.BIN index. */
export const EU_STR_TBL_FILES = { en: 19, fr: 20, de: 21, it: 22, es: 23 } as const;
export type DiscLanguage = keyof typeof EU_STR_TBL_FILES;

/** Equipment kinds, keyed as in data/equipment-ids.json, with their str_tbl tables. */
export const EQUIPMENT_TEXT_TABLES: readonly {
  key: "melee" | "ranged" | "helmet" | "plate" | "gauntlets" | "waist" | "leggings";
  slot: DescriptionIndexSlot;
  names: number;
  descriptions: number;
}[] = [
  { key: "melee", slot: "blademaster", names: 3, descriptions: 4 },
  { key: "ranged", slot: "gunner", names: 5, descriptions: 6 },
  { key: "helmet", slot: "head", names: 7, descriptions: 8 },
  { key: "plate", slot: "chest", names: 9, descriptions: 10 },
  { key: "gauntlets", slot: "arm", names: 11, descriptions: 12 },
  { key: "waist", slot: "waist", names: 13, descriptions: 14 },
  { key: "leggings", slot: "leg", names: 15, descriptions: 16 },
];

const ITEM_NAMES = 1;
const ITEM_DESCRIPTIONS = 2;
const SKILL_TREE_BASE = 806;
const SKILL_TREE_COUNT = 100;
const SKILL_BASE = 906;
const SKILL_COUNT = 218;
const STR_TBL_TABLES = 23;
/** The name of an unused ID: the JP disc's collaboration items and gear, left out of EU. */
const PLACEHOLDER = /^(dummy|none)$/i;

export interface TextEntry {
  name: string;
  description: string;
}

/**
 * Arrays are indexed by game ID. ID 0 (no item, nothing equipped) and IDs
 * the disc names only `dummy` or `none` are null.
 */
export interface DiscText {
  language: DiscLanguage;
  items: (TextEntry | null)[];
  melee: (TextEntry | null)[];
  ranged: (TextEntry | null)[];
  helmet: (TextEntry | null)[];
  plate: (TextEntry | null)[];
  gauntlets: (TextEntry | null)[];
  waist: (TextEntry | null)[];
  leggings: (TextEntry | null)[];
  skill_trees: (string | null)[];
  skills: (string | null)[];
}

/**
 * A message as plain text: color codes (`~C05`...`~C00`, the only control
 * codes in these tables) dropped, and the game's own line breaks kept, without
 * the spaces some lines end in. The game wraps every line by hand, often
 * mid-word with a hyphen, so the breaks aren't undone here.
 */
export function plainText(bytes: Buffer): string {
  return bytes
    .toString("utf8")
    .replace(/~C\d\d/g, "")
    .replace(/[ 　]+\n/g, "\n")
    .trim();
}

function strings(tables: readonly MessageTable[], table: number): string[] {
  const t = tables[table];
  if (!t) throw new Error(`str_tbl has no table ${table}`);
  return t.strings.map((s) => plainText(s.bytes));
}

/** One language's text, from its str_tbl and the EBOOT's description indexes. */
export function buildDiscText(
  language: DiscLanguage,
  tables: readonly MessageTable[],
  indexes: DescriptionIndexes,
): DiscText {
  if (tables.length !== STR_TBL_TABLES) {
    throw new Error(
      `str_tbl (${language}) has ${tables.length} tables, expected ${STR_TBL_TABLES}`,
    );
  }
  const itemNames = strings(tables, ITEM_NAMES);
  const itemDescriptions = strings(tables, ITEM_DESCRIPTIONS);
  if (itemNames.length !== itemDescriptions.length) {
    throw new Error(
      `str_tbl (${language}) has ${itemNames.length} item names but ${itemDescriptions.length} descriptions`,
    );
  }
  const text: DiscText = {
    language,
    items: itemNames.map((name, id) =>
      id === 0 || PLACEHOLDER.test(name) ? null : { name, description: itemDescriptions[id]! },
    ),
    melee: [],
    ranged: [],
    helmet: [],
    plate: [],
    gauntlets: [],
    waist: [],
    leggings: [],
    skill_trees: [],
    skills: [],
  };

  for (const { key, slot, names: n, descriptions: d } of EQUIPMENT_TEXT_TABLES) {
    const names = strings(tables, n);
    const descriptions = strings(tables, d);
    const index = indexes[slot];
    if (names.length !== DESCRIPTION_INDEX_COUNTS[slot]) {
      throw new Error(
        `str_tbl (${language}) table ${n} has ${names.length} ${key} names, expected ${DESCRIPTION_INDEX_COUNTS[slot]}`,
      );
    }
    text[key] = names.map((name, id) => {
      if (id === 0 || PLACEHOLDER.test(name)) return null;
      const description = descriptions[index[id]!];
      if (description === undefined) {
        throw new Error(
          `${key} ${id} points at description ${index[id]}, but str_tbl (${language}) has ${descriptions.length}`,
        );
      }
      return { name, description };
    });
  }

  const ui = strings(tables, 0);
  if (ui.length < SKILL_BASE + SKILL_COUNT) {
    throw new Error(`str_tbl (${language}) table 0 is too short for the skill names`);
  }
  text.skill_trees = ui
    .slice(SKILL_TREE_BASE, SKILL_TREE_BASE + SKILL_TREE_COUNT)
    .map((s, id) => (id === 0 ? null : s));
  text.skills = ui
    .slice(SKILL_BASE, SKILL_BASE + SKILL_COUNT)
    .map((s, id) => (id === 0 ? null : s));
  return text;
}
