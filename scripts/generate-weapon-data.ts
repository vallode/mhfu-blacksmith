/**
 * Generates public/weapon-data.json — a compact, client-loadable summary of
 * all weapons for use in the calculator page.
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const contentDir = path.join(root, "content");

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const WEAPON_CLASS_MULTIPLIER: Record<string, number> = {
  "great-sword": 4.8,
  "long-sword": 4.8,
  "sword-and-shield": 1.4,
  "dual-blades": 1.4,
  hammer: 5.2,
  "hunting-horn": 5.2,
  lance: 2.3,
  gunlance: 2.3,
  "light-bowgun": 1.2,
  "heavy-bowgun": 1.2,
  bow: 1.2,
};

interface WeaponEntry {
  name: string;
  slug: string;
  type: string;
  attack: number;
  raw_attack: number;
  affinity: string;
  slots: number;
  rarity: number;
  sharpness: number[];
  sharpness_plus: number[];
  elements: { name: string; attack: number }[];
  notes: string[] | null;
}

const weapons: WeaponEntry[] = [];

const weaponDir = path.join(contentDir, "blacksmith");
for (const type of fs.readdirSync(weaponDir)) {
  const craftingFile = path.join(weaponDir, type, `${type}-crafting.json`);
  if (!fs.existsSync(craftingFile)) continue;

  const data = JSON.parse(fs.readFileSync(craftingFile, "utf-8")) as {
    weapons: Record<string, unknown>[];
  };

  const multiplier = WEAPON_CLASS_MULTIPLIER[type] ?? 1;

  for (const w of data.weapons) {
    if ("donotrender" in w || !w.name) continue;

    const attack = Number(w.attack ?? 0);
    const raw_attack = multiplier ? Math.floor(attack / multiplier) : attack;

    const sharpness = Array.isArray(w.sharpness)
      ? (w.sharpness as (string | number)[]).map(Number)
      : [];
    const sharpness_plus = Array.isArray(w.sharpness_plus)
      ? (w.sharpness_plus as (string | number)[]).map(Number)
      : [];

    const elements = Array.isArray(w.elements)
      ? (w.elements as { name: string; attack: number }[])
      : [];

    weapons.push({
      name: w.name as string,
      slug: slugify(w.name as string),
      type,
      attack,
      raw_attack,
      affinity: (w.affinity as string) || "0%",
      slots: Number(w.slots ?? 0),
      rarity: Number(w.rarity ?? 1),
      sharpness,
      sharpness_plus,
      elements,
      notes: Array.isArray(w.notes) ? (w.notes as string[]) : null,
    });
  }
}

const outPath = path.join(root, "public", "weapon-data.json");
fs.writeFileSync(outPath, JSON.stringify(weapons));
console.log(`Generated ${weapons.length} weapons → ${outPath}`);
