/**
 * Builds the bot's search index (src/types.ts) from data/, through
 * game-data's readData like everything else that reads it. Slugs come from
 * the site's own functions, so every link is the page's address.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readData, readRawData } from "game-data";
import { detailCardUrl } from "blacksmith/src/lib/detail-card.js";
import {
  buildDetailCardData,
  DROP_RANKS,
  monsterPortrait,
} from "blacksmith/src/lib/detail-card-data.js";
import { embedIcon, itemEmbedIcon, tintFor } from "blacksmith/src/lib/embed-format.js";
import { itemBestSources, questWhere } from "blacksmith/src/lib/item-best-sources.js";
import { monsterCardUrl } from "blacksmith/src/lib/monster-card.js";
import { getMonsters } from "blacksmith/src/lib/monsters.js";
import {
  isHiddenQuest,
  QUEST_HUB_SLUGS,
  questHref,
  questHubSlug,
  type QuestAppearance,
} from "blacksmith/src/lib/quests.js";
import { getHuntStars } from "blacksmith/src/lib/quests-data.js";
import { armorSlugs, slugify } from "blacksmith/src/lib/slug.js";
import { MONSTER_NICKNAMES } from "../src/nicknames.js";
import type {
  ArmorEntry,
  ArmorRank,
  ArmorSlot,
  BotIndex,
  HunterType,
  ItemEntry,
  MonsterEntry,
  MonsterQuest,
  SkillEntry,
  WeaponEntry,
} from "../src/types.js";
import { ITEM_SOURCES } from "../src/types.js";

export const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data");

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
  const drops = buildDetailCardData().drops;
  const quests = questsByMonster();
  return MONSTER_CATEGORIES.flatMap((category) => {
    const named = readData<{ monsters: MonsterRecord[] }>(
      DATA_DIR,
      "monsters",
      `${category}.json`,
    ).monsters;
    const raw = readRawData<{ monsters: { id: number }[] }>(
      DATA_DIR,
      "monsters",
      `${category}.json`,
    ).monsters;
    const site = new Map(getMonsters(category).map((s) => [s.name, s]));
    return named.map((m, i): MonsterEntry => {
      const id = raw[i]!.id;
      const slug = slugify(m.name);
      const page = site.get(m.name);
      return {
        id,
        name: m.name,
        aliases: [...new Set([...(aliases[id] ?? []), ...(MONSTER_NICKNAMES[m.name] ?? [])])],
        category,
        slug,
        small: m.small === true,
        ...(m.base_hp !== undefined && { hp: m.base_hp }),
        weak: m.small ? [] : weakElements(m.hitzones),
        breaks: [...new Set((m.breaks ?? []).map((b) => b.name))],
        ...(m.description && { description: m.description }),
        ...(m.crowns && { crowns: m.crowns }),
        ...(page && { card: monsterCardUrl(page, getHuntStars(m.name)) }),
        icon: monsterPortrait(category, slug),
        dropRanks: DROP_RANKS.flatMap((rank) => {
          const card = drops[`${slug}/${rank}`];
          return card
            ? [{ rank, label: card.rank, card: detailCardUrl("drops", `${slug}/${rank}`, card) }]
            : [];
        }),
        quests: quests.get(m.name) ?? [],
      };
    });
  });
}

/** Quest boards a monster's Quests tab lists, as the quests' data files are named. */
const QUEST_FILES = [
  "village",
  "guild",
  "training-school",
  "treasure-hunting",
  "event",
  "challenge",
];

/** Every quest a monster is a large monster or the target in, by name: board order, then stars. */
function questsByMonster(): Map<string, MonsterQuest[]> {
  const out = new Map<string, { quest: MonsterQuest; hub: number; stars: number; id: number }[]>();
  for (const file of QUEST_FILES) {
    const { quests } = readData<{
      quests: (QuestAppearance & { title?: string })[];
    }>(DATA_DIR, "quests", `${file}.json`);
    for (const q of quests) {
      const hub = questHubSlug(q.hub, q.rank);
      if (!hub || isHiddenQuest(q.id) || !q.title) continue;
      const where = questWhere(q.hub, q.rank, q.stars);
      const star = where.lastIndexOf(" ");
      const names = new Set(q.large_monsters.map((m) => m.monster));
      if (q.target) names.add(q.target.monster);
      for (const name of names) {
        const list = out.get(name) ?? [];
        list.push({
          quest: {
            board: where.slice(0, star),
            stars: where.slice(star + 1),
            title: q.title,
            path: questHref({ hub, id: q.id }),
          },
          hub: QUEST_HUB_SLUGS.indexOf(hub),
          stars: q.stars,
          id: q.id,
        });
        out.set(name, list);
      }
    }
  }
  // As the site's questsWithMonster: by board, then stars, then ID.
  return new Map(
    [...out].map(([name, list]) => [
      name,
      list.sort((a, b) => a.hub - b.hub || a.stars - b.stars || a.id - b.id).map((e) => e.quest),
    ]),
  );
}

function items(strings: Strings): ItemEntry[] {
  const aliases = strings.aliases.item ?? {};
  const sources = itemBestSources();
  const cards = buildDetailCardData().items;
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
  }>(DATA_DIR, "items.json");
  return items
    .filter((i) => !i.placeholder)
    .map((i) => {
      const { drops = [], rewards = [] } = sources.get(i.name) ?? {};
      const slug = slugify(i.name);
      return {
        id: i.id,
        name: i.name,
        aliases: aliases[i.id] ?? [],
        ...(i.rarity !== undefined && { rarity: i.rarity }),
        ...(i.price !== undefined && { price: i.price }),
        slug,
        ...(i.icon !== undefined &&
          i.color !== undefined && { icon: itemEmbedIcon(i.icon, i.color).url }),
        ...(tintFor(i.rarity) && { color: parseInt(tintFor(i.rarity)!.slice(1), 16) }),
        drops: drops.slice(0, ITEM_SOURCES),
        dropCount: drops.length,
        rewards: rewards.slice(0, ITEM_SOURCES),
        rewardCount: rewards.length,
        ...(cards[slug] && { card: detailCardUrl("items", slug, cards[slug]) }),
      };
    });
}

function weapons(): WeaponEntry[] {
  const cards = buildDetailCardData().weapons;
  return WEAPON_TYPES.flatMap((type) =>
    readData<{
      weapons: {
        name: string;
        attack?: number;
        affinity?: string;
        slots?: number;
        rarity?: number;
        color?: string | null;
        elements?: { name: string; attack: number }[] | null;
      }[];
    }>(DATA_DIR, "weapons", `${type}.json`).weapons.map((w) => {
      const slug = slugify(w.name);
      const card = cards[`${type}/${slug}`];
      const tint = tintFor(w.rarity, w.color);
      return {
        type,
        name: w.name,
        slug,
        ...(w.attack !== undefined && { attack: Number(w.attack) }),
        ...(w.affinity && { affinity: w.affinity }),
        ...(w.slots !== undefined && { slots: w.slots }),
        ...(w.rarity !== undefined && { rarity: w.rarity }),
        elements: (w.elements ?? []).map((e) => `${e.name} ${e.attack}`),
        ...(card && { card: detailCardUrl("weapons", `${type}/${slug}`, card) }),
        icon: embedIcon(type, w.rarity, w.color).url,
        ...(tint && { color: parseInt(tint.slice(1), 16) }),
      };
    }),
  );
}

function skills(): SkillEntry[] {
  const { skills } = readData<{
    skills: { tree: string; aliases?: string[]; skills: { name: string; points: number }[] }[];
  }>(DATA_DIR, "skills.json");
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
    }>(DATA_DIR, "armor", `${slot}.json`).armor;
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
  const strings = readData<Strings>(DATA_DIR, "strings", "en.json");
  return {
    monsters: monsters(strings),
    items: items(strings),
    weapons: weapons(),
    skills: skills(),
    armor: armor(),
  };
}
