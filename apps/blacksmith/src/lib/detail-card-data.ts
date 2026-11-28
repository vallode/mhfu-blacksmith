/**
 * What each weapon, item and drops card shows (detail-card.ts), read from
 * data/ at build time. scripts/generate-embeds.ts writes it for the Worker,
 * and the Discord bot's index takes the cards' URLs from it, so both see the
 * same cards and versions.
 */
import fs from "fs";
import path from "path";
import { readData } from "game-data";
import { MONSTER_CATEGORIES, WEAPON_TYPES } from "./constants";
import {
  materialSprite,
  type CardDropGroup,
  type CardRecipe,
  type CardStat,
  type DropsCard,
  type ItemCard,
  type WeaponCard,
} from "./detail-card";
import { embedIcon, itemEmbedIcon, titleCase } from "./embed-format";
import { itemBestSources } from "./item-best-sources";
import { parseDropSource, splitDropQuantity } from "./monster-drops";
import { getMonsters } from "./monsters";
import { DATA_DIR, GAME, REPO_ROOT } from "./paths";
import { slugify } from "./slug";
import type { Material, Weapon } from "./types";
import { getWeapons } from "./weapons";

export interface DetailCardData {
  weapons: Record<string, WeaponCard>;
  items: Record<string, ItemCard>;
  drops: Record<string, DropsCard>;
}

/** The sprites a stat can show, by the data's element name. */
const ELEMENT_SPRITES = new Set([
  "fire",
  "water",
  "thunder",
  "ice",
  "dragon",
  "poison",
  "paralysis",
  "sleep",
]);
const STATUSES = new Set(["poison", "paralysis", "sleep"]);

const NOTE_NAMES: Record<string, string> = {
  w: "White",
  p: "Purple",
  r: "Red",
  b: "Blue",
  g: "Green",
  y: "Yellow",
  a: "Aqua",
};

const list = (v: string | string[] | null | undefined) => (v == null ? [] : [v].flat());

function mats(materials: Material[]): CardRecipe["mats"] {
  return materials.map((m) => ({
    name: m.name,
    amount: Number(m.amount),
    ...(m.type && { sprite: materialSprite(m.type, m.color) }),
  }));
}

function weaponStats(w: Weapon): CardStat[] {
  const stats: CardStat[] = [];
  if (w.attack !== undefined) stats.push({ label: "Attack", value: String(w.attack) });
  if (w.affinity) stats.push({ label: "Affinity", value: w.affinity });
  for (const e of w.elements ?? []) {
    const key = e.name.toLowerCase();
    stats.push({
      label: STATUSES.has(key) ? "Status" : "Element",
      value: `${e.name} ${e.attack}`,
      ...(ELEMENT_SPRITES.has(key) && { sprite: key }),
    });
  }
  if (w.bonus) stats.push({ label: "Bonus", value: String(w.bonus) });
  if (w.shelling)
    stats.push({ label: "Shelling", value: `${w.shelling.type} Lv${w.shelling.level}` });
  if (w.notes?.length) {
    stats.push({
      label: "Notes",
      value: w.notes.map((n) => NOTE_NAMES[n] ?? n).join(" "),
      wide: true,
    });
  }
  if (w.reload) stats.push({ label: "Reload", value: w.reload });
  if (w.recoil) stats.push({ label: "Recoil", value: w.recoil });
  if (w.rapid_fire) stats.push({ label: "Rapid fire", value: w.rapid_fire, wide: true });
  if (w.shots?.length) {
    stats.push({
      label: "Charge",
      value: w.shots.map((s) => `${s.name} ${s.level}`).join(" · "),
      wide: true,
    });
  }
  return stats;
}

function weaponCard(type: string, w: Weapon): WeaponCard {
  const create = w.create_mats?.length
    ? { ...(w.create_cost && { cost: w.create_cost }), mats: mats(w.create_mats) }
    : undefined;
  const upgrade = w.improve_mats?.length
    ? {
        // "Blacksmith" stands for no weapon: made from scratch.
        from: list(w.improve_from).filter((f) => f !== "Blacksmith"),
        ...(w.improve_cost && { cost: w.improve_cost }),
        mats: mats(w.improve_mats),
      }
    : undefined;
  const hits = (s?: (string | number)[]) => s?.map(Number).filter((n) => Number.isFinite(n));
  return {
    name: w.name,
    type: titleCase(type),
    ...(w.rarity !== undefined && { rarity: w.rarity }),
    icon: embedIcon(type, w.rarity, w.color).url,
    stats: weaponStats(w),
    slots: w.slots ?? 0,
    ...(w.sharpness?.length && { sharpness: hits(w.sharpness) }),
    ...(w.sharpness_plus?.length && { sharpnessPlus: hits(w.sharpness_plus) }),
    ...(create && { create }),
    ...(upgrade && { upgrade }),
    upgradesTo: w.improve_to ?? [],
  };
}

function itemCards(): Record<string, ItemCard> {
  const sources = itemBestSources();
  const { items } = readData<{
    items: {
      name: string;
      rarity?: number;
      price?: number;
      carry?: number;
      icon?: number;
      color?: number;
      placeholder?: boolean;
    }[];
  }>(DATA_DIR, GAME, "items.json");
  const out: Record<string, ItemCard> = {};
  for (const i of items) {
    if (i.placeholder) continue;
    const slug = slugify(i.name);
    if (out[slug]) continue;
    const { drops = [], rewards = [] } = sources.get(i.name) ?? {};
    out[slug] = {
      name: i.name,
      ...(i.rarity !== undefined && { rarity: i.rarity }),
      ...(i.price !== undefined && { price: i.price }),
      ...(i.carry !== undefined && { carry: i.carry }),
      ...(i.icon !== undefined &&
        i.color !== undefined && { icon: itemEmbedIcon(i.icon, i.color).url }),
      // A card holds at most this many of each.
      drops: drops.slice(0, 7),
      dropCount: drops.length,
      rewards: rewards.slice(0, 9),
      rewardCount: rewards.length,
    };
  }
  return out;
}

/** A drop table's rank as a path segment and a label; null for one the cards skip. */
export function dropRank(heading: string): { slug: string; label: string } | null {
  const h = heading.toLowerCase().replace(/-/g, " ");
  if (h.startsWith("1 2 star")) return { slug: "low-rank-1-2", label: "Low Rank ★1-2" };
  if (h.startsWith("low rank")) return { slug: "low-rank", label: "Low Rank" };
  if (h.startsWith("high rank")) return { slug: "high-rank", label: "High Rank" };
  if (h.startsWith("g rank")) return { slug: "g-rank", label: "G Rank" };
  return null;
}

/** The rank slugs in the order the game unlocks them. */
export const DROP_RANKS = ["low-rank-1-2", "low-rank", "high-rank", "g-rank"] as const;

const ownPortrait = (slug: string) =>
  fs.existsSync(path.join(REPO_ROOT, "apps/blacksmith/public/images/monsters", `${slug}.png`));

/** A monster's portrait on the scroll (generate-embeds.ts writes one per monster with its own). */
export const monsterPortrait = (category: string, slug: string) =>
  `/embed/icons/monster-${ownPortrait(slug) ? slug : category}.png`;

function dropsCards(): Record<string, DropsCard> {
  const out: Record<string, DropsCard> = {};
  for (const category of MONSTER_CATEGORIES) {
    for (const m of getMonsters(category)) {
      for (const [heading, tables] of Object.entries(m.drops ?? {})) {
        const rank = dropRank(heading);
        const key = rank && `${m.slug}/${rank.slug}`;
        // The bestiary heads some ★1-2 tables twice; the first is kept.
        if (!rank || !key || out[key]) continue;
        const groups: CardDropGroup[] = Object.entries(tables).map(([source, drops]) => {
          const { title, count } = parseDropSource(source);
          return {
            title: count ? `${title} ×${count}` : title,
            rows: drops
              .map((d) => {
                const [name, inName] = splitDropQuantity(d.name);
                const quantity = d.quantity ?? inName ?? 1;
                return {
                  name,
                  chance: parseFloat(d.chance) || 0,
                  ...(quantity > 1 && { quantity }),
                };
              })
              .sort((a, b) => b.chance - a.chance),
          };
        });
        if (!groups.length) continue;
        out[key] = {
          monster: m.name,
          rank: rank.label,
          portrait: monsterPortrait(category, m.slug),
          groups,
        };
      }
    }
  }
  return out;
}

let cache: DetailCardData | null = null;

/** Every card's contents, keyed as its path is (detailCardPath). */
export function buildDetailCardData(): DetailCardData {
  if (cache) return cache;
  const weapons: Record<string, WeaponCard> = {};
  for (const type of WEAPON_TYPES) {
    for (const w of getWeapons(type)) weapons[`${type}/${w.slug}`] = weaponCard(type, w);
  }
  cache = { weapons, items: itemCards(), drops: dropsCards() };
  return cache;
}

/** The sprites the cards name, for the build to make: materials, elements and the slot. */
export function detailCardSpriteNames(data: DetailCardData): string[] {
  const names = new Set<string>(["slot-empty", "star"]);
  for (const w of Object.values(data.weapons)) {
    for (const s of w.stats) if (s.sprite) names.add(s.sprite);
    for (const r of [w.create, w.upgrade])
      for (const m of r?.mats ?? []) if (m.sprite) names.add(m.sprite);
  }
  return [...names];
}
