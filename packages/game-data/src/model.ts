/**
 * The shape of each file in `data/`, and the conversion between it and the
 * named view the site and mhfu-extract work with.
 *
 * On disk, records carry their game `id` and refer to each other by ID:
 * a weapon's `improve_from: 3`, a material `{ "item": 84, "amount": 2 }`, a
 * quest's `{ "monster": 87 }`. Names are in `data/strings/<lang>.json`
 * (strings.ts).
 *
 * `hydrate` puts the English names back where the records had them before
 * names moved out: `improve_from: "Buster Blade"`, `{ "name": "Iron Ore",
 * "amount": 2 }`. That view is what every reader got before, so the site
 * renders, slugs and bundles exactly as it did. `dehydrate` is its inverse:
 * it takes the named view (what mhfu-extract's build-data computes) back to
 * IDs, and returns the strings the records name.
 *
 * Where the site spelled a skill tree or monster differently from its
 * English name ("Defence" on armor for the Defense tree), the reference
 * carries `alias: n`, the n-th English alias of that tree; `hydrate` writes
 * that spelling, so pages show what they showed before. Other languages
 * ignore `alias`.
 */
import {
  compareKeys,
  type AliasKind,
  type StringKind,
  type StringsDoc,
  StringTable,
} from "./strings.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Doc = any;
type Obj = Record<string, Doc>;

/** Weapon types whose weapons are in the game's ranged (gunner) table. */
export const RANGED_TYPES = ["bow", "light-bowgun", "heavy-bowgun"];
export const ARMOR_SLOTS = ["leggings", "helmet", "plate", "gauntlets", "waist"] as const;
export type ArmorSlot = (typeof ARMOR_SLOTS)[number];
export type WeaponTable = "melee" | "ranged";
/** Keys of the equipment ID view, in its order (see `equipmentIds`). */
export const EQUIPMENT_TABLES = [...ARMOR_SLOTS, "melee", "ranged"] as const;
export type EquipmentTable = (typeof EQUIPMENT_TABLES)[number];

export const weaponTable = (type: string): WeaponTable =>
  RANGED_TYPES.includes(type) ? "ranged" : "melee";

export type FileKind =
  | { kind: "items" }
  | { kind: "decorations" }
  | { kind: "skills" }
  | { kind: "weapons"; type: string; table: WeaponTable }
  | { kind: "armor"; slot: ArmorSlot }
  | { kind: "monsters" }
  | { kind: "quests" }
  | { kind: "gathering" }
  | { kind: "shops" }
  | { kind: "veggie-trades" }
  | { kind: "combinations" }
  /** Not a file: built from the weapon and armor records (`equipmentIds`). */
  | { kind: "equipment-ids" };

/** What a path inside `data/` holds, or null for anything else (schemas, strings). */
export function fileKind(rel: string): FileKind | null {
  const p = rel.split(/[\\/]+/).join("/");
  let m;
  if ((m = /^weapons\/([a-z-]+)\.json$/.exec(p)))
    return { kind: "weapons", type: m[1]!, table: weaponTable(m[1]!) };
  if ((m = /^armor\/([a-z]+)\.json$/.exec(p)) && (ARMOR_SLOTS as readonly string[]).includes(m[1]!))
    return { kind: "armor", slot: m[1] as ArmorSlot };
  if (/^monsters\/[a-z-]+\.json$/.test(p)) return { kind: "monsters" };
  if (/^quests\/[a-z-]+\.json$/.test(p)) return { kind: "quests" };
  const top: Record<string, FileKind> = {
    "items.json": { kind: "items" },
    "decorations.json": { kind: "decorations" },
    "skills.json": { kind: "skills" },
    "gathering.json": { kind: "gathering" },
    "shops.json": { kind: "shops" },
    "veggie-trades.json": { kind: "veggie-trades" },
    "combinations.json": { kind: "combinations" },
    "equipment-ids.json": { kind: "equipment-ids" },
  };
  return top[p] ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Copy of `o` with `key` renamed to `to` (in place in the key order) and its value mapped. */
function renameKey(o: Obj, key: string, to: string, map: (v: Doc) => Doc): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === key) out[to] = map(v);
    else out[k] = v;
  }
  return out;
}

/** Copy of `o` with `extra` inserted before the first of `before` (or at the end). */
function insertBefore(o: Obj, before: string[], extra: Obj): Obj {
  const keys = Object.keys(o);
  const at = keys.findIndex((k) => before.includes(k));
  const out: Obj = {};
  keys.forEach((k, i) => {
    if (i === at) Object.assign(out, extra);
    out[k] = o[k];
  });
  if (at < 0) Object.assign(out, extra);
  return out;
}

function omit(o: Obj, keys: string[]): Obj {
  return Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
}

const mapList = <T>(list: T[] | null | undefined, f: (x: T) => Doc) =>
  list === null || list === undefined ? list : list.map(f);

const DROP_AMOUNT = /^(.*?)\s+x(\d+)$/;

/** A decoration skill as the site writes it: "Attack +1". */
export const formatDecorationSkill = (spelling: string, points: number) =>
  `${spelling} ${points > 0 ? "+" : ""}${points}`;
const DECORATION_SKILL = /^(.*\S) ([+-]?\d+)$/;

// ---------------------------------------------------------------------------
// Hydrate: IDs -> names
// ---------------------------------------------------------------------------

export interface HydrateStrings {
  /** English: every name the named view shows. */
  en: StringTable;
  /** Japanese, for items' `name_jp`. */
  ja?: StringTable;
}

/** The named view of a raw data file. */
export function hydrate(kind: FileKind, raw: Doc, s: HydrateStrings): Doc {
  const en = s.en;
  const item = (id: number) => en.name("item", id);
  const mats = (list: Obj[] | null | undefined) =>
    mapList(list, (m) => renameKey(m, "item", "name", item));
  const monsterRef = (o: Obj) => {
    const named = renameKey(o, "monster", "monster", (id) => en.spelling("monster", id, o.alias));
    return omit(named, ["alias"]);
  };
  const skillName = (ref: Obj) => en.spelling("skill", ref.skill, ref.alias);

  switch (kind.kind) {
    case "items":
      return {
        ...raw,
        items: raw.items.map((i: Obj) => {
          const names: Obj = { name: item(i.id) };
          const jp = s.ja?.find("item", i.id);
          if (jp !== undefined) names.name_jp = jp;
          const aliases = en.aliases("item", i.id);
          if (aliases) names.aliases = aliases;
          return insertBefore(
            i,
            Object.keys(i).filter((k) => k !== "id"),
            names,
          );
        }),
      };
    case "decorations":
      return {
        ...raw,
        decorations: raw.decorations.map((d: Obj) => {
          let out = renameKey(d, "id", "name", (id) => en.find("decoration", id) ?? item(id));
          out = renameKey(out, "skills", "skills", (list: Obj[]) =>
            list.map((ref) => formatDecorationSkill(skillName(ref), ref.points)),
          );
          out.create_mats = mats(out.create_mats);
          if ("alternative_create_mats" in out)
            out.alternative_create_mats = mats(out.alternative_create_mats);
          return out;
        }),
      };
    case "skills":
      return {
        ...raw,
        skills: raw.skills.map((t: Obj) => {
          const tree: Obj = { tree: en.name("skill", t.id) };
          const aliases = en.aliases("skill", t.id);
          if (aliases) tree.aliases = aliases;
          const rest = omit(t, ["id"]);
          rest.skills = t.skills.map((a: Obj) => ({
            name: en.name("skill_activation", `${t.id}:${a.points}`),
            ...a,
          }));
          return { ...tree, ...rest };
        }),
      };
    case "weapons": {
      const weapon = (id: number) => en.name(kind.table, id);
      return {
        ...raw,
        weapons: raw.weapons.map((w: Obj) => {
          const out = renameKey(w, "id", "name", weapon);
          if ("improve_from" in out)
            out.improve_from =
              out.improve_from === null
                ? null
                : Array.isArray(out.improve_from)
                  ? out.improve_from.map(weapon)
                  : weapon(out.improve_from);
          if ("improve_to" in out) out.improve_to = mapList(out.improve_to, weapon);
          for (const k of ["create_mats", "improve_mats", "alternative_create_mats"])
            if (k in out) out[k] = mats(out[k]);
          return out;
        }),
      };
    }
    case "armor":
      return {
        ...raw,
        armor: raw.armor.map((a: Obj) => {
          const out = renameKey(a, "id", "name", (id) => en.name(kind.slot, id));
          if ("skills" in out)
            out.skills = mapList(out.skills, (ref: Obj) =>
              omit(
                renameKey(ref, "skill", "name", () => skillName(ref)),
                ["alias"],
              ),
            );
          for (const k of ["create_mats", "alternative_create_mats"])
            if (k in out) out[k] = mats(out[k]);
          return out;
        }),
      };
    case "monsters":
      return {
        ...raw,
        monsters: raw.monsters.map((m: Obj) => {
          let out = renameKey(m, "id", "name", (id) => en.name("monster", id));
          const description = en.find("monster_description", m.id);
          if (description !== undefined)
            out = insertBefore(out, ["habitats", "drops"], { description });
          if (out.drops)
            out.drops = Object.fromEntries(
              Object.entries(out.drops as Obj).map(([rank, groups]) => [
                rank,
                Object.fromEntries(
                  Object.entries(groups as Obj).map(([group, list]) => [
                    group,
                    (list as Obj[]).map((d) => {
                      const name =
                        d.amount === undefined ? item(d.item) : `${item(d.item)} x${d.amount}`;
                      return { name, ...omit(d, ["item", "amount"]) };
                    }),
                  ]),
                ),
              ]),
            );
          return out;
        }),
      };
    case "quests":
      return {
        ...raw,
        quests: raw.quests.map((q: Obj) => {
          let out = renameKey(q, "map", "map", (id) => (id === null ? null : en.name("map", id)));
          out.target = out.target === null ? null : monsterRef(out.target);
          out.supplies = out.supplies.map((x: Obj) => renameKey(x, "item", "item", item));
          out.reward_tables = out.reward_tables.map((t: Obj) => ({
            ...t,
            items: t.items.map((x: Obj) => renameKey(x, "item", "item", item)),
          }));
          out.large_monsters = out.large_monsters.map(monsterRef);
          out.small_monsters = out.small_monsters.map(monsterRef);
          const text = (k: StringKind) => en.find(k, q.id) ?? null;
          return insertBefore(out, ["requires"], {
            title: text("quest"),
            goal: text("quest_goal"),
            details: text("quest_details"),
            fail: text("quest_fail"),
            client: text("quest_client"),
          });
        }),
      };
    case "gathering":
      return {
        ...raw,
        layouts: raw.layouts.map((l: Obj) => ({
          ...renameKey(l, "map", "map", (id) => en.name("map", id)),
          areas: l.areas.map((a: Obj) => ({
            ...a,
            nodes: a.nodes.map((n: Obj) => ({
              ...n,
              items: n.items.map((x: Obj) => renameKey(x, "item", "item", item)),
            })),
          })),
        })),
      };
    case "shops":
      return {
        ...raw,
        shops: raw.shops.map((shop: Obj) => ({
          ...shop,
          items: shop.items.map((x: Obj) => renameKey(x, "item", "item", item)),
        })),
      };
    case "veggie-trades":
      return {
        ...raw,
        elders: raw.elders.map((e: Obj) => ({
          ...e,
          maps: e.maps.map((id: number) => en.name("map", id)),
          trades: e.trades.map((t: Obj) => ({
            give: item(t.give),
            common: item(t.common),
            rare: item(t.rare),
          })),
        })),
      };
    case "combinations": {
      const ref = (id: number) => ({ id, name: item(id) });
      return {
        ...raw,
        books: raw.books.map(ref),
        combinations: raw.combinations.map((c: Obj) => ({
          ...c,
          result: ref(c.result),
          ingredients: c.ingredients.map(ref),
        })),
      };
    }
    case "equipment-ids":
      throw new Error("equipment-ids.json is built from the records; use equipmentIds()");
  }
}

/**
 * The equipment ID view (what `data/equipment-ids.json` held before IDs
 * moved onto the records): per table, an array indexed by game ID of the
 * site's piece (`{ name, sex }` for armor, `sex` only where two pieces of a
 * slot share a name; `{ name, type }` for weapons), `null` where the site
 * has none. Each array ends at the table's highest listed ID.
 */
export function equipmentIds(
  weapons: { type: string; raw: Doc }[],
  armor: { slot: ArmorSlot; raw: Doc }[],
  en: StringTable,
): Record<EquipmentTable, (Obj | null)[]> {
  const out = Object.fromEntries(EQUIPMENT_TABLES.map((t) => [t, [] as (Obj | null)[]])) as Record<
    EquipmentTable,
    (Obj | null)[]
  >;
  const put = (table: EquipmentTable, id: number, entry: Obj) => {
    const list = out[table];
    while (list.length <= id) list.push(null);
    if (list[id]) throw new Error(`equipment IDs: ${table} ${id} is used twice`);
    list[id] = entry;
  };
  for (const { slot, raw } of armor) {
    const counts = new Map<string, number>();
    for (const a of raw.armor as Obj[]) {
      const name = en.name(slot, a.id);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    for (const a of raw.armor as Obj[]) {
      const name = en.name(slot, a.id);
      put(slot, a.id, (counts.get(name) ?? 0) > 1 ? { name, sex: a.sex } : { name });
    }
  }
  for (const { type, raw } of weapons) {
    const table = weaponTable(type);
    for (const w of raw.weapons as Obj[]) put(table, w.id, { name: en.name(table, w.id), type });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dehydrate: names -> IDs
// ---------------------------------------------------------------------------

/** A reference resolved from a spelling: the ID, and which alias it used if not the name. */
export interface Ref {
  id: number;
  alias?: number;
}

/** Finds the IDs a named view refers to, and the IDs of its own records. */
export interface Resolver {
  /** A reference by spelling (name, or for alias kinds an alias). */
  ref(kind: "item" | "melee" | "ranged" | "skill" | "monster" | "map", spelling: string): Ref;
  /** The game ID of a record the file itself defines. */
  own(kind: FileKind, record: Obj): number;
}

/** Strings a file's records name, to merge into the string tables. */
export interface StringsOut {
  en: StringsDoc;
  ja: StringsDoc;
}

const emptyOut = (): StringsOut => ({ en: {}, ja: {} });

function setString(
  doc: StringsDoc,
  kind: StringKind,
  key: number | string,
  value: string | null | undefined,
) {
  if (value === null || value === undefined) return;
  (doc[kind] ??= {})[String(key)] = value;
}
function setAliases(doc: StringsDoc, kind: AliasKind, key: number, value: string[] | undefined) {
  if (!value) return;
  ((doc.aliases ??= {})[kind] ??= {})[String(key)] = value;
}

/** A reference written as `{ [field]: id }`, with `alias` right after it when there is one. */
function withRef(o: Obj, field: string, ref: Ref): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "alias") continue;
    if (k === field) {
      out[field] = ref.id;
      if (ref.alias !== undefined) out.alias = ref.alias;
    } else out[k] = v;
  }
  return out;
}

/** The raw (ID) form of a named view, and the strings its records name. */
export function dehydrate(
  kind: FileKind,
  named: Doc,
  r: Resolver,
): { raw: Doc; strings: StringsOut } {
  const strings = emptyOut();
  const en = strings.en;
  const itemId = (name: string) => r.ref("item", name).id;
  const mats = (list: Obj[] | null | undefined) =>
    mapList(list, (m) => renameKey(m, "name", "item", itemId));
  const monsterRef = (o: Obj) => withRef(o, "monster", r.ref("monster", o.monster));

  switch (kind.kind) {
    case "items":
      return {
        raw: {
          ...named,
          items: named.items.map((i: Obj) => {
            setString(en, "item", i.id, i.name);
            setString(strings.ja, "item", i.id, i.name_jp);
            setAliases(en, "item", i.id, i.aliases);
            return omit(i, ["name", "name_jp", "aliases"]);
          }),
        },
        strings,
      };
    case "decorations":
      return {
        raw: {
          ...named,
          decorations: named.decorations.map((d: Obj) => {
            const id = r.own(kind, d);
            // A decoration is an item; its name is only listed when it differs.
            let sameAsItem = false;
            try {
              const ref = r.ref("item", d.name);
              sameAsItem = ref.id === id && ref.alias === undefined;
            } catch {
              // Not an item's name: listed below.
            }
            if (!sameAsItem) setString(en, "decoration", id, d.name);
            let out = renameKey(d, "name", "id", () => id);
            out = renameKey(out, "skills", "skills", (list: string[]) =>
              list.map((text) => {
                const m = DECORATION_SKILL.exec(text);
                if (!m) throw new Error(`decorations: can't read skill "${text}" on ${d.name}`);
                const ref = r.ref("skill", m[1]!);
                const points = Number(m[2]);
                if (formatDecorationSkill(m[1]!, points) !== text)
                  throw new Error(
                    `decorations: skill "${text}" on ${d.name} isn't written "Tree +n"`,
                  );
                return {
                  skill: ref.id,
                  ...(ref.alias !== undefined && { alias: ref.alias }),
                  points,
                };
              }),
            );
            out.create_mats = mats(out.create_mats);
            if ("alternative_create_mats" in out)
              out.alternative_create_mats = mats(out.alternative_create_mats);
            return out;
          }),
        },
        strings,
      };
    case "skills":
      return {
        raw: {
          ...named,
          skills: named.skills.map((t: Obj) => {
            const id = r.own(kind, t);
            setString(en, "skill", id, t.tree);
            setAliases(en, "skill", id, t.aliases);
            const rest = omit(t, ["tree", "aliases"]);
            rest.skills = t.skills.map((a: Obj) => {
              setString(en, "skill_activation", `${id}:${a.points}`, a.name);
              return omit(a, ["name"]);
            });
            return { id, ...rest };
          }),
        },
        strings,
      };
    case "weapons": {
      const weapon = (name: string) => r.ref(kind.table, name).id;
      return {
        raw: {
          ...named,
          weapons: named.weapons.map((w: Obj) => {
            const id = r.own(kind, w);
            setString(en, kind.table, id, w.name);
            const out = renameKey(w, "name", "id", () => id);
            if ("improve_from" in out)
              out.improve_from =
                out.improve_from === null
                  ? null
                  : Array.isArray(out.improve_from)
                    ? out.improve_from.map(weapon)
                    : weapon(out.improve_from);
            if ("improve_to" in out) out.improve_to = mapList(out.improve_to, weapon);
            for (const k of ["create_mats", "improve_mats", "alternative_create_mats"])
              if (k in out) out[k] = mats(out[k]);
            return out;
          }),
        },
        strings,
      };
    }
    case "armor":
      return {
        raw: {
          ...named,
          armor: named.armor.map((a: Obj) => {
            const id = r.own(kind, a);
            setString(en, kind.slot, id, a.name);
            const out = renameKey(a, "name", "id", () => id);
            if ("skills" in out)
              out.skills = mapList(out.skills, (s: Obj) =>
                withRef(
                  renameKey(s, "name", "skill", (n) => n),
                  "skill",
                  r.ref("skill", s.name),
                ),
              );
            for (const k of ["create_mats", "alternative_create_mats"])
              if (k in out) out[k] = mats(out[k]);
            return out;
          }),
        },
        strings,
      };
    case "monsters":
      return {
        raw: {
          ...named,
          monsters: named.monsters.map((m: Obj) => {
            const id = r.own(kind, m);
            setString(en, "monster", id, m.name);
            setString(en, "monster_description", id, m.description);
            const out = omit(
              renameKey(m, "name", "id", () => id),
              ["description"],
            );
            if (out.drops)
              out.drops = Object.fromEntries(
                Object.entries(out.drops as Obj).map(([rank, groups]) => [
                  rank,
                  Object.fromEntries(
                    Object.entries(groups as Obj).map(([group, list]) => [
                      group,
                      (list as Obj[]).map((d) => {
                        const rest = omit(d, ["name"]);
                        const amount = DROP_AMOUNT.exec(d.name);
                        if (amount) {
                          let found: Ref | null = null;
                          try {
                            found = r.ref("item", amount[1]!);
                          } catch {
                            // An item whose own name ends in " xN" (none today).
                          }
                          if (found) return { item: found.id, amount: Number(amount[2]), ...rest };
                        }
                        return { item: itemId(d.name), ...rest };
                      }),
                    ]),
                  ),
                ]),
              );
            return out;
          }),
        },
        strings,
      };
    case "quests":
      return {
        raw: {
          ...named,
          quests: named.quests.map((q: Obj) => {
            setString(en, "quest", q.id, q.title);
            setString(en, "quest_goal", q.id, q.goal);
            setString(en, "quest_details", q.id, q.details);
            setString(en, "quest_fail", q.id, q.fail);
            setString(en, "quest_client", q.id, q.client);
            const out = omit(q, ["title", "goal", "details", "fail", "client"]);
            out.map = q.map === null ? null : r.ref("map", q.map).id;
            out.target = q.target === null ? null : monsterRef(q.target);
            out.supplies = q.supplies.map((x: Obj) => renameKey(x, "item", "item", itemId));
            out.reward_tables = q.reward_tables.map((t: Obj) => ({
              ...t,
              items: t.items.map((x: Obj) => renameKey(x, "item", "item", itemId)),
            }));
            out.large_monsters = q.large_monsters.map(monsterRef);
            out.small_monsters = q.small_monsters.map(monsterRef);
            return out;
          }),
        },
        strings,
      };
    case "gathering":
      return {
        raw: {
          ...named,
          layouts: named.layouts.map((l: Obj) => ({
            ...renameKey(l, "map", "map", (name) => r.ref("map", name).id),
            areas: l.areas.map((a: Obj) => ({
              ...a,
              nodes: a.nodes.map((n: Obj) => ({
                ...n,
                items: n.items.map((x: Obj) => renameKey(x, "item", "item", itemId)),
              })),
            })),
          })),
        },
        strings,
      };
    case "shops":
      return {
        raw: {
          ...named,
          shops: named.shops.map((shop: Obj) => ({
            ...shop,
            items: shop.items.map((x: Obj) => renameKey(x, "item", "item", itemId)),
          })),
        },
        strings,
      };
    case "veggie-trades":
      return {
        raw: {
          ...named,
          elders: named.elders.map((e: Obj) => ({
            ...e,
            maps: e.maps.map((name: string) => r.ref("map", name).id),
            trades: e.trades.map((t: Obj) => ({
              give: itemId(t.give),
              common: itemId(t.common),
              rare: itemId(t.rare),
            })),
          })),
        },
        strings,
      };
    case "combinations": {
      // Combinations already carry item IDs; the names beside them are dropped.
      const ref = (x: Obj) => {
        if (itemId(x.name) !== x.id)
          throw new Error(`combinations: item ${x.id} isn't named "${x.name}"`);
        return x.id;
      };
      return {
        raw: {
          ...named,
          books: named.books.map(ref),
          combinations: named.combinations.map((c: Obj) => ({
            ...c,
            result: ref(c.result),
            ingredients: c.ingredients.map(ref),
          })),
        },
        strings,
      };
    }
    case "equipment-ids":
      throw new Error("equipment-ids.json is built from the records; it can't be written");
  }
}

// ---------------------------------------------------------------------------
// Resolving names against the string table
// ---------------------------------------------------------------------------

/** Loose key for decoration names: "Constitutn Jewel" = "ConstitutnJewel". */
export const looseName = (name: string) => name.toLowerCase().replace(/[^a-z0-9+]/g, "");

/** name -> ref for one kind: names first, then aliases. */
function refIndex(strings: StringTable, kind: StringKind): Map<string, Ref[]> {
  const index = new Map<string, Ref[]>();
  const add = (name: string, ref: Ref) => index.set(name, [...(index.get(name) ?? []), ref]);
  const names = { ...strings.fallback?.[kind], ...strings.doc[kind] };
  for (const [key, name] of Object.entries(names)) add(name, { id: Number(key) });
  if (kind === "item" || kind === "skill" || kind === "monster") {
    const aliases = { ...strings.fallback?.aliases?.[kind], ...strings.doc.aliases?.[kind] };
    for (const [key, list] of Object.entries(aliases))
      list.forEach((name, alias) => {
        if (!index.has(name)) add(name, { id: Number(key), alias });
      });
  }
  return index;
}

/**
 * Resolves references against English strings, and a file's own records
 * against the IDs its records already have (`current`, the raw file being
 * rewritten): weapons and armor by name (and armor `sex` where two pieces
 * share a name), monsters, skills and decorations by name.
 */
export function stringResolver(en: StringTable, current?: Doc): Resolver {
  const indexes = new Map<StringKind, Map<string, Ref[]>>();
  const index = (kind: StringKind) => {
    let i = indexes.get(kind);
    if (!i) indexes.set(kind, (i = refIndex(en, kind)));
    return i;
  };
  const one = (kind: StringKind, spelling: string, refs: Ref[] | undefined): Ref => {
    if (!refs || refs.length === 0) throw new Error(`no ${kind} is named "${spelling}"`);
    if (refs.length > 1) throw new Error(`more than one ${kind} is named "${spelling}"`);
    return refs[0]!;
  };
  return {
    ref(kind, spelling) {
      return one(kind, spelling, index(kind).get(spelling));
    },
    own(kind, record) {
      switch (kind.kind) {
        case "weapons":
          return one(kind.table, record.name, index(kind.table).get(record.name)).id;
        case "armor": {
          const refs = index(kind.slot).get(record.name) ?? [];
          if (refs.length <= 1) return one(kind.slot, record.name, refs).id;
          const sexOf = new Map<number, string>(
            ((current?.armor ?? []) as Obj[]).map((a) => [a.id, a.sex]),
          );
          return one(
            kind.slot,
            record.name,
            refs.filter((ref) => sexOf.get(ref.id) === record.sex),
          ).id;
        }
        case "monsters":
          return one(
            "monster",
            record.name,
            index("monster")
              .get(record.name)
              ?.filter((r) => r.alias === undefined),
          ).id;
        case "skills":
          return one(
            "skill",
            record.tree,
            index("skill")
              .get(record.tree)
              ?.filter((r) => r.alias === undefined),
          ).id;
        case "decorations": {
          const own = index("decoration").get(record.name) ?? index("item").get(record.name);
          if (own)
            return one(
              "item",
              record.name,
              own.filter((r) => r.alias === undefined),
            ).id;
          const loose = [...index("item")]
            .filter(([n]) => looseName(n) === looseName(record.name))
            .flatMap(([, r]) => r);
          return one(
            "item",
            record.name,
            loose.filter((r) => r.alias === undefined),
          ).id;
        }
        default:
          throw new Error(`${kind.kind} records carry their own IDs`);
      }
    },
  };
}

/** Merges `add` into `into` (in place): `add`'s entries win. */
export function mergeStrings(into: StringsDoc, add: StringsDoc): void {
  for (const [kind, table] of Object.entries(add) as [string, Record<string, Doc>][]) {
    if (kind === "$comment") continue;
    if (kind === "aliases") {
      for (const [ak, at] of Object.entries(table as Obj))
        Object.assign((((into.aliases ??= {}) as Obj)[ak] ??= {}), at);
      continue;
    }
    Object.assign(((into as Obj)[kind] ??= {}) as Obj, table);
  }
}

export { compareKeys };
