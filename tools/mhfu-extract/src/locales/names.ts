/**
 * Turns name tables found on the disc (strings/name-search.ts), which are
 * indexed by game ID, into locale sections keyed by the **site's** English
 * name. The site's names differ from the enums' in places (MHFU renames,
 * spelling fixes), so IDs go through what the repo already maps:
 *
 * - weapons and armor: `data/equipment-ids.json` (slot -> ID -> site item),
 *   the same table `build-data` pairs equipment with;
 * - items: `data/items.json` by ID, under its name and every alias;
 * - decorations: `data/decorations.json` names, whose item ID comes from
 *   `data/items.json` like `build-data`'s decoration matching;
 * - monsters: `overlay/monsters.json` (emID -> site name; the site's
 *   `src/lib/monster-ids.ts` is generated from the same pairs);
 * - skills: `data/skills.json` trees and their aliases, plus the armor and
 *   decoration spellings in `overlay/skill-name-aliases.json`, each matched
 *   to its `SkillID` name.
 *
 * `map` has no disc table yet (map names are hand-transcribed in
 * tables/quest-maps.ts), so it is never produced.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadSiteIndex, type EquipmentSlot } from "../build/ids.js";
import { MONSTER_OVERLAY } from "../overlay/monsters.js";
import { canonicalSkillName, skillNameAliases } from "../overlay/skill-name-aliases.js";
import { enumNames } from "../strings/name-search.js";
import type { NameTable } from "../strings/names.js";
import type { NameKind } from "./file.js";

/** The site's English keys for one game ID: which section, which names. */
export interface SiteKey {
  kind: NameKind;
  names: string[];
}

export type SiteKeys = Map<NameTable, Map<number, SiteKey[]>>;

const EQUIPMENT_TABLES: [NameTable, EquipmentSlot, NameKind][] = [
  ["WepBMID", "melee", "weapon"],
  ["WepGunID", "ranged", "weapon"],
  ["HeadArmorID", "helmet", "armor"],
  ["ChestArmorID", "plate", "armor"],
  ["ArmArmorID", "gauntlets", "armor"],
  ["WaistArmorID", "waist", "armor"],
  ["LegArmorID", "leggings", "armor"],
];

function add(keys: SiteKeys, table: NameTable, id: number, kind: NameKind, names: string[]): void {
  const byId = keys.get(table) ?? new Map<number, SiteKey[]>();
  keys.set(table, byId);
  const list = byId.get(id) ?? [];
  const existing = list.find((k) => k.kind === kind);
  if (existing) existing.names = [...new Set([...existing.names, ...names])];
  else list.push({ kind, names: [...new Set(names)] });
  byId.set(id, list);
}

/** Every game ID's site names, from a `data/` directory. */
export function loadSiteKeys(dataDir: string): SiteKeys {
  const keys: SiteKeys = new Map();
  const site = loadSiteIndex(dataDir);

  for (const [table, slot, kind] of EQUIPMENT_TABLES) {
    site.equipment[slot].forEach((entry, id) => {
      if (entry) add(keys, table, id, kind, [entry.name]);
    });
  }

  for (const item of site.items.values()) {
    add(keys, "ItemID", item.id, "item", [item.name, ...(item.aliases ?? [])]);
  }
  const decorations = JSON.parse(readFileSync(path.join(dataDir, "decorations.json"), "utf-8")) as {
    decorations: { name: string }[];
  };
  for (const deco of decorations.decorations) {
    const id = site.itemIdOf(deco.name);
    if (id !== null) add(keys, "ItemID", id, "decoration", [deco.name]);
  }

  for (const monster of MONSTER_OVERLAY) add(keys, "emID", monster.id, "monster", [monster.name]);

  const skills = JSON.parse(readFileSync(path.join(dataDir, "skills.json"), "utf-8")) as {
    skills: { tree: string; aliases?: string[] }[];
  };
  const skillIds = new Map<string, number>();
  enumNames("SkillID").forEach((n, i) => {
    if (n) skillIds.set(n, i);
  });
  const skillId = (name: string): number | undefined =>
    skillIds.get(name) ?? skillIds.get(canonicalSkillName(name));
  for (const tree of skills.skills) {
    const spellings = [tree.tree, ...(tree.aliases ?? [])];
    const id = spellings.map(skillId).find((i) => i !== undefined);
    if (id !== undefined) add(keys, "SkillID", id, "skill", spellings);
  }
  for (const [spelling, canonical] of skillNameAliases()) {
    const id = skillIds.get(canonical);
    if (id !== undefined) add(keys, "SkillID", id, "skill", [spelling]);
  }
  return keys;
}

export interface NameSections {
  names: Partial<Record<NameKind, Record<string, string>>>;
  /** Tables written, with how many IDs had a site name and a translation. */
  written: Partial<Record<NameTable, number>>;
  /** English keys two IDs translate differently; the lower ID's translation is kept. */
  conflicts: string[];
}

/** Locale name sections for one language from its translated tables (game ID -> text). */
export function nameSections(
  translations: Partial<Record<NameTable, (string | null)[]>>,
  keys: SiteKeys,
): NameSections {
  const names: NameSections["names"] = {};
  const written: NameSections["written"] = {};
  const conflicts: string[] = [];
  for (const [table, texts] of Object.entries(translations) as [NameTable, (string | null)[]][]) {
    const byId = keys.get(table);
    if (!byId) continue;
    let count = 0;
    texts.forEach((text, id) => {
      if (!text) return;
      const siteKeys = byId.get(id);
      if (!siteKeys) return;
      count++;
      for (const { kind, names: english } of siteKeys) {
        const section = (names[kind] ??= {});
        for (const en of english) {
          const prior = section[en];
          if (prior === undefined) section[en] = text;
          else if (prior !== text)
            conflicts.push(`${kind} "${en}": "${prior}" kept, "${text}" (${table} ${id}) dropped`);
        }
      }
    });
    written[table] = count;
  }
  return { names, written, conflicts };
}
