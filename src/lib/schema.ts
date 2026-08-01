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
} from "./types";

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
  k?: CompactTreeNode[]; // children
}

// ---------------------------------------------------------------------------
// Compact item shapes (sparse; absent = empty/default)
// ---------------------------------------------------------------------------

/** [materialId, amount] */
export type MatTuple = [number, number | string];
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
  rk?: number; // rank index into RANKS
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
  re?: number[]; // [fire, water, thunder, ice, dragon]
  sl?: number;
  r?: number; // rarity
  rk?: number; // rank idx
  cc?: number; // create_cost
  sx?: number; // sex stringIdx
  ht?: number; // hunter_type stringIdx
  sk?: [number, number][]; // skills [nameStringIdx, amount]
  cm?: MatTuple[];
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

// ---------------------------------------------------------------------------
// Decoder
// ---------------------------------------------------------------------------

const str = (d: Dictionaries, i: number | undefined): string =>
  i === undefined ? "" : d.strings[i] ?? "";

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

export function decodeTreeNode(
  node: CompactTreeNode,
  bundleType: string
): WeaponTreeNode {
  return {
    slug: node.s,
    name: node.n,
    type: node.t ?? bundleType,
    rarity: node.r ?? undefined,
    color: node.c,
    element: node.e,
    children: node.k?.map((c) => decodeTreeNode(c, bundleType)),
  };
}

export function decodeTree(nodes: CompactTreeNode[], bundleType: string): WeaponTreeNode[] {
  return nodes.map((n) => decodeTreeNode(n, bundleType));
}

export function decodeWeapon(d: Dictionaries, w: CompactWeapon, type: string): Weapon {
  const affinity = w.af === undefined ? undefined : `${w.af}%`;
  const multiplier = d.multipliers[type];
  const raw_attack =
    multiplier && w.a !== undefined ? Math.floor(w.a / multiplier) : undefined;

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
    rank: w.rk !== undefined ? RANKS[w.rk] : undefined,
  };
}

export function decodeArmor(d: Dictionaries, a: CompactArmor, slot: string): ArmorPiece {
  return {
    name: a.n,
    slug: a.s,
    type: slot,
    defence: a.d,
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
    rank: a.rk !== undefined ? RANKS[a.rk] : undefined,
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
        drops[rankName][str(d, srcIdx)] = items.map(([matId, chanceIdx]) => ({
          name: d.material_ids[matId] ?? "",
          chance: str(d, chanceIdx),
        }));
      }
    }
  }

  return {
    name: m.n,
    slug: m.s,
    type: category,
    description: m.d !== undefined ? str(d, m.d) : undefined,
    habitats: m.hb ? m.hb.map((hi) => str(d, hi)) : undefined,
    hitzones: m.hz ? hitzones : undefined,
    drops: m.dr ? drops : undefined,
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
  };
}
