import fs from "fs";
import path from "path";
import { armorSlugs } from "../src/lib/slug";
import { questHubSlug, type QuestHubSlug } from "../src/lib/quests";

const root = process.cwd();
const dataDir = path.join(root, "data");

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

interface SearchEntry {
  name: string;
  slug: string;
  url: string;
  category: "weapon" | "armor" | "decoration" | "monster" | "quest";
  type: string;
  rank: string | null;
  rarity: number;
  elements: string;
  skills: string;
}

const entries: SearchEntry[] = [];

// Weapons
const weaponDir = path.join(dataDir, "weapons");
for (const file of fs.readdirSync(weaponDir)) {
  const type = file.replace(/\.json$/, "");
  const craftingFile = path.join(weaponDir, file);

  const data = JSON.parse(fs.readFileSync(craftingFile, "utf-8")) as {
    weapons: Record<string, unknown>[];
  };

  for (const w of data.weapons) {
    if (!w.name) continue;

    const name = w.name as string;
    const slug = slugify(name);
    const rarity = Number(w.rarity ?? 0);
    // Weapons have no rank of their own; estimate one from rarity.
    const rank = rarity <= 4 ? "low-rank" : rarity <= 7 ? "high-rank" : "g-rank";

    const elements = Array.isArray(w.elements)
      ? (w.elements as { name: string }[]).map((e) => e.name).join(" ")
      : "";

    entries.push({
      name,
      slug,
      url: `/blacksmith/${type}/${slug}`,
      category: "weapon",
      type: (w.type as string) || type,
      rank,
      rarity,
      elements,
      skills: "",
    });
  }
}

// Armor — data/armor/<slot>.json holds every rank in one file; each piece
// carries its own "rank" field.
const armorDir = path.join(dataDir, "armor");
for (const file of fs.readdirSync(armorDir)) {
  const slot = file.replace(/\.json$/, "");
  const craftingFile = path.join(armorDir, file);

  const data = JSON.parse(fs.readFileSync(craftingFile, "utf-8")) as {
    armor: Record<string, unknown>[];
  };

  const pieces = data.armor.filter((a) => a.name) as (Record<string, unknown> & {
    name: string;
    sex?: string;
  })[];
  // Slugs are unique per slot + rank, so compute them per rank.
  const slugByPiece = new Map<object, string>();
  for (const rank of new Set(pieces.map((a) => (a.rank as string) || "low-rank"))) {
    const inRank = pieces.filter((a) => ((a.rank as string) || "low-rank") === rank);
    armorSlugs(inRank).forEach((slug, i) => slugByPiece.set(inRank[i], slug));
  }

  for (const a of pieces) {
    const name = a.name;
    const slug = slugByPiece.get(a)!;
    const rank = (a.rank as string) || "low-rank";
    const skillNames = Array.isArray(a.skills)
      ? (a.skills as ({ name: string } | string)[])
          .map((s) => (typeof s === "object" ? s.name : s))
          .join(" ")
      : "";

    entries.push({
      name,
      slug,
      url: `/armorsmith/${slot}/${rank}/${slug}`,
      category: "armor",
      type: (a.type as string) || slot,
      rank,
      rarity: Number(a.rarity ?? 0),
      elements: "",
      skills: skillNames,
    });
  }
}

// Decorations
const decoFile = path.join(dataDir, "decorations.json");
if (fs.existsSync(decoFile)) {
  const data = JSON.parse(fs.readFileSync(decoFile, "utf-8")) as {
    decorations: Record<string, unknown>[];
  };

  for (const d of data.decorations) {
    if (!d.name) continue;

    const name = d.name as string;
    const slug = slugify(name);
    const skillNames = Array.isArray(d.skills) ? (d.skills as string[]).join(" ") : "";

    entries.push({
      name,
      slug,
      url: `/decorations/${slug}`,
      category: "decoration",
      type: "decoration",
      rank: null,
      rarity: Number(d.rarity ?? 0),
      elements: "",
      skills: skillNames,
    });
  }
}

// Monsters
const monsterDir = path.join(dataDir, "monsters");
for (const file of fs.readdirSync(monsterDir)) {
  const category = file.replace(/\.json$/, "");
  const jsonFile = path.join(monsterDir, file);

  const data = JSON.parse(fs.readFileSync(jsonFile, "utf-8")) as {
    monsters: Record<string, unknown>[];
  };

  for (const m of data.monsters ?? []) {
    if (!m.name) continue;

    const name = m.name as string;
    const slug = slugify(name);

    entries.push({
      name,
      slug,
      url: `/monsters/${category}/${slug}`,
      category: "monster",
      type: (m.type as string) || category,
      rank: null,
      rarity: 0,
      elements: "",
      skills: "",
    });
  }
}

// Quests: by title. Many titles repeat (21 "Gathering - Snowy Mountains"), so
// the rank label carries a short board name and the stars to tell them apart.
const QUEST_BOARD_SHORT: Record<QuestHubSlug, string> = {
  village: "Village",
  "low-rank": "Low",
  "high-rank": "High",
  "g-rank": "G",
  "training-school": "Training",
  "treasure-hunting": "Treasure",
};
const questDir = path.join(dataDir, "quests");
for (const file of fs.readdirSync(questDir).filter((f) => f.endsWith(".json"))) {
  const data = JSON.parse(fs.readFileSync(path.join(questDir, file), "utf-8")) as {
    quests: { id: number; hub: string; rank: string | null; stars: number; title: string | null }[];
  };
  for (const q of data.quests) {
    const hub = questHubSlug(q.hub, q.rank);
    if (!hub || !q.title) continue;
    entries.push({
      name: q.title,
      slug: String(q.id),
      url: `/quests/${hub}/${q.id}`,
      category: "quest",
      type: hub,
      rank: `${QUEST_BOARD_SHORT[hub]} ${q.stars}★`,
      rarity: 0,
      elements: "",
      skills: "",
    });
  }
}

const outPath = path.join(root, "public", "search-data.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(entries));
console.log(`Generated ${entries.length} search entries → ${outPath}`);
