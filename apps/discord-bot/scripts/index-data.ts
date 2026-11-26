/**
 * Builds the bot's search index (src/types.ts) from data/mhfu/, through
 * game-data's readData like everything else that reads it. Slugs come from
 * the site's own functions, so every link is the page's address.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readData, readRawData } from "game-data";
import { MHFU_GAME } from "game-data/games";
import {
  formatRank,
  parseDropSource,
  splitDropQuantity,
} from "blacksmith/src/lib/monster-drops.js";
import {
  isHiddenQuest,
  questHubLabel,
  questHubSlug,
  questStarLevel,
} from "blacksmith/src/lib/quests.js";
import { itemEmbedIcon, tintFor } from "blacksmith/src/lib/embed-format.js";
import { armorSlugs, slugify } from "blacksmith/src/lib/slug.js";
import { MONSTER_NICKNAMES } from "../src/nicknames.js";
import type {
  ArmorEntry,
  ArmorRank,
  ArmorSlot,
  BotIndex,
  HunterType,
  ItemDrop,
  ItemDropWay,
  ItemEntry,
  ItemReward,
  MonsterEntry,
  SkillEntry,
  WeaponEntry,
} from "../src/types.js";
import { ITEM_SOURCES } from "../src/types.js";

export const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data");
/** The game the bot answers about: MHFU, the only one with data. */
const GAME = MHFU_GAME.code;

const MONSTER_CATEGORIES = [
  "lynian",
  "bird-wyvern",
  "flying-wyvern",
  "piscine-wyvern",
  "carapaceon",
  "pelagus",
  "elder-dragon",
  "neopteron",
  "herbivore",
] as const;

const WEAPON_TYPES = [
  "great-sword",
  "long-sword",
  "sword-and-shield",
  "dual-blades",
  "hammer",
  "hunting-horn",
  "lance",
  "gunlance",
  "light-bowgun",
  "heavy-bowgun",
  "bow",
] as const;

const ARMOR_SLOTS: ArmorSlot[] = ["helmet", "plate", "gauntlets", "waist", "leggings"];
const ARMOR_RANKS: ArmorRank[] = ["low-rank", "high-rank", "g-rank"];

/** Hitzone columns, and the element each one is. */
const ELEMENT_ZONES = { fir: "Fire", wtr: "Water", thn: "Thunder", ice: "Ice", drg: "Dragon" };

interface Strings {
  aliases: {
    item?: Record<string, string[]>;
    skill?: Record<string, string[]>;
    monster?: Record<string, string[]>;
  };
}

interface MonsterRecord {
  name: string;
  description?: string;
  small?: boolean;
  base_hp?: number;
  hitzones?: Record<string, Record<string, string>>;
  breaks?: { name: string }[];
  crowns?: { mini: number; silver: number; gold: number };
}

/** The elements a monster's hitzones take best, by their average over its parts. */
export function weakElements(hitzones: MonsterRecord["hitzones"]): string[] {
  const parts = Object.values(hitzones ?? {});
  if (parts.length === 0) return [];
  const avg = Object.entries(ELEMENT_ZONES).map(([zone, element]) => {
    const values = parts.map((p) => Number(p[zone])).filter((n) => Number.isFinite(n));
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return { element, mean };
  });
  avg.sort((a, b) => b.mean - a.mean);
  const best = avg[0]!.mean;
  // A second element only when it's close to the first, and nothing a
  // monster barely takes.
  return avg
    .filter((e, i) => e.mean >= 10 && (i === 0 || e.mean >= best - 5))
    .slice(0, 2)
    .map((e) => e.element);
}

function monsters(strings: Strings): MonsterEntry[] {
  const aliases = strings.aliases.monster ?? {};
  return MONSTER_CATEGORIES.flatMap((category) => {
    const named = readData<{ monsters: MonsterRecord[] }>(
      DATA_DIR,
      GAME,
      "monsters",
      `${category}.json`,
    ).monsters;
    const raw = readRawData<{ monsters: { id: number }[] }>(
      DATA_DIR,
      GAME,
      "monsters",
      `${category}.json`,
    ).monsters;
    return named.map((m, i): MonsterEntry => {
      const id = raw[i]!.id;
      return {
        id,
        name: m.name,
        aliases: [...new Set([...(aliases[id] ?? []), ...(MONSTER_NICKNAMES[m.name] ?? [])])],
        category,
        slug: slugify(m.name),
        small: m.small === true,
        ...(m.base_hp !== undefined && { hp: m.base_hp }),
        weak: m.small ? [] : weakElements(m.hitzones),
        breaks: [...new Set((m.breaks ?? []).map((b) => b.name))],
        ...(m.description && { description: m.description }),
        ...(m.crowns && { crowns: m.crowns }),
      };
    });
  });
}

const QUEST_FILES = [
  "village",
  "guild",
  "training-school",
  "treasure-hunting",
  "event",
  "challenge",
];

/** Every monster drop and quest reward, by item name, best (highest chance) first. */
function itemSources(): Map<string, { drops: ItemDrop[]; rewards: ItemReward[] }> {
  const raw = new Map<string, { drops: RawDrop[]; rewards: ItemReward[] }>();
  const of = (name: string) => {
    let e = raw.get(name);
    if (!e) raw.set(name, (e = { drops: [], rewards: [] }));
    return e;
  };
  for (const category of MONSTER_CATEGORIES) {
    const { monsters } = readData<{
      monsters: {
        name: string;
        drops?: Record<
          string,
          Record<string, { name: string; chance: string; quantity?: number }[]>
        >;
      }[];
    }>(DATA_DIR, GAME, "monsters", `${category}.json`);
    for (const m of monsters)
      for (const [rank, tables] of Object.entries(m.drops ?? {}))
        for (const [source, drops] of Object.entries(tables)) {
          // The carve count is the monster's, not the item's: left out.
          const { title } = parseDropSource(source);
          for (const d of drops) {
            const [name, inName] = splitDropQuantity(d.name);
            const quantity = d.quantity ?? inName ?? 1;
            of(name).drops.push({
              monster: m.name,
              rank: shortRank(rank),
              how: title,
              chance: parseFloat(d.chance) || 0,
              ...(quantity > 1 && { quantity }),
            });
          }
        }
  }
  for (const file of QUEST_FILES) {
    const { quests } = readData<{
      quests: {
        id: number;
        hub: string;
        rank: string | null;
        stars: number;
        title?: string;
        reward_tables: { items: { item: string; chance: number; amount: number }[] }[];
      }[];
    }>(DATA_DIR, GAME, "quests", `${file}.json`);
    for (const q of quests) {
      if (isHiddenQuest(q.id) || !q.title) continue;
      const where = questWhere(q.hub, q.rank, q.stars);
      for (const table of q.reward_tables)
        for (const r of table.items)
          of(r.item).rewards.push({
            quest: q.title,
            where,
            chance: r.chance,
            ...(r.amount > 1 && { amount: r.amount }),
          });
    }
  }
  const out = new Map<string, { drops: ItemDrop[]; rewards: ItemReward[] }>();
  for (const [name, e] of raw) {
    e.rewards.sort((a, b) => b.chance - a.chance);
    out.set(name, { drops: groupDrops(e.drops), rewards: e.rewards });
  }
  return out;
}

interface RawDrop extends ItemDropWay {
  monster: string;
  rank: string;
}

/** Drop table ranks, short and in order. The bestiary heads the first tables
 *  three ways ("1-2 star", "1-2 star rank", "1-2 star guild"): all ★1-2. */
const RANKS = ["LR ★1-2", "LR", "HR", "G"];
function shortRank(heading: string): string {
  const h = heading.toLowerCase().replace(/-/g, " ");
  if (h.startsWith("1 2 star")) return "LR ★1-2";
  if (h.startsWith("low rank")) return "LR";
  if (h.startsWith("high rank")) return "HR";
  if (h.startsWith("g rank")) return "G";
  return formatRank(heading);
}
const rankOrder = (r: string) => (RANKS.includes(r) ? RANKS.indexOf(r) : RANKS.length);

/** "Guild LR ★5", "Guild G★2", "Village ★7". */
function questWhere(hub: string, rank: string | null, stars: number): string {
  const slug = questHubSlug(hub, rank);
  if (!slug) return `${hub} ★${stars}`;
  const label = questHubLabel(slug)
    .replace(/ Low Rank$/, " LR")
    .replace(/ High Rank$/, " HR")
    .replace(/ G Rank$/, "");
  const level = questStarLevel(slug, stars);
  return `${label} ${level.g ? "G" : ""}★${level.stars}`;
}

/**
 * One row per monster and set of ranks: the same drop at several ranks is
 * one way (its ranks joined), and a monster's ways at the same ranks share
 * a row. Monsters with the best chance first.
 */
function groupDrops(drops: RawDrop[]): ItemDrop[] {
  const ways = new Map<string, { way: ItemDropWay; monster: string; ranks: Set<string> }>();
  for (const d of drops) {
    const key = `${d.monster}|${d.how}|${d.chance}|${d.quantity ?? 1}`;
    const seen = ways.get(key);
    if (seen) seen.ranks.add(d.rank);
    else {
      const { monster, rank, ...way } = d;
      ways.set(key, { way, monster, ranks: new Set([rank]) });
    }
  }
  const rows = new Map<string, ItemDrop>();
  for (const { way, monster, ranks } of ways.values()) {
    // ★1-2 is part of Low Rank: a drop at both is a Low Rank one.
    if (ranks.has("LR")) ranks.delete("LR ★1-2");
    const label = [...ranks].sort((a, b) => rankOrder(a) - rankOrder(b)).join(", ");
    const key = `${monster}|${label}`;
    const row = rows.get(key) ?? { monster, ranks: label, ways: [] };
    row.ways.push(way);
    rows.set(key, row);
  }
  const best = (r: ItemDrop) => Math.max(...r.ways.map((w) => w.chance));
  const monsterBest = new Map<string, number>();
  for (const r of rows.values()) {
    r.ways.sort((a, b) => b.chance - a.chance);
    monsterBest.set(r.monster, Math.max(monsterBest.get(r.monster) ?? 0, best(r)));
  }
  // A monster's rows stay together, under its best chance.
  return [...rows.values()].sort(
    (a, b) =>
      monsterBest.get(b.monster)! - monsterBest.get(a.monster)! ||
      a.monster.localeCompare(b.monster) ||
      best(b) - best(a),
  );
}

function items(strings: Strings): ItemEntry[] {
  const aliases = strings.aliases.item ?? {};
  const sources = itemSources();
  const { items } = readData<{
    items: {
      id: number;
      name: string;
      rarity?: number;
      price?: number;
      icon?: number;
      color?: number;
      placeholder?: boolean;
    }[];
  }>(DATA_DIR, GAME, "items.json");
  return items
    .filter((i) => !i.placeholder)
    .map((i) => {
      const { drops = [], rewards = [] } = sources.get(i.name) ?? {};
      return {
        id: i.id,
        name: i.name,
        aliases: aliases[i.id] ?? [],
        ...(i.rarity !== undefined && { rarity: i.rarity }),
        ...(i.price !== undefined && { price: i.price }),
        slug: slugify(i.name),
        ...(i.icon !== undefined &&
          i.color !== undefined && { icon: itemEmbedIcon(i.icon, i.color).url }),
        ...(tintFor(i.rarity) && { color: parseInt(tintFor(i.rarity)!.slice(1), 16) }),
        drops: drops.slice(0, ITEM_SOURCES),
        dropCount: drops.length,
        rewards: rewards.slice(0, ITEM_SOURCES),
        rewardCount: rewards.length,
      };
    });
}

function weapons(): WeaponEntry[] {
  return WEAPON_TYPES.flatMap((type) =>
    readData<{
      weapons: {
        name: string;
        attack?: number;
        affinity?: string;
        slots?: number;
        rarity?: number;
        elements?: { name: string; attack: number }[] | null;
      }[];
    }>(DATA_DIR, GAME, "weapons", `${type}.json`).weapons.map((w) => ({
      type,
      name: w.name,
      slug: slugify(w.name),
      ...(w.attack !== undefined && { attack: Number(w.attack) }),
      ...(w.affinity && { affinity: w.affinity }),
      ...(w.slots !== undefined && { slots: w.slots }),
      ...(w.rarity !== undefined && { rarity: w.rarity }),
      elements: (w.elements ?? []).map((e) => `${e.name} ${e.attack}`),
    })),
  );
}

function skills(): SkillEntry[] {
  const { skills } = readData<{
    skills: { tree: string; aliases?: string[]; skills: { name: string; points: number }[] }[];
  }>(DATA_DIR, GAME, "skills.json");
  return skills
    .filter((t) => t.tree !== "Torso Inc")
    .flatMap((t) =>
      t.skills
        .filter((s) => s.points > 0)
        .map((s) => ({ name: s.name, tree: t.tree, points: s.points, aliases: t.aliases ?? [] })),
    );
}

function hunterType(value: string | undefined): HunterType | "Both" {
  const v = value ?? "";
  const b = v.includes("Blademaster");
  const g = v.includes("Gunner");
  return b && !g ? "Blademaster" : g && !b ? "Gunner" : "Both";
}

function armor(): ArmorEntry[] {
  return ARMOR_SLOTS.flatMap((slot) => {
    const all = readData<{
      armor: { name: string; rank: string; sex?: string; hunter_type?: string }[];
    }>(DATA_DIR, GAME, "armor", `${slot}.json`).armor;
    return ARMOR_RANKS.flatMap((rank) => {
      const pieces = all.filter((p) => p.rank === rank);
      const slugs = armorSlugs(pieces);
      return pieces.map((p, i) => ({
        slot,
        rank,
        name: p.name,
        slug: slugs[i]!,
        hunterType: hunterType(p.hunter_type),
        sex: p.sex === "Male" || p.sex === "Female" ? p.sex : "Both",
      }));
    });
  });
}

export function buildIndex(): BotIndex {
  const strings = readData<Strings>(DATA_DIR, GAME, "strings", "en.json");
  return {
    monsters: monsters(strings),
    items: items(strings),
    weapons: weapons(),
    skills: skills(),
    armor: armor(),
  };
}
