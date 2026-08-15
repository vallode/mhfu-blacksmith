import fs from "fs";
import path from "path";

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
  category: "weapon" | "armor" | "decoration" | "monster";
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
    if ("donotrender" in w || !w.name) continue;

    const name = w.name as string;
    const slug = slugify(name);
    const rarity = Number(w.rarity ?? 0);
    const hr = Number(w.hr ?? 0);

    let rank: string;
    if (hr > 0) {
      if (hr <= 5) rank = "low-rank";
      else if (hr <= 8) rank = "high-rank";
      else rank = Number(w.elder) ? "g-rank" : "high-rank";
    } else {
      if (rarity <= 4) rank = "low-rank";
      else if (rarity <= 7) rank = "high-rank";
      else rank = "g-rank";
    }

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

  for (const a of data.armor) {
    if ("donotrender" in a || !a.name) continue;

    const name = a.name as string;
    const slug = slugify(name);
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
    if ("donotrender" in d || !d.name) continue;

    const name = d.name as string;
    const slug = slugify(name);
    const skillNames = Array.isArray(d.skills)
      ? (d.skills as string[]).join(" ")
      : "";

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

  for (const m of (data.monsters ?? [])) {
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

const outPath = path.join(root, "public", "search-data.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(entries));
console.log(`Generated ${entries.length} search entries → ${outPath}`);
