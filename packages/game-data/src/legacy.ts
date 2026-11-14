/**
 * Converts a `data/` directory in the layout used before IDs (records
 * naming each other in English, plus `equipment-ids.json`) to the current
 * one. It did the migration once, and builds test fixtures from named data.
 */
import {
  dehydrate,
  fileKind,
  looseName,
  mergeStrings,
  stringResolver,
  type Doc,
  type FileKind,
  type Resolver,
} from "./model.js";
import { StringTable, type StringsDoc } from "./strings.js";

/** The IDs the old layout didn't hold anywhere. */
export interface LegacyIdSources {
  /** A skill tree's game ID, from its name and aliases in `skills.json`. */
  skillId(tree: string, aliases: string[]): number;
  /** A monster's game ID (`emID`), from its site name or its game (enum) name. */
  monsterId(name: string): number | undefined;
  /** Map ID -> name, for every map quests, gathering and trades name. */
  maps: Record<number, string>;
}

export interface Imported {
  /** Path -> raw file content. */
  files: Map<string, Doc>;
  en: StringsDoc;
  ja: StringsDoc;
}

type Obj = Record<string, Doc>;

/**
 * Converts every file in `legacy` (path inside `data/` -> parsed JSON). It
 * must hold `items.json` and, if it has weapons or armor,
 * `equipment-ids.json` (dropped from the output: IDs are on the records).
 */
export function importLegacy(legacy: Map<string, Doc>, sources: LegacyIdSources): Imported {
  const en: StringsDoc = {};
  const ja: StringsDoc = {};
  const files = new Map<string, Doc>();
  const kinds = new Map<string, FileKind>();
  for (const rel of legacy.keys()) {
    const kind = fileKind(rel);
    if (!kind) throw new Error(`importLegacy: ${rel} isn't a data file`);
    kinds.set(rel, kind);
  }
  const ofKind = (k: FileKind["kind"]) => [...kinds].filter(([, kind]) => kind.kind === k);
  const add = (strings: { en: StringsDoc; ja: StringsDoc }) => {
    mergeStrings(en, strings.en);
    mergeStrings(ja, strings.ja);
  };

  // Records whose IDs come from `sources` or equipment-ids.json.
  const equipment = (legacy.get("equipment-ids.json") ?? {}) as Record<string, (Obj | null)[]>;
  const weaponIds = new Map<string, number>();
  const armorIds = new Map<string, number>();
  for (const [table, list] of Object.entries(equipment))
    list.forEach((entry, id) => {
      if (!entry) return;
      if (table === "melee" || table === "ranged")
        weaponIds.set(`${table}\0${entry.name}\0${entry.type}`, id);
      else armorIds.set(`${table}\0${entry.name}\0${entry.sex ?? ""}`, id);
    });
  const legacyOwn = (kind: FileKind, record: Obj): number | undefined => {
    switch (kind.kind) {
      case "weapons":
        return weaponIds.get(`${kind.table}\0${record.name}\0${kind.type}`);
      case "armor":
        return (
          armorIds.get(`${kind.slot}\0${record.name}\0${record.sex}`) ??
          armorIds.get(`${kind.slot}\0${record.name}\0`)
        );
      case "monsters":
        return sources.monsterId(record.name);
      case "skills":
        return sources.skillId(record.tree, record.aliases ?? []);
      default:
        return undefined;
    }
  };
  const ownOnly: Resolver = {
    ref() {
      throw new Error("importLegacy: references resolve after names are known");
    },
    own(kind, record) {
      const id = legacyOwn(kind, record);
      if (id === undefined)
        throw new Error(`importLegacy: no ID for ${kind.kind} "${record.name ?? record.tree}"`);
      return id;
    },
  };

  // 1. Names: items, maps, then the records that only name themselves.
  for (const [rel, kind] of ofKind("items")) {
    const { raw, strings } = dehydrate(kind, legacy.get(rel), ownOnly);
    files.set(rel, raw);
    add(strings);
  }
  en.map = Object.fromEntries(Object.entries(sources.maps).map(([id, name]) => [id, name]));
  for (const [table, list] of Object.entries(equipment))
    list.forEach((entry, id) => {
      if (entry) ((en as Obj)[table] ??= {})[String(id)] = entry.name;
    });
  for (const [rel, kind] of ofKind("skills")) {
    const { raw, strings } = dehydrate(kind, legacy.get(rel), ownOnly);
    files.set(rel, raw);
    add(strings);
  }
  for (const [rel] of ofKind("monsters"))
    for (const m of legacy.get(rel).monsters as Obj[]) {
      const id = sources.monsterId(m.name);
      if (id === undefined) throw new Error(`importLegacy: no ID for monster "${m.name}"`);
      ((en.monster ??= {}) as Obj)[String(id)] = m.name;
    }
  // Monsters quests name that have no record, or another spelling of one that has.
  for (const [rel] of ofKind("quests"))
    for (const q of legacy.get(rel).quests as Obj[])
      for (const ref of [q.target, ...q.large_monsters, ...q.small_monsters]) {
        if (!ref?.monster) continue;
        const names = (en.monster ??= {});
        if (Object.values(names).includes(ref.monster)) continue;
        const id = sources.monsterId(ref.monster);
        if (id === undefined)
          throw new Error(`importLegacy: no ID for monster "${ref.monster}" in quest ${q.id}`);
        if (names[String(id)] === undefined) names[String(id)] = ref.monster;
        else {
          const list = (((en.aliases ??= {}).monster ??= {})[String(id)] ??= []);
          if (!list.includes(ref.monster)) list.push(ref.monster);
        }
      }

  // 2. Everything else, references resolved against those names.
  const table = new StringTable(en);
  const byName = stringResolver(table);
  const resolver: Resolver = {
    ref: (kind, spelling) => byName.ref(kind, spelling),
    own(kind, record) {
      const id = legacyOwn(kind, record);
      if (id !== undefined) return id;
      if (kind.kind === "decorations") {
        const exact = Object.entries(en.item ?? {}).filter(([, n]) => n === record.name);
        const loose = Object.entries(en.item ?? {}).filter(
          ([, n]) => looseName(n) === looseName(record.name),
        );
        const found = exact.length === 1 ? exact : loose;
        if (found.length === 1) return Number(found[0]![0]);
      }
      return ownOnly.own(kind, record);
    },
  };
  for (const [rel, kind] of kinds) {
    if (files.has(rel) || kind.kind === "equipment-ids") continue;
    const { raw, strings } = dehydrate(kind, legacy.get(rel), resolver);
    files.set(rel, raw);
    add(strings);
  }
  return { files, en, ja };
}
