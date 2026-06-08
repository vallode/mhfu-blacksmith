/**
 * Validates the content JSON data files for common issues.
 * Exits with code 1 if any errors are found.
 */
import fs from "fs";
import path from "path";
import { slugify } from "../src/lib/slug";

const root = process.cwd();
const contentDir = path.join(root, "content");

function isDir(p: string): boolean {
  return fs.statSync(p).isDirectory();
}

let errors = 0;
let warnings = 0;

function error(msg: string) {
  console.error(`  ✗ ${msg}`);
  errors++;
}

function warn(msg: string) {
  console.warn(`  ⚠ ${msg}`);
  warnings++;
}

function section(title: string) {
  console.log(`\n${title}`);
}

// ─── Weapons ──────────────────────────────────────────────────────────────────

section("Validating weapons…");

const weaponDir = path.join(contentDir, "blacksmith");
const weaponTypes = fs.readdirSync(weaponDir).sort().filter((e) => isDir(path.join(weaponDir, e)));

// First pass: collect all slugs across all weapon types
const allWeaponSlugs = new Map<string, Set<string>>(); // type → slugs
for (const type of weaponTypes) {
  const craftingFile = path.join(weaponDir, type, `${type}-crafting.json`);
  if (!fs.existsSync(craftingFile)) continue;
  const data = JSON.parse(fs.readFileSync(craftingFile, "utf-8")) as { weapons: Record<string, unknown>[] };
  const slugs = new Set<string>();
  for (const w of data.weapons) {
    if ("donotrender" in w || !w.name) continue;
    slugs.add(slugify(w.name as string));
  }
  allWeaponSlugs.set(type, slugs);
}

// Second pass: validate each type
for (const type of weaponTypes) {
  const craftingFile = path.join(weaponDir, type, `${type}-crafting.json`);
  const mapFile = path.join(weaponDir, type, "map.json");

  if (!fs.existsSync(craftingFile)) {
    error(`${type}: missing ${type}-crafting.json`);
    continue;
  }

  const data = JSON.parse(fs.readFileSync(craftingFile, "utf-8")) as {
    weapons: Record<string, unknown>[];
  };

  if (!Array.isArray(data.weapons)) {
    error(`${type}: "weapons" is not an array`);
    continue;
  }

  const slugs = allWeaponSlugs.get(type)!;
  const seenSlugs = new Set<string>();
  let count = 0;

  for (const w of data.weapons) {
    if ("donotrender" in w) continue;

    const name = w.name as string | undefined;
    if (!name) {
      error(`${type}: weapon missing name: ${JSON.stringify(w)}`);
      continue;
    }

    const slug = slugify(name);
    if (seenSlugs.has(slug)) {
      error(`${type}: duplicate slug "${slug}" (from name "${name}")`);
    }
    seenSlugs.add(slug);
    count++;

    if (w.attack == null && w.rarity == null) {
      warn(`${type}/${name}: no attack or rarity`);
    }

    if (Array.isArray(w.elements)) {
      for (const el of w.elements as Record<string, unknown>[]) {
        if (!el.name) error(`${type}/${name}: element missing name`);
        if (el.attack == null) error(`${type}/${name}: element "${el.name}" missing attack`);
      }
    }

    if (Array.isArray(w.create_mats)) {
      for (const m of w.create_mats as Record<string, unknown>[]) {
        if (!m.name) error(`${type}/${name}: create_mat missing name`);
        if (m.amount == null) warn(`${type}/${name}: create_mat "${m.name}" missing amount`);
      }
    }
  }

  // Validate map.json references — map nodes can reference other weapon types
  if (fs.existsSync(mapFile)) {
    const map = JSON.parse(fs.readFileSync(mapFile, "utf-8")) as {
      map: { slug: string; name: string; type?: string; children?: unknown[] }[];
    };

    function validateNode(node: { slug: string; name: string; type?: string; children?: unknown[] }) {
      const nodeType = node.type || type;
      const nodeTypeSlugs = allWeaponSlugs.get(nodeType) ?? slugs;
      if (!nodeTypeSlugs.has(node.slug)) {
        // Data inconsistency in source content — warn rather than error
        warn(`${type}/map.json: node "${node.name}" (slug: ${node.slug}, type: ${nodeType}) not found in crafting data`);
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children as typeof node[]) {
          validateNode(child);
        }
      }
    }

    for (const node of map.map ?? []) {
      validateNode(node);
    }
  } else {
    warn(`${type}: missing map.json`);
  }

  console.log(`  ${type}: ${count} weapons`);
}

// ─── Armor ────────────────────────────────────────────────────────────────────

section("Validating armor…");

const armorDir = path.join(contentDir, "armorsmith");
for (const slot of fs.readdirSync(armorDir).sort().filter((e) => isDir(path.join(armorDir, e)))) {
  const slotDir = path.join(armorDir, slot);

  for (const rank of fs.readdirSync(slotDir).sort().filter((e) => isDir(path.join(slotDir, e)))) {
    const craftingFile = path.join(slotDir, rank, `${slot}-crafting.json`);
    if (!fs.existsSync(craftingFile)) continue;

    const data = JSON.parse(fs.readFileSync(craftingFile, "utf-8")) as {
      weapons: Record<string, unknown>[];
    };

    let count = 0;
    const slugs = new Set<string>();

    for (const a of data.weapons) {
      if ("donotrender" in a) continue;
      const name = a.name as string | undefined;
      if (!name) { error(`${slot}/${rank}: armor missing name`); continue; }

      const slug = slugify(name);
      if (slugs.has(slug)) error(`${slot}/${rank}: duplicate slug "${slug}"`);
      slugs.add(slug);
      count++;
    }

    console.log(`  ${slot}/${rank}: ${count} pieces`);
  }
}

// ─── Decorations ──────────────────────────────────────────────────────────────

section("Validating decorations…");

const decoFile = path.join(contentDir, "decorations", "decorations-crafting.json");
if (!fs.existsSync(decoFile)) {
  error("Missing decorations/decorations-crafting.json");
} else {
  const data = JSON.parse(fs.readFileSync(decoFile, "utf-8")) as {
    weapons: Record<string, unknown>[];
  };
  const slugs = new Set<string>();
  let count = 0;

  for (const d of data.weapons) {
    if ("donotrender" in d) continue;
    const name = d.name as string | undefined;
    if (!name) { error("decoration missing name"); continue; }

    const slug = slugify(name);
    if (slugs.has(slug)) error(`decoration: duplicate slug "${slug}"`);
    slugs.add(slug);
    count++;
  }

  console.log(`  decorations: ${count} entries`);
}

// ─── Monsters ─────────────────────────────────────────────────────────────────

section("Validating monsters…");

const monsterDir = path.join(contentDir, "monsters");
for (const category of fs.readdirSync(monsterDir).sort().filter((e) => isDir(path.join(monsterDir, e)))) {
  const jsonFile = path.join(monsterDir, category, `${category}.json`);
  if (!fs.existsSync(jsonFile)) {
    warn(`monsters/${category}: missing ${category}.json`);
    continue;
  }

  const data = JSON.parse(fs.readFileSync(jsonFile, "utf-8")) as {
    monsters: Record<string, unknown>[];
  };
  const slugs = new Set<string>();
  let count = 0;

  for (const m of (data.monsters ?? [])) {
    const name = m.name as string | undefined;
    if (!name) { error(`monsters/${category}: monster missing name`); continue; }

    const slug = slugify(name);
    if (slugs.has(slug)) error(`monsters/${category}: duplicate slug "${slug}"`);
    slugs.add(slug);
    count++;
  }

  console.log(`  ${category}: ${count} monsters`);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${errors === 0 ? "✓" : "✗"} Validation complete — ${errors} error(s), ${warnings} warning(s)`);

if (errors > 0) {
  process.exit(1);
}
