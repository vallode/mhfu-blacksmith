/**
 * Builds the bot's search index (src/types.ts) from data/, through
 * game-data's readData like everything else that reads it. Slugs come from
 * the site's own functions, so every link is the page's address.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readData, readRawData } from "game-data";
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
  SkillEntry,
  WeaponEntry,
} from "../src/types.js";

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

function items(strings: Strings): ItemEntry[] {
  const aliases = strings.aliases.item ?? {};
  const { items } = readData<{
    items: {
      id: number;
      name: string;
      name_jp?: string;
      rarity?: number;
      price?: number;
      placeholder?: boolean;
    }[];
  }>(DATA_DIR, "items.json");
  return items
    .filter((i) => !i.placeholder)
    .map((i) => ({
      id: i.id,
      name: i.name,
      aliases: aliases[i.id] ?? [],
      ...(i.name_jp && { jp: i.name_jp }),
      ...(i.rarity !== undefined && { rarity: i.rarity }),
      ...(i.price !== undefined && { price: i.price }),
      slug: slugify(i.name),
    }));
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
    }>(DATA_DIR, "weapons", `${type}.json`).weapons.map((w) => ({
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
