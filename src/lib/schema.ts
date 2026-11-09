/**
 * Lean on-disk schema for the compact per-category data bundles served from
 * /data/*.json, plus a decode() that hydrates the compact shapes back into the
 * existing Weapon / ArmorPiece / Monster / Decoration / WeaponTreeNode types
 * used by the render components.
 *
 * Design goals (see .cursor/plans/instant_offline_data_rendering):
 *  - short keys, omit empty/default fields
 *  - shared dictionaries (materials, enums, interned strings)
 *  - numbers stored as numbers (no "120" / "0%" strings)
 *  - no duplicated tree edges (improve_from/improve_to are derived from map.json)
 */

import type {
  Weapon,
  ArmorPiece,
  Monster,
  Decoration,
  Material,
  WeaponTreeNode,
  Melody,
  MinRank,
  MonsterDrop,
} from "./types";
import { splitDropQuantity } from "./monster-drops";
import { slugify } from "./slug";

// ---------------------------------------------------------------------------
// Dictionaries (shared across all bundles, emitted as dictionaries.json)
// ---------------------------------------------------------------------------

export interface Dictionaries {
  /** material name -> [typeIdx, colorIdx] */
  materials: Record<string, [number, number]>;
  /** material id -> name (id is the interning insertion order) */
  material_ids: string[];
  /** material type strings (icon types) */
  types: string[];
  /** material color strings */
  colors: string[];
  /** element names (weapon elements) */
  elements: string[];
  /** horn note letters */
  notes: string[];
  /** interned free-text pool (skill names, ammo/shot names, rapid_fire, etc.) */
  strings: string[];
  /** weapon-class bloat multipliers, keyed by weapon type */
  multipliers: Record<string, number>;
  /** hunting-horn melodies keyed by notes.join("-") */
  melodies: Record<string, Melody[]>;
}

export const RANKS = ["low-rank", "high-rank", "g-rank"] as const;

// ---------------------------------------------------------------------------
// Compact tree node
// ---------------------------------------------------------------------------

export interface CompactTreeNode {
  s: string; // slug
  n: string; // name
  t?: string; // type (omitted when it equals the bundle's own type)
  r?: number | null; // rarity
  c?: string; // color
  e?: string; // element
  m?: MinRankTuple; // earliest quest progress needed to make it
  d?: number; // armor max defence
  k?: CompactTreeNode[]; // children
}

// ---------------------------------------------------------------------------
// Compact item shapes (sparse; absent = empty/default)
// ---------------------------------------------------------------------------

/** [materialId, amount] */
export type MatTuple = [number, number | string];
/** [rank index into RANKS, stars] */
export type MinRankTuple = [number, number];
/** [elementIdx, attack] */
export type ElemTuple = [number, number];

export interface CompactWeapon {
  n: string; // name
  s: string; // slug
  a?: number; // attack
  ma?: number; // max_attack
  af?: number; // affinity %
  sl?: number; // slots
  r?: number; // rarity
  b?: string; // bonus (defense)
  sh?: number[]; // sharpness
  shp?: number[]; // sharpness_plus
  el?: ElemTuple[]; // elements
  nt?: number[]; // horn note indices
  sg?: [number, number]; // shelling [typeStringIdx, level]
  rf?: number; // rapid_fire stringIdx
  re?: number; // recoil stringIdx
  rl?: number; // reload stringIdx
  cc?: number; // create_cost
  ic?: number; // improve_cost
  mr?: MinRankTuple; // earliest quest progress needed to make it
  c?: string | null; // color (icon)
  cm?: MatTuple[]; // create_mats
  im?: MatTuple[]; // improve_mats
  am?: MatTuple[]; // alternative_create_mats
  // ammo tables: [nameStringIdx, capacity[]]
  amo?: [number, number[]][]; // ammo
  sa?: [number, number[]][]; // status_ammo
  ea?: [number, number[]][]; // element_ammo
  mia?: [number, number[]][]; // misc_ammo
  co?: number[]; // coatings stringIdx[]
  so?: [number, number][]; // shots [nameStringIdx, level]
}

export interface CompactArmor {
  n: string;
  s: string;
  d?: number; // defence
  md?: number; // max_defence
  mp?: number; // max_defence_pre_ukanlos
  re?: number[]; // [fire, water, thunder, ice, dragon]
  sl?: number;
  r?: number; // rarity
  rk: number; // rank idx
  mr?: MinRankTuple; // earliest quest progress needed to make it
  cc?: number; // create_cost
  sx?: number; // sex stringIdx
  ht?: number; // hunter_type stringIdx
  sk?: [number, number][]; // skills [nameStringIdx, amount]
  cm?: MatTuple[];
  am?: MatTuple[]; // alternative_create_mats
}

export interface CompactMonster {
  n: string;
  s: string;
  d?: number; // description stringIdx
  hb?: number[]; // habitats stringIdx[]
  /** hitzones: [partStringIdx, [cut,bash,shot,fir,wtr,thn,ice,drg,ko]] */
  hz?: [number, (number | null)[]][];
  /** drops: [rankStringIdx, [sourceStringIdx, [materialId, chanceStringIdx][]][]][] */
  dr?: [number, [number, [number, number][]][]][];
  /** sizes: [min, max] in cm */
  sz?: [number, number];
  /** base_hp */
  hp?: number;
  /**
   * attacks: [rows, sharedWith]. A row is [damage, guard, count, stun, statusValue,
   * elements, statuses] (zeros and empty arrays when absent); sharedWith is
   * [category, name][] of the family's other monsters.
   */
  at?: [[number, number, number, number, number, string[], string[]][], [string, string][]];
}

export interface CompactDecoration {
  n: string;
  s: string;
  c?: string; // color
  r?: number; // rarity
  sl?: number; // slots
  cc?: number; // create_cost
  sk?: number[]; // skills stringIdx[]
  cm?: MatTuple[];
  mr?: MinRankTuple; // earliest quest progress needed to make it
  i?: number; // in-game item ID (data/items.json)
}

// ---------------------------------------------------------------------------
// Bundle envelopes
// ---------------------------------------------------------------------------

export interface WeaponBundle {
  kind: "weapon";
  type: string;
  tree: CompactTreeNode[];
  items: CompactWeapon[];
}
export interface ArmorBundle {
  kind: "armor";
  slot: string;
  rank: string;
  tree: CompactTreeNode[];
  items: CompactArmor[];
}
export interface MonsterBundle {
  kind: "monster";
  category: string;
  items: CompactMonster[];
}
export interface DecorationBundle {
  kind: "decoration";
  tree: CompactTreeNode[];
  items: CompactDecoration[];
}
export type Bundle = WeaponBundle | ArmorBundle | MonsterBundle | DecorationBundle;

/**
 * One equipment ID's page: [group, name, rarity, slug?, sex?]. `group`
 * indexes WEAPON_TYPES for weapons (types 5 and 6) or ARMOR_RANKS for armor.
 * `slug` and `sex` are only present for armor sold as separate Male and
 * Female pieces under one name, whose slugs carry the sex.
 */
export type EquipRef = [
  group: number,
  name: string,
  rarity: number | null,
  slug?: string,
  sex?: string,
];

/**
 * equipment-ids.json: indexed by equip type code (0 leggings, 1 helmet,
 * 2 plate, 3 gauntlets, 4 waist, 5 melee, 6 ranged), then by equipment ID.
 * null = an ID with no page.
 */
export type EquipmentIds = (EquipRef | null)[][];

export const EQUIP_TYPE_SLOTS = [
  "leggings",
  "helmet",
  "plate",
  "gauntlets",
  "waist",
  "melee",
  "ranged",
] as const;

/** One in-game item. Icon type/colour come from the linked recipe material. */
export interface CompactItem {
  /** NA name */
  n: string;
  /** rarity (only when sources agree) */
  r?: number;
  /** icon type index into Dictionaries.types */
  t?: number;
  /** icon colour index into Dictionaries.colors */
  c?: number;
  /** 1 = not a real item (placeholder / padding) */
  p?: 1;
}

/** items.json: in-game item ID -> item, plus material name -> item ID links. */
export interface ItemsBundle {
  kind: "items";
  /** indexed by in-game item ID; unused IDs (incl. 0) are null */
  items: (CompactItem | null)[];
  /** recipe/drop material name (as used in Dictionaries.material_ids) -> item ID */
  materials: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

const str = (d: Dictionaries, i: number | undefined): string =>
  i === undefined ? "" : (d.strings[i] ?? "");

// material id -> name via the dict's material_ids array.
function decodeMaterialById(d: Dictionaries, id: number, amount: number | string): Material {
  const name = d.material_ids[id] ?? "";
  const [typeIdx, colorIdx] = d.materials[name] ?? [0, 0];
  return {
    name,
    amount,
    type: d.types[typeIdx] ?? "",
    color: d.colors[colorIdx] ?? "",
  };
}

function decodeMats(d: Dictionaries, tuples: MatTuple[] | undefined): Material[] | undefined {
  if (!tuples || tuples.length === 0) return undefined;
  return tuples.map(([id, amount]) => decodeMaterialById(d, id, amount));
}

export function decodeTreeNode(node: CompactTreeNode, bundleType: string): WeaponTreeNode {
  return {
    slug: node.s,
    name: node.n,
    type: node.t ?? bundleType,
    rarity: node.r ?? undefined,
    color: node.c,
    element: node.e,
    min_rank: decodeMinRank(node.m),
    max_defence: node.d,
    children: node.k?.map((c) => decodeTreeNode(c, bundleType)),
  };
}

export function decodeTree(nodes: CompactTreeNode[], bundleType: string): WeaponTreeNode[] {
  return nodes.map((n) => decodeTreeNode(n, bundleType));
}

export function decodeWeapon(d: Dictionaries, w: CompactWeapon, type: string): Weapon {
  const affinity = w.af === undefined ? undefined : `${w.af}%`;
  const multiplier = d.multipliers[type];
  const raw_attack = multiplier && w.a !== undefined ? Math.floor(w.a / multiplier) : undefined;

  return {
    name: w.n,
    slug: w.s,
    type,
    attack: w.a,
    raw_attack,
    max_attack: w.ma,
    affinity,
    slots: w.sl,
    rarity: w.r,
    bonus: w.b ?? null,
    sharpness: w.sh,
    sharpness_plus: w.shp,
    elements: w.el ? w.el.map(([ei, atk]) => ({ name: d.elements[ei], attack: atk })) : null,
    notes: w.nt ? w.nt.map((ni) => d.notes[ni]) : null,
    shelling: w.sg ? { type: str(d, w.sg[0]), level: w.sg[1] } : null,
    rapid_fire: w.rf !== undefined ? str(d, w.rf) : null,
    recoil: w.re !== undefined ? str(d, w.re) : null,
    reload: w.rl !== undefined ? str(d, w.rl) : null,
    create_cost: w.cc ?? null,
    improve_cost: w.ic ?? null,
    improve_from: null,
    improve_to: null,
    create_mats: decodeMats(d, w.cm) ?? null,
    improve_mats: decodeMats(d, w.im) ?? null,
    alternative_create_mats: decodeMats(d, w.am) ?? null,
    ammo: w.amo ? w.amo.map(([ni, cap]) => ({ name: str(d, ni), capacity: cap })) : null,
    status_ammo: w.sa ? w.sa.map(([ni, cap]) => ({ name: str(d, ni), capacity: cap })) : null,
    element_ammo: w.ea ? w.ea.map(([ni, cap]) => ({ name: str(d, ni), capacity: cap })) : null,
    misc_ammo: w.mia ? w.mia.map(([ni, cap]) => ({ name: str(d, ni), capacity: cap })) : null,
    coatings: w.co ? w.co.map((ci) => str(d, ci)) : null,
    shots: w.so ? w.so.map(([ni, lv]) => ({ name: str(d, ni), level: lv })) : null,
    skills: null,
    color: w.c ?? null,
    min_rank: decodeMinRank(w.mr),
  };
}

function decodeMinRank(mr: MinRankTuple | undefined): MinRank | undefined {
  return mr ? { rank: RANKS[mr[0]], stars: mr[1] } : undefined;
}

export function decodeArmor(d: Dictionaries, a: CompactArmor, slot: string): ArmorPiece {
  return {
    name: a.n,
    slug: a.s,
    type: slot,
    defence: a.d,
    max_defence: a.md,
    max_defence_pre_ukanlos: a.mp,
    fire_res: a.re?.[0],
    water_res: a.re?.[1],
    thunder_res: a.re?.[2],
    ice_res: a.re?.[3],
    dragon_res: a.re?.[4],
    slots: a.sl,
    rarity: a.r,
    create_cost: a.cc ?? null,
    sex: a.sx !== undefined ? str(d, a.sx) : undefined,
    hunter_type: a.ht !== undefined ? str(d, a.ht) : undefined,
    skills: a.sk ? a.sk.map(([ni, amt]) => ({ name: str(d, ni), amount: amt })) : undefined,
    create_mats: decodeMats(d, a.cm),
    alternative_create_mats: decodeMats(d, a.am),
    rank: RANKS[a.rk],
    min_rank: decodeMinRank(a.mr),
  };
}

const HITZONE_COLS = ["cut", "bash", "shot", "fir", "wtr", "thn", "ice", "drg", "ko"] as const;

export function decodeMonster(d: Dictionaries, m: CompactMonster, category: string): Monster {
  const hitzones: Monster["hitzones"] = {};
  if (m.hz) {
    for (const [partIdx, vals] of m.hz) {
      const rec: Record<string, string> = {};
      vals.forEach((v, i) => {
        if (v !== null) rec[HITZONE_COLS[i]] = String(v);
      });
      hitzones[str(d, partIdx)] = rec;
    }
  }

  const drops: Monster["drops"] = {};
  if (m.dr) {
    for (const [rankIdx, sources] of m.dr) {
      const rankName = str(d, rankIdx);
      drops[rankName] = {};
      for (const [srcIdx, items] of sources) {
        drops[rankName][str(d, srcIdx)] = items.map(([matId, chanceIdx]) => {
          // Drop names carry their quantity ("Plesioth Scale x2"); the icon
          // comes from the plain material name used by recipes.
          const [name, quantity] = splitDropQuantity(d.material_ids[matId] ?? "");
          const [typeIdx, colorIdx] = d.materials[name] ?? [];
          const type = typeIdx !== undefined ? d.types[typeIdx] : undefined;
          const color = colorIdx !== undefined ? d.colors[colorIdx] : undefined;
          const drop: MonsterDrop = { name, chance: str(d, chanceIdx) };
          if (quantity !== undefined) drop.quantity = quantity;
          if (type) drop.type = type;
          if (color) drop.color = color;
          return drop;
        });
      }
    }
  }

  const attacks: Monster["attacks"] = m.at && {
    rows: m.at[0].map(([damage, guard, count, stun, statusValue, elements, statuses]) => ({
      damage,
      guard,
      count,
      ...(elements.length && { elements }),
      ...(statuses.length && { statuses }),
      ...(statusValue && { statusValue }),
      ...(stun && { stun }),
    })),
    sharedWith: m.at[1].map(([cat, name]) => ({ name, category: cat, slug: slugify(name) })),
  };

  return {
    name: m.n,
    slug: m.s,
    type: category,
    description: m.d !== undefined ? str(d, m.d) : undefined,
    habitats: m.hb ? m.hb.map((hi) => str(d, hi)) : undefined,
    hitzones: m.hz ? hitzones : undefined,
    drops: m.dr ? drops : undefined,
    sizes: m.sz ? { min: m.sz[0], max: m.sz[1] } : undefined,
    base_hp: m.hp,
    attacks,
  };
}

export function decodeDecoration(d: Dictionaries, x: CompactDecoration): Decoration {
  return {
    name: x.n,
    slug: x.s,
    type: "decoration",
    color: x.c,
    rarity: x.r,
    slots: x.sl,
    create_cost: x.cc ?? null,
    skills: x.sk ? x.sk.map((si) => str(d, si)) : undefined,
    create_mats: decodeMats(d, x.cm),
    min_rank: decodeMinRank(x.mr),
  };
}
