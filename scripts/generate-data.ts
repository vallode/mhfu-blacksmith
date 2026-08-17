/**
 * Transforms data/*.json (raw items) and content/*.json (crafting trees) into
 * compact per-category bundles in public/data:
 *   - dictionaries.json          (shared materials/enums/strings/melodies)
 *   - weapon-<type>.json         (11)
 *   - armor-<slot>-<rank>.json
 *   - monster-<category>.json    (9)
 *   - decorations.json
 *   - data-manifest.json         ({ files, version })
 *
 * Reuses the transform logic from src/lib (slugify, computeRank, raw_attack
 * multipliers, horn-melody join) via the same constants/helpers.
 *
 * Budget: asserts total public/data raw size < 1.5 MB and logs a gzip estimate.
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
import { slugify } from "../src/lib/slug";
import type {
  Weapon,
  ArmorPiece,
  Monster,
  Decoration,
  Material,
  Melody,
  WeaponTreeNode,
} from "../src/lib/types";
import type {
  Dictionaries,
  CompactWeapon,
  CompactArmor,
  CompactMonster,
  CompactDecoration,
  CompactTreeNode,
  MatTuple,
} from "../src/lib/schema";

const root = process.cwd();
const contentDir = path.join(root, "content");
const dataDir = path.join(root, "data");
const outDir = path.join(root, "public", "data");

const RANKS = ["low-rank", "high-rank", "g-rank"];
const BUDGET_BYTES = 1.5 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Shared logic (ported from src/lib/weapons.ts / armor.ts)
// ---------------------------------------------------------------------------
function computeRank(hr: string | number | undefined, elder: string | number | undefined): string {
  const hrNum = Number(hr ?? 0);
  if (hrNum <= 5) return "low-rank";
  if (hrNum <= 8) return "high-rank";
  if (hrNum > 8 && Number(elder)) return "g-rank";
  return "high-rank";
}

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
function compactTreeNode(node: WeaponTreeNode, bundleType: string): CompactTreeNode {
  const out: CompactTreeNode = { s: node.slug, n: node.name };
  if (node.type && node.type !== bundleType) out.t = node.type;
  if (node.rarity !== undefined) out.r = node.rarity === null ? null : toNum(node.rarity) ?? null;
  if (node.color) out.c = node.color;
  if (node.element) out.e = node.element;
  if (node.children && node.children.length > 0) {
    out.k = node.children.map((c) => compactTreeNode(c, bundleType));
  }
  return out;
}
const compactTree = (nodes: WeaponTreeNode[], bundleType: string): CompactTreeNode[] =>
  nodes.map((n) => compactTreeNode(n, bundleType));

// ---------------------------------------------------------------------------
// Item encoders
// ---------------------------------------------------------------------------
function encodeWeapon(w: Weapon): CompactWeapon {
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
  const rf = internString(w.rapid_fire); if (rf !== undefined) out.rf = rf;
  const re = internString(w.recoil); if (re !== undefined) out.re = re;
  const rl = internString(w.reload); if (rl !== undefined) out.rl = rl;
  const cc = toNum(w.create_cost); if (cc !== undefined) out.cc = cc;
  const ic = toNum(w.improve_cost); if (ic !== undefined) out.ic = ic;
  out.rk = RANKS.indexOf(w.rank ?? computeRank(w.hr, w.elder));
  if (w.color) out.c = w.color;
  const cm = matTuples(w.create_mats); if (cm) out.cm = cm;
  const im = matTuples(w.improve_mats); if (im) out.im = im;
  const am = matTuples(w.alternative_create_mats); if (am) out.am = am;
  const ammo = encodeAmmo(w.ammo); if (ammo) out.amo = ammo;
  const sa = encodeAmmo(w.status_ammo); if (sa) out.sa = sa;
  const ea = encodeAmmo(w.element_ammo); if (ea) out.ea = ea;
  const mia = encodeAmmo(w.misc_ammo); if (mia) out.mia = mia;
  if (Array.isArray(w.coatings) && w.coatings.length > 0) {
    out.co = w.coatings.map((c) => intern(stringIndex, c));
  }
  if (Array.isArray(w.shots) && w.shots.length > 0) {
    out.so = w.shots.map((s) => [intern(stringIndex, s.name), Number(s.level)]);
  }
  return out;
}

function encodeAmmo(
  arr: { name: string; capacity: number[] }[] | null | undefined
): [number, number[]][] | undefined {
  if (!arr || arr.length === 0) return undefined;
  return arr.map((a) => [intern(stringIndex, a.name), a.capacity.map(Number)]);
}

function encodeArmor(a: ArmorPiece): CompactArmor {
  const out: CompactArmor = { n: a.name, s: a.slug };
  const d = toNum(a.defence); if (d !== undefined) out.d = d;
  const res = [a.fire_res, a.water_res, a.thunder_res, a.ice_res, a.dragon_res].map(toNum);
  if (res.some((v) => v !== undefined)) out.re = res.map((v) => v ?? 0);
  if (a.slots !== undefined) out.sl = Number(a.slots);
  const rarity = toNum(a.rarity); if (rarity !== undefined) out.r = rarity;
  out.rk = RANKS.indexOf(a.rank ?? computeRank(a.hr, a.elder));
  const cc = toNum(a.create_cost); if (cc !== undefined) out.cc = cc;
  const sx = internString(a.sex); if (sx !== undefined) out.sx = sx;
  const ht = internString(a.hunter_type); if (ht !== undefined) out.ht = ht;
  if (Array.isArray(a.skills) && a.skills.length > 0) {
    out.sk = a.skills.map((s) => [intern(stringIndex, s.name), toNum(s.amount) ?? 0]);
  }
  const cm = matTuples(a.create_mats); if (cm) out.cm = cm;
  return out;
}

function encodeMonster(m: Monster): CompactMonster {
  const out: CompactMonster = { n: m.name, s: m.slug };
  const d = internString(m.description); if (d !== undefined) out.d = d;
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

function encodeDecoration(x: Decoration): CompactDecoration {
  const out: CompactDecoration = { n: x.name, s: x.slug };
  if (x.color) out.c = x.color;
  const rarity = toNum(x.rarity); if (rarity !== undefined) out.r = rarity;
  if (x.slots !== undefined) out.sl = Number(x.slots);
  const cc = toNum(x.create_cost); if (cc !== undefined) out.cc = cc;
  if (Array.isArray(x.skills) && x.skills.length > 0) {
    out.sk = x.skills.map((s) => intern(stringIndex, s));
  }
  const cm = matTuples(x.create_mats); if (cm) out.cm = cm;
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

// Weapons
const melodies = readJson<Record<string, Melody[]>>(
  path.join(contentDir, "blacksmith", "hunting-horn", "hunting-horn-melodies.json")
);

for (const type of WEAPON_TYPES) {
  const crafting = readJson<{ weapons: Weapon[] }>(
    path.join(dataDir, "weapons", `${type}.json`)
  );
  const tree = readJson<{ map: WeaponTreeNode[] }>(
    path.join(contentDir, "blacksmith", type, "map.json")
  );
  const items = crafting.weapons
    .filter((w) => !("donotrender" in w))
    .map((w) =>
      encodeWeapon({ ...w, slug: slugify(w.name), rank: computeRank(w.hr, w.elder) })
    );
  totalItems += items.length;
  push(`weapon-${type}.json`, {
    kind: "weapon",
    type,
    tree: compactTree(tree.map, type),
    items,
  });
}

// Armor — data/armor/<slot>.json holds every rank in one file (each piece
// carries its own "rank"), while the crafting tree is still split per rank
// under content/armorsmith/<slot>/<rank>/map.json.
for (const slot of ARMOR_SLOTS) {
  const allPieces = readJson<{ armor: ArmorPiece[] }>(
    path.join(dataDir, "armor", `${slot}.json`)
  ).armor;
  for (const rank of ARMOR_RANKS) {
    const pieces = allPieces.filter((p) => (p.rank ?? computeRank(p.hr, p.elder)) === rank);
    if (pieces.length === 0) continue;
    const treePath = path.join(contentDir, "armorsmith", slot, rank, "map.json");
    const tree = fs.existsSync(treePath)
      ? readJson<{ map: WeaponTreeNode[] }>(treePath)
      : { map: [] };
    const items = pieces
      .filter((p) => !("donotrender" in p))
      .map((p) => encodeArmor({ ...p, slug: slugify(p.name), rank: p.rank ?? computeRank(p.hr, p.elder) }));
    totalItems += items.length;
    push(`armor-${slot}-${rank}.json`, {
      kind: "armor",
      slot,
      rank,
      tree: compactTree(tree.map, slot),
      items,
    });
  }
}

// Monsters
for (const category of MONSTER_CATEGORIES) {
  const p = path.join(dataDir, "monsters", `${category}.json`);
  if (!fs.existsSync(p)) continue;
  const data = readJson<{ monsters: Monster[] }>(p);
  const items = data.monsters.map((m) => encodeMonster({ ...m, slug: slugify(m.name) }));
  totalItems += items.length;
  push(`monster-${category}.json`, { kind: "monster", category, items });
}

// Decorations
{
  const crafting = readJson<{ decorations: Decoration[] }>(
    path.join(dataDir, "decorations.json")
  );
  const tree = readJson<{ map: WeaponTreeNode[] }>(
    path.join(contentDir, "decorations", "map.json")
  );
  const items = crafting.decorations
    .filter((d) => !("donotrender" in d))
    .map((d) => encodeDecoration({ ...d, slug: slugify(d.name) }));
  totalItems += items.length;
  push("decorations.json", {
    kind: "decoration",
    tree: compactTree(tree.map, "decoration"),
    items,
  });
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

// Image manifest for the offline-download UI (and SW parity): every image URL.
const imagesDir = path.join(process.cwd(), "public", "images");
const imageUrls: string[] = [];
const walkImages = (dir: string) => {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkImages(full);
    else if (/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) {
      imageUrls.push(`/images/${path.relative(imagesDir, full).split(path.sep).join("/")}`);
    }
  }
};
walkImages(imagesDir);
imageUrls.sort();
fs.writeFileSync(path.join(outDir, "image-manifest.json"), JSON.stringify(imageUrls));

const fmt = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;

console.log(
  `generate-data: ${files.length} bundles, ${totalItems} items → public/data  raw=${fmt(totalRaw)}  gzip≈${fmt(totalGzip)}  version=${version}`
);

if (totalRaw > BUDGET_BYTES) {
  console.error(`generate-data: FAIL — raw size ${fmt(totalRaw)} exceeds budget ${fmt(BUDGET_BYTES)}`);
  process.exit(1);
}
