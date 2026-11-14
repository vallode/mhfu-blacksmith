/**
 * Transforms data/*.json (raw items) and content/*.json (crafting trees) into
 * compact per-category bundles in public/data:
 *   - dictionaries.json          (shared materials/enums/strings/melodies)
 *   - weapon-<type>.json         (11)
 *   - armor-<slot>-<rank>.json
 *   - monster-<category>.json    (9)
 *   - quests.json                (every quest, see scripts/lib/quest-bundle.ts)
 *   - decorations.json
 *   - skills.json                (skill trees and activations, for the set builder)
 *   - equipment-ids.json         (save-file equipment IDs -> item pages)
 *   - items.json                 (in-game item ID -> name, linked to materials)
 *   - item-places.json           (where each item is gathered, farmed or sold, see src/lib/item-places.ts)
 *   - area-maps.json             (each quest's gathering points on the map, see src/lib/area-maps.ts)
 *   - combinations.json          (the Combination List, see src/lib/combinations.ts)
 *   - veggie-trades.json         (the Veggie Elder's trades, see src/lib/veggie-trades.ts)
 *   - data-manifest.json         ({ files, version })
 *
 * Reuses the transform logic from src/lib (slugify, raw_attack
 * multipliers, horn-melody join) via the same constants/helpers.
 *
 * Budget: asserts total public/data raw size < 1.85 MB and logs a gzip
 * estimate (raised from 1.5 MB for quests.json, ~190 KB, from 1.6 MB for
 * item-places.json, ~80 KB, from 1.7 MB for area-maps.json, and from 1.8 MB
 * for veggie-trades.json, ~10 KB).
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import {
  WEAPON_TYPES,
  ARMOR_SLOTS,
  ARMOR_RANKS,
  MONSTER_CATEGORIES,
  WEAPON_CLASS_MULTIPLIER,
} from "../src/lib/constants";
import { slugify, armorSlugs } from "../src/lib/slug";
import type {
  Weapon,
  ArmorPiece,
  Monster,
  Decoration,
  Material,
  Melody,
  WeaponTreeNode,
} from "../src/lib/types";
import { GUILD_RANKS, type Progress } from "../src/lib/min-rank";
import { loadMinRanks } from "./lib/min-rank-data";
import type {
  Dictionaries,
  CompactWeapon,
  CompactArmor,
  CompactMonster,
  CompactDecoration,
  CompactTreeNode,
  MatTuple,
  MinRankTuple,
  EquipRef,
  EquipmentIds,
  CompactItem,
  ItemsBundle,
} from "../src/lib/schema";
import { EQUIP_TYPE_SLOTS } from "../src/lib/schema";
import {
  buildItemNameIndex,
  decorationItemId,
  normalizeItemName,
  type ItemRecord,
} from "../src/lib/items";
import { encodeQuestBundle, monsterSizeRanges, type QuestRecord } from "./lib/quest-bundle";
import { encodeCombinations, type CombinationsFile } from "../src/lib/combinations";
import { encodeVeggieTrades, type VeggieTradesFile } from "../src/lib/veggie-trades";
import {
  buildItemPlaces,
  encodeItemPlaces,
  type FarmFile,
  type GatheringFile,
  type ShopsFile,
} from "../src/lib/item-places";
import { buildAreaMaps } from "../src/lib/area-maps";
import { flinchThreshold } from "../src/lib/monster-breaks";
import type { HitboxCapsule } from "../src/lib/models";
import { readData } from "game-data";

const root = process.cwd();
const contentDir = path.join(root, "content");
const dataDir = DATA_DIR;
const outDir = path.join(root, "public", "data");

const RANKS = ["low-rank", "high-rank", "g-rank"];
const minRanks = loadMinRanks(dataDir);

const BUDGET_BYTES = 1.85 * 1024 * 1024;

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
}

// ---------------------------------------------------------------------------
// Interners
// ---------------------------------------------------------------------------
const materialIndex = new Map<string, number>(); // name -> id (insertion order)
const materialTC = new Map<string, [string, string]>(); // name -> [type,color]
const typeIndex = new Map<string, number>();
const colorIndex = new Map<string, number>();
const elementIndex = new Map<string, number>();
const noteIndex = new Map<string, number>();
const stringIndex = new Map<string, number>();

function intern(map: Map<string, number>, value: string): number {
  let i = map.get(value);
  if (i === undefined) {
    i = map.size;
    map.set(value, i);
  }
  return i;
}
const internString = (v: string | null | undefined): number | undefined =>
  v === null || v === undefined || v === "" ? undefined : intern(stringIndex, v);

function internMaterial(m: Material): number {
  let id = materialIndex.get(m.name);
  if (id === undefined) {
    id = materialIndex.size;
    materialIndex.set(m.name, id);
    materialTC.set(m.name, [m.type ?? "", m.color ?? ""]);
    intern(typeIndex, m.type ?? "");
    intern(colorIndex, m.color ?? "");
  } else if (m.type) {
    // Upgrade a placeholder (e.g. interned first via a monster drop with no
    // icon metadata) once the real material's type/color is known.
    const existing = materialTC.get(m.name)!;
    if (!existing[0]) {
      materialTC.set(m.name, [m.type, m.color ?? ""]);
      intern(typeIndex, m.type);
      intern(colorIndex, m.color ?? "");
    }
  }
  return id;
}

function toNum(v: string | number | null | undefined): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

function matTuples(mats: Material[] | null | undefined): MatTuple[] | undefined {
  if (!mats || mats.length === 0) return undefined;
  return mats.map((m) => {
    const id = internMaterial(m);
    const amt = toNum(m.amount);
    return [id, amt !== undefined ? amt : m.amount];
  });
}

// ---------------------------------------------------------------------------
// Tree compaction
// ---------------------------------------------------------------------------
/** The minimum rank of a tree node, found by the node's type and slug. */
type MinRankLookup = (type: string, slug: string) => MinRankTuple | undefined;

function compactTreeNode(
  node: WeaponTreeNode,
  bundleType: string,
  minRankOf?: MinRankLookup,
  maxDefenceOf?: (slug: string) => number | undefined,
): CompactTreeNode {
  const out: CompactTreeNode = { s: node.slug, n: node.name };
  if (node.type && node.type !== bundleType) out.t = node.type;
  if (node.rarity !== undefined) out.r = node.rarity === null ? null : (toNum(node.rarity) ?? null);
  if (node.color) out.c = node.color;
  if (node.element) out.e = node.element;
  const mr = minRankOf?.(node.type || bundleType, node.slug);
  if (mr) out.m = mr;
  const md = maxDefenceOf?.(node.slug);
  if (md !== undefined) out.d = md;
  if (node.alias) out.a = 1;
  if (node.children && node.children.length > 0) {
    out.k = node.children.map((c) => compactTreeNode(c, bundleType, minRankOf, maxDefenceOf));
  }
  return out;
}
const compactTree = (
  nodes: WeaponTreeNode[],
  bundleType: string,
  minRankOf?: MinRankLookup,
  maxDefenceOf?: (slug: string) => number | undefined,
): CompactTreeNode[] => nodes.map((n) => compactTreeNode(n, bundleType, minRankOf, maxDefenceOf));

// ---------------------------------------------------------------------------
// Item encoders
// ---------------------------------------------------------------------------
function encodeMinRank(p: Progress): MinRankTuple | undefined {
  return p ? [GUILD_RANKS.indexOf(p.rank), p.stars] : undefined;
}

function encodeWeapon(w: Weapon, minRank: Progress): CompactWeapon {
  const out: CompactWeapon = { n: w.name, s: w.slug };
  const attack = toNum(w.attack);
  if (attack !== undefined) out.a = attack;
  const maxAttack = toNum(w.max_attack);
  if (maxAttack !== undefined) out.ma = maxAttack;
  if (w.affinity !== undefined && w.affinity !== null) {
    out.af = Number(String(w.affinity).replace("%", "")) || 0;
  }
  if (w.slots !== undefined) out.sl = Number(w.slots);
  const rarity = toNum(w.rarity);
  if (rarity !== undefined) out.r = rarity;
  if (w.bonus) out.b = String(w.bonus);
  if (Array.isArray(w.sharpness)) out.sh = w.sharpness.map((v) => Number(v));
  if (Array.isArray(w.sharpness_plus)) out.shp = w.sharpness_plus.map((v) => Number(v));
  if (Array.isArray(w.elements) && w.elements.length > 0) {
    out.el = w.elements.map((e) => [intern(elementIndex, e.name), Number(e.attack)]);
  }
  if (Array.isArray(w.notes) && w.notes.length > 0) {
    out.nt = w.notes.map((n) => intern(noteIndex, n));
  }
  if (w.shelling) out.sg = [intern(stringIndex, w.shelling.type), Number(w.shelling.level)];
  const rf = internString(w.rapid_fire);
  if (rf !== undefined) out.rf = rf;
  const re = internString(w.recoil);
  if (re !== undefined) out.re = re;
  const rl = internString(w.reload);
  if (rl !== undefined) out.rl = rl;
  const cc = toNum(w.create_cost);
  if (cc !== undefined) out.cc = cc;
  const ic = toNum(w.improve_cost);
  if (ic !== undefined) out.ic = ic;
  const mr = encodeMinRank(minRank);
  if (mr) out.mr = mr;
  if (w.color) out.c = w.color;
  const cm = matTuples(w.create_mats);
  if (cm) out.cm = cm;
  const im = matTuples(w.improve_mats);
  if (im) out.im = im;
  const am = matTuples(w.alternative_create_mats);
  if (am) out.am = am;
  const ammo = encodeAmmo(w.ammo);
  if (ammo) out.amo = ammo;
  const sa = encodeAmmo(w.status_ammo);
  if (sa) out.sa = sa;
  const ea = encodeAmmo(w.element_ammo);
  if (ea) out.ea = ea;
  const mia = encodeAmmo(w.misc_ammo);
  if (mia) out.mia = mia;
  if (Array.isArray(w.coatings) && w.coatings.length > 0) {
    out.co = w.coatings.map((c) => intern(stringIndex, c));
  }
  if (Array.isArray(w.shots) && w.shots.length > 0) {
    out.so = w.shots.map((s) => [intern(stringIndex, s.name), Number(s.level)]);
  }
  return out;
}

function encodeAmmo(
  arr: { name: string; capacity: number[] }[] | null | undefined,
): [number, number[]][] | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr.map((a) => [intern(stringIndex, a.name), a.capacity.map(Number)]);
}

function encodeArmor(a: ArmorPiece, minRank: Progress): CompactArmor {
  const out: CompactArmor = { n: a.name, s: a.slug, rk: RANKS.indexOf(a.rank) };
  const d = toNum(a.defence);
  if (d !== undefined) out.d = d;
  const md = toNum(a.max_defence);
  if (md !== undefined) out.md = md;
  const mp = toNum(a.max_defence_pre_ukanlos);
  if (mp !== undefined) out.mp = mp;
  const res = [a.fire_res, a.water_res, a.thunder_res, a.ice_res, a.dragon_res].map(toNum);
  if (res.some((v) => v !== undefined)) out.re = res.map((v) => v ?? 0);
  if (a.slots !== undefined) out.sl = Number(a.slots);
  const rarity = toNum(a.rarity);
  if (rarity !== undefined) out.r = rarity;
  const mr = encodeMinRank(minRank);
  if (mr) out.mr = mr;
  const cc = toNum(a.create_cost);
  if (cc !== undefined) out.cc = cc;
  const sx = internString(a.sex);
  if (sx !== undefined) out.sx = sx;
  const ht = internString(a.hunter_type);
  if (ht !== undefined) out.ht = ht;
  if (Array.isArray(a.skills) && a.skills.length > 0) {
    out.sk = a.skills.map((s) => [intern(stringIndex, s.name), toNum(s.amount) ?? 0]);
  }
  const cm = matTuples(a.create_mats);
  if (cm) out.cm = cm;
  const am = matTuples(a.alternative_create_mats);
  if (am) out.am = am;
  return out;
}

// ---------------------------------------------------------------------------
// Monster hitboxes (public/models, see src/lib/models.ts)
// ---------------------------------------------------------------------------
const modelsDir = path.join(root, "public", "models");
const monsterModelsPath = path.join(modelsDir, "manifest", "monsters.json");
const monsterModels: Record<string, number> = fs.existsSync(monsterModelsPath)
  ? readJson(monsterModelsPath)
  : {};

/** A monster's hitbox capsules, from the file next to its model; null if it has none. */
function monsterHitboxes(name: string): HitboxCapsule[] | null {
  const id = monsterModels[name];
  if (!id) return null;
  const p = path.join(modelsDir, "monsters", `em${String(id).padStart(2, "0")}.hitboxes.json`);
  if (!fs.existsSync(p)) return null;
  const { capsules } = readJson<{ capsules: HitboxCapsule[] }>(p);
  return capsules.length ? capsules : null;
}

/**
 * Each hitzone row's flinch threshold, from the body parts of the row's
 * hitboxes: the site needs the hitboxes to tell which `flinch_thresholds`
 * belong to a row, so the build works it out rather than the page.
 */
function hitzoneFlinch(m: Monster): (string | null)[] | null {
  const thresholds = m.flinch_thresholds;
  if (!m.hitzones || !thresholds) return null;
  const hitboxes = monsterHitboxes(m.name);
  if (!hitboxes) return null;
  // Rows without a threshold stay null: the page shows "—" for them, even
  // when no row has one.
  return Object.keys(m.hitzones).map((name) =>
    flinchThreshold(
      thresholds,
      hitboxes.filter((c) => c.parts.includes(name)).map((c) => c.part),
    ),
  );
}

function encodeMonster(
  m: Monster,
  sizeRange: { min: number; max: number } | undefined,
): CompactMonster {
  const out: CompactMonster = { n: m.name, s: m.slug };
  const d = internString(m.description);
  if (d !== undefined) out.d = d;
  if (Array.isArray(m.habitats) && m.habitats.length > 0) {
    out.hb = m.habitats.map((h) => intern(stringIndex, h));
  }
  if (m.hitzones && Object.keys(m.hitzones).length > 0) {
    const COLS = ["cut", "bash", "shot", "fir", "wtr", "thn", "ice", "drg", "ko"] as const;
    out.hz = Object.entries(m.hitzones).map(([part, vals]) => [
      intern(stringIndex, part),
      COLS.map((c) => {
        const v = vals[c as keyof typeof vals];
        return v === undefined ? null : Number(v);
      }),
    ]);
  }
  if (typeof m.base_hp === "number") out.hp = m.base_hp;
  if (typeof m.base_size === "number") out.bs = m.base_size;
  if (m.crowns) out.cr = [m.crowns.mini, m.crowns.silver, m.crowns.gold];
  if (sizeRange) out.sz = [sizeRange.min, sizeRange.max];
  if (Array.isArray(m.breaks) && m.breaks.length > 0) out.bk = m.breaks;
  const flinch = out.hz && hitzoneFlinch(m);
  if (flinch) out.hf = flinch.map((v) => (v === null ? null : intern(stringIndex, v)));
  if (m.drops && Object.keys(m.drops).length > 0) {
    out.dr = Object.entries(m.drops).map(([rankName, sources]) => [
      intern(stringIndex, rankName),
      Object.entries(sources).map(([src, items]) => [
        intern(stringIndex, src),
        items.map((drop) => [
          internMaterial({ name: drop.name, amount: 0, type: "", color: "" }),
          intern(stringIndex, drop.chance),
        ]),
      ]),
    ]);
  }
  return out;
}

function encodeDecoration(
  x: Decoration,
  minRank: Progress,
  itemId: number | undefined,
): CompactDecoration {
  const out: CompactDecoration = { n: x.name, s: x.slug };
  if (itemId !== undefined) out.i = itemId;
  if (x.color) out.c = x.color;
  const rarity = toNum(x.rarity);
  if (rarity !== undefined) out.r = rarity;
  if (x.slots !== undefined) out.sl = Number(x.slots);
  const cc = toNum(x.create_cost);
  if (cc !== undefined) out.cc = cc;
  if (Array.isArray(x.skills) && x.skills.length > 0) {
    out.sk = x.skills.map((s) => intern(stringIndex, s));
  }
  const cm = matTuples(x.create_mats);
  if (cm) out.cm = cm;
  const am = matTuples(x.alternative_create_mats);
  if (am) out.am = am;
  const mr = encodeMinRank(minRank);
  if (mr) out.mr = mr;
  return out;
}

// ---------------------------------------------------------------------------
// Load + transform per category
// ---------------------------------------------------------------------------
interface FileOut {
  name: string;
  json: string;
}
const files: FileOut[] = [];
let totalItems = 0;

function push(name: string, obj: unknown) {
  files.push({ name, json: JSON.stringify(obj) });
}

// Decorations' item IDs -> gem colour, so items.json gives jewels their icon.
const decorationIcons = new Map<number, string>();

// Page refs by name, for equipment-ids.json below.
const weaponRefs = new Map<string, EquipRef>(); // "<type>|<name>"
const armorRefs = new Map<string, EquipRef>(); // "<slot>|<name>|<sex>" and "<slot>|<name>"

// Weapons
// Horn melodies, shared per note set: every horn with the same notes has
// the same list (data/weapons/hunting-horn.json, from the disc).
const melodies: Record<string, Melody[]> = {};
for (const horn of readData<{ weapons: Weapon[] }>(dataDir, "weapons", "hunting-horn.json")
  .weapons) {
  if (!horn.notes || !horn.melodies) continue;
  const key = horn.notes.join("-");
  if (key in melodies && JSON.stringify(melodies[key]) !== JSON.stringify(horn.melodies)) {
    throw new Error(`Horns with notes ${key} have different melodies (${horn.name}).`);
  }
  melodies[key] = horn.melodies;
}

// A weapon's tree rows can include weapons of other types, so every type's
// minimum rank is known before any tree is written.
const weaponMinRanks = new Map<string, MinRankTuple | undefined>();
for (const type of WEAPON_TYPES) {
  const { weapons } = readData<{ weapons: Weapon[] }>(dataDir, "weapons", `${type}.json`);
  for (const w of weapons)
    weaponMinRanks.set(`${type}|${slugify(w.name)}`, encodeMinRank(minRanks.weapon(type, w.name)));
}
const weaponMinRank: MinRankLookup = (type, slug) => weaponMinRanks.get(`${type}|${slug}`);

for (const type of WEAPON_TYPES) {
  const crafting = readData<{ weapons: Weapon[] }>(dataDir, "weapons", `${type}.json`);
  const tree = readJson<{ map: WeaponTreeNode[] }>(
    path.join(contentDir, "blacksmith", type, "map.json"),
  );
  const items = crafting.weapons.map((w) =>
    encodeWeapon({ ...w, slug: slugify(w.name) }, minRanks.weapon(type, w.name)),
  );
  for (const w of items) {
    weaponRefs.set(`${type}|${w.n}`, [WEAPON_TYPES.indexOf(type), w.n, w.r ?? null]);
  }
  totalItems += items.length;
  push(`weapon-${type}.json`, {
    kind: "weapon",
    type,
    tree: compactTree(tree.map, type, weaponMinRank),
    items,
  });
}

// Armor — data/armor/<slot>.json holds every rank in one file (each piece
// carries its own "rank"), while the crafting tree is still split per rank
// under content/armorsmith/<slot>/<rank>/map.json.
for (const slot of ARMOR_SLOTS) {
  const allPieces = readData<{ armor: ArmorPiece[] }>(dataDir, "armor", `${slot}.json`).armor;
  for (const rank of ARMOR_RANKS) {
    const pieces = allPieces.filter((p) => p.rank === rank);
    if (pieces.length === 0) continue;
    const treePath = path.join(contentDir, "armorsmith", slot, rank, "map.json");
    const tree = fs.existsSync(treePath)
      ? readJson<{ map: WeaponTreeNode[] }>(treePath)
      : { map: [] };
    const slugs = armorSlugs(pieces);
    const items = pieces.map((p, i) =>
      encodeArmor({ ...p, slug: slugs[i], rank }, minRanks.armor(p)),
    );
    pieces.forEach((p, i) => {
      const ref: EquipRef = [ARMOR_RANKS.indexOf(rank), p.name, items[i].r ?? null];
      if (slugs[i] !== slugify(p.name)) ref.push(slugs[i], p.sex ?? "");
      armorRefs.set(`${slot}|${p.name}|${p.sex ?? ""}`, ref);
      armorRefs.set(`${slot}|${p.name}`, ref);
    });
    const minRankBySlug = new Map(items.map((i) => [i.s, i.mr]));
    const maxDefenceBySlug = new Map(items.map((i) => [i.s, i.md]));
    totalItems += items.length;
    push(`armor-${slot}-${rank}.json`, {
      kind: "armor",
      slot,
      rank,
      tree: compactTree(
        tree.map,
        slot,
        (_type, slug) => minRankBySlug.get(slug),
        (slug) => maxDefenceBySlug.get(slug),
      ),
      items,
    });
  }
}

// Every quest, for the monsters' size ranges and the quests bundle.
const questDir = path.join(dataDir, "quests");
const quests = fs
  .readdirSync(questDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .flatMap((f) => readData<{ quests: QuestRecord[] }>(dataDir, "quests", f).quests);
const sizeRanges = monsterSizeRanges(quests);

// Monsters
for (const category of MONSTER_CATEGORIES) {
  const p = path.join(dataDir, "monsters", `${category}.json`);
  if (!fs.existsSync(p)) continue;
  const data = readData<{ monsters: Monster[] }>(dataDir, "monsters", `${category}.json`);
  const items = data.monsters.map((m) =>
    encodeMonster({ ...m, slug: slugify(m.name) }, sizeRanges.get(m.name)),
  );
  totalItems += items.length;
  push(`monster-${category}.json`, { kind: "monster", category, items });
}

// Quests: one bundle for every hub. Items are in-game IDs (names and icons
// come from items.json), monsters link to their pages and get their HP in
// each quest from their base HP.
{
  const monsterPages = new Map<string, { category: string; slug: string }>();
  const baseHp = new Map<string, number>();
  for (const category of MONSTER_CATEGORIES) {
    const p = path.join(dataDir, "monsters", `${category}.json`);
    if (!fs.existsSync(p)) continue;
    for (const m of readData<{ monsters: Monster[] }>(dataDir, "monsters", `${category}.json`)
      .monsters) {
      monsterPages.set(m.name, { category, slug: slugify(m.name) });
      if (typeof m.base_hp === "number") baseHp.set(m.name, m.base_hp);
    }
  }
  const { index } = buildItemNameIndex(
    readData<{ items: ItemRecord[] }>(dataDir, "items.json").items,
  );
  const gathering = readData<GatheringFile>(dataDir, "gathering.json");
  const areaMaps = buildAreaMaps(gathering);
  const { bundle, unresolvedItems } = encodeQuestBundle({
    quests,
    itemId: (name) => index.get(normalizeItemName(name)),
    monsterPage: (name) => monsterPages.get(name),
    baseHp: (name) => baseHp.get(name),
    hasAreaMap: (questId) => questId in areaMaps.quests,
  });
  if (unresolvedItems.length > 0) {
    console.warn(`generate-data: quest items not in items.json: ${unresolvedItems.join(", ")}`);
  }
  totalItems += bundle.items.length;
  push("quests.json", bundle);

  // Where each item is gathered (data/gathering.json, data/farm.json) or sold (data/shops.json).
  push("area-maps.json", areaMaps);
  const places = buildItemPlaces(
    gathering,
    readData<ShopsFile>(dataDir, "shops.json"),
    readData<FarmFile>(dataDir, "farm.json"),
    quests,
    (name) => index.get(normalizeItemName(name)),
  );
  push("item-places.json", encodeItemPlaces(places));
  push(
    "combinations.json",
    encodeCombinations(readData<CombinationsFile>(dataDir, "combinations.json")),
  );
  const trades = encodeVeggieTrades(
    readData<VeggieTradesFile>(dataDir, "veggie-trades.json"),
    (name) => index.get(normalizeItemName(name)),
  );
  if (trades.unresolved.length > 0) {
    console.warn(`generate-data: trade items not in items.json: ${trades.unresolved.join(", ")}`);
  }
  push("veggie-trades.json", trades.bundle);
}

// Decorations
{
  const crafting = readData<{ decorations: Decoration[] }>(dataDir, "decorations.json");
  const tree = readJson<{ map: WeaponTreeNode[] }>(
    path.join(contentDir, "decorations", "map.json"),
  );
  // The game's item IDs, for set share links (src/lib/set-codec.ts).
  const { index: itemIndex } = buildItemNameIndex(
    readData<{ items: ItemRecord[] }>(dataDir, "items.json").items,
  );
  const unmatched = crafting.decorations.filter(
    (d) => decorationItemId(d.name, itemIndex) === undefined,
  );
  if (unmatched.length > 0) {
    console.error(
      `generate-data: FAIL — decorations with no item in items.json: ${unmatched.map((d) => d.name).join(", ")}`,
    );
    process.exit(1);
  }
  for (const d of crafting.decorations) {
    decorationIcons.set(decorationItemId(d.name, itemIndex)!, d.color ?? "");
  }
  const items = crafting.decorations.map((d) =>
    encodeDecoration(
      { ...d, slug: slugify(d.name) },
      minRanks.decoration(d),
      decorationItemId(d.name, itemIndex),
    ),
  );
  totalItems += items.length;
  push("decorations.json", {
    kind: "decoration",
    tree: compactTree(tree.map, "decoration"),
    items,
  });
}

// Skills: data/skills.json as is (skill trees and their activations), for the
// set builder.
push("skills.json", readData<{ skills: unknown[] }>(dataDir, "skills.json"));

// Equipment IDs: data/equipment-ids.json (by slot name, generated by
// scripts/generate-equipment-ids.ts) resolved to page refs, by type code.
{
  type IdEntry = { name: string; type?: string; sex?: string } | null;
  const ids = readData<Record<string, IdEntry[]>>(dataDir, "equipment-ids.json");
  const out: EquipmentIds = EQUIP_TYPE_SLOTS.map((slot) =>
    (ids[slot] ?? []).map((e) => {
      if (!e) return null;
      const ref = e.type
        ? weaponRefs.get(`${e.type}|${e.name}`)
        : armorRefs.get(e.sex ? `${slot}|${e.name}|${e.sex}` : `${slot}|${e.name}`);
      return ref ?? null;
    }),
  );
  push("equipment-ids.json", out);
}

/** The Icon `type` and `color` for an item's disc icon, or null when the disc gave none. */
function itemIcon(record: ItemRecord | undefined): [string, string] | null {
  if (record?.icon === undefined || record.color === undefined) return null;
  return [`item-${record.icon}`, `item-${record.color}`];
}

// Items (in-game item ID -> name). Runs after every bundle above so that all
// recipe/drop material names are interned and can be linked to an item ID.
{
  const { items: records } = readData<{ items: ItemRecord[] }>(dataDir, "items.json");
  const { index } = buildItemNameIndex(records);

  // material name -> item ID, for every interned material that resolves.
  const materials: Record<string, number> = {};
  for (const name of materialIndex.keys()) {
    const id = index.get(normalizeItemName(name));
    if (id !== undefined) materials[name] = id;
  }

  // The disc gives items their own icon and tint (see `itemIcon` above).
  // Materials use that too, wherever one names an item that has one.
  const recordById = new Map(records.map((r) => [r.id, r]));
  for (const [name, id] of Object.entries(materials)) {
    const icon = itemIcon(recordById.get(id));
    if (!icon) continue;
    materialTC.set(name, icon);
    intern(typeIndex, icon[0]);
    intern(colorIndex, icon[1]);
  }

  // Pick an icon for each item from its linked materials: prefer the material
  // spelled exactly like the item, then any linked material with a known type.
  const iconFor = new Map<number, [string, string]>();
  const byName = new Map(records.map((r) => [r.id, r.name]));
  for (const [name, id] of Object.entries(materials)) {
    const [type, color] = materialTC.get(name) ?? ["", ""];
    if (!type) continue;
    if (!iconFor.has(id) || name === byName.get(id)) iconFor.set(id, [type, color]);
  }
  for (const [id, color] of decorationIcons) {
    if (!iconFor.has(id)) iconFor.set(id, ["decoration", color]);
  }

  const maxId = Math.max(...records.map((r) => r.id));
  const items: (CompactItem | null)[] = new Array(maxId + 1).fill(null);
  for (const r of records) {
    const out: CompactItem = { n: r.name };
    if (r.rarity !== undefined) out.r = r.rarity;
    if (r.carry !== undefined) out.l = r.carry;
    if (r.price !== undefined) out.z = r.price;
    const icon = itemIcon(r) ?? iconFor.get(r.id);
    if (icon) {
      out.t = intern(typeIndex, icon[0]);
      out.c = intern(colorIndex, icon[1]);
    }
    if (r.placeholder) out.p = 1;
    items[r.id] = out;
  }
  totalItems += records.length;
  const bundle: ItemsBundle = { kind: "items", items, materials };
  push("items.json", bundle);
}

// ---------------------------------------------------------------------------
// Dictionaries + manifest
// ---------------------------------------------------------------------------
const fromIndex = (map: Map<string, number>): string[] => {
  const arr = new Array(map.size);
  for (const [v, i] of map) arr[i] = v;
  return arr;
};

const materialsDict: Record<string, [number, number]> = {};
for (const [name, [type, color]] of materialTC) {
  materialsDict[name] = [typeIndex.get(type)!, colorIndex.get(color)!];
}
// Re-order materials dict so keys follow insertion (id) order.
const orderedMaterials: Record<string, [number, number]> = {};
for (const [name] of [...materialIndex.entries()].sort((a, b) => a[1] - b[1])) {
  orderedMaterials[name] = materialsDict[name];
}

const dictionaries: Dictionaries = {
  materials: orderedMaterials,
  material_ids: Object.keys(orderedMaterials),
  types: fromIndex(typeIndex),
  colors: fromIndex(colorIndex),
  elements: fromIndex(elementIndex),
  notes: fromIndex(noteIndex),
  strings: fromIndex(stringIndex),
  multipliers: WEAPON_CLASS_MULTIPLIER,
  melodies,
};
push("dictionaries.json", dictionaries);

// Write all files, compute sizes + content-hash manifest.
import { createHash } from "crypto";
import { DATA_DIR } from "../src/lib/paths";

fs.mkdirSync(outDir, { recursive: true });
const hash = createHash("sha256");
let totalRaw = 0;
let totalGzip = 0;
const manifestFiles: string[] = [];

for (const f of files) {
  const buf = Buffer.from(f.json, "utf-8");
  fs.writeFileSync(path.join(outDir, f.name), buf);
  hash.update(buf);
  totalRaw += buf.length;
  totalGzip += zlib.gzipSync(buf).length;
  manifestFiles.push(f.name);
}

const version = hash.digest("hex").slice(0, 16);
const manifest = { version, files: manifestFiles };
fs.writeFileSync(path.join(outDir, "data-manifest.json"), JSON.stringify(manifest));

// Image manifest for the offline-download UI (and SW parity): every image the
// site uses, i.e. all of public/images minus scripts/lib/precache-exclude.json.
const imagesDir = path.join(process.cwd(), "public", "images");
const excludedImages = (
  JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "scripts", "lib", "precache-exclude.json"), "utf-8"),
  ) as { exclude: string[] }
).exclude;
const isExcludedImage = (relative: string) =>
  excludedImages.some((e) => (e.endsWith("/") ? relative.startsWith(e) : relative === e));
const imageUrls: string[] = [];
const walkImages = (dir: string) => {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(imagesDir, full).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (!isExcludedImage(`${relative}/`)) walkImages(full);
    } else if (/\.(png|jpe?g|webp|gif)$/i.test(entry.name) && !isExcludedImage(relative)) {
      imageUrls.push(`/images/${relative}`);
    }
  }
};
walkImages(imagesDir);
imageUrls.sort();
fs.writeFileSync(path.join(outDir, "image-manifest.json"), JSON.stringify(imageUrls));

const fmt = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;

console.log(
  `generate-data: ${files.length} bundles, ${totalItems} items → public/data  raw=${fmt(totalRaw)}  gzip≈${fmt(totalGzip)}  version=${version}`,
);

if (totalRaw > BUDGET_BYTES) {
  console.error(
    `generate-data: FAIL — raw size ${fmt(totalRaw)} exceeds budget ${fmt(BUDGET_BYTES)}`,
  );
  process.exit(1);
}
