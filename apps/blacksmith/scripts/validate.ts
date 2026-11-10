/**
 * Validates the content JSON data files for common issues.
 * Exits with code 1 if any errors are found.
 */
import fs from "fs";
import path from "path";
import { slugify, armorSlugs } from "../src/lib/slug";
import {
  buildItemNameIndex,
  ITEM_NAME_LENGTH,
  normalizeItemName,
  type ItemRecord,
} from "../src/lib/items";
import { parseDecorationSkill, treeNameIndex, type SkillTreeData } from "../src/lib/set-search";
import { DATA_DIR } from "../src/lib/paths";

const root = process.cwd();
const contentDir = path.join(root, "content");
const dataDir = DATA_DIR;

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

const weaponDataDir = path.join(dataDir, "weapons");
const weaponContentDir = path.join(contentDir, "blacksmith");
const weaponTypes = fs
  .readdirSync(weaponDataDir)
  .filter((e) => e.endsWith(".json"))
  .map((e) => e.replace(/\.json$/, ""))
  .sort();

// First pass: collect all slugs across all weapon types
const allWeaponSlugs = new Map<string, Set<string>>(); // type → slugs
for (const type of weaponTypes) {
  const craftingFile = path.join(weaponDataDir, `${type}.json`);
  if (!fs.existsSync(craftingFile)) continue;
  const data = JSON.parse(fs.readFileSync(craftingFile, "utf-8")) as {
    weapons: Record<string, unknown>[];
  };
  const slugs = new Set<string>();
  for (const w of data.weapons) {
    if (!w.name) continue;
    slugs.add(slugify(w.name as string));
  }
  allWeaponSlugs.set(type, slugs);
}

// Second pass: validate each type
for (const type of weaponTypes) {
  const craftingFile = path.join(weaponDataDir, `${type}.json`);
  const mapFile = path.join(weaponContentDir, type, "map.json");

  if (!fs.existsSync(craftingFile)) {
    error(`${type}: missing data/weapons/${type}.json`);
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

    function validateNode(node: {
      slug: string;
      name: string;
      type?: string;
      children?: unknown[];
    }) {
      const nodeType = node.type || type;
      const nodeTypeSlugs = allWeaponSlugs.get(nodeType) ?? slugs;
      if (!nodeTypeSlugs.has(node.slug)) {
        // Data inconsistency in source content — warn rather than error
        warn(
          `${type}/map.json: node "${node.name}" (slug: ${node.slug}, type: ${nodeType}) not found in crafting data`,
        );
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children as (typeof node)[]) {
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

const armorDataDir = path.join(dataDir, "armor");
for (const file of fs
  .readdirSync(armorDataDir)
  .sort()
  .filter((e) => e.endsWith(".json"))) {
  const slot = file.replace(/\.json$/, "");
  const craftingFile = path.join(armorDataDir, file);

  const data = JSON.parse(fs.readFileSync(craftingFile, "utf-8")) as {
    armor: Record<string, unknown>[];
  };

  const piecesByRank = new Map<string, { name: string; sex?: string }[]>();

  for (const a of data.armor) {
    const name = a.name as string | undefined;
    const rank = (a.rank as string) || "low-rank";
    if (!name) {
      error(`${slot}/${rank}: armor missing name`);
      continue;
    }

    const pieces = piecesByRank.get(rank) ?? [];
    pieces.push({ name, sex: a.sex as string | undefined });
    piecesByRank.set(rank, pieces);
  }

  for (const rank of ["low-rank", "high-rank", "g-rank"]) {
    const pieces = piecesByRank.get(rank) ?? [];
    const slugs = new Set<string>();
    for (const slug of armorSlugs(pieces)) {
      if (slugs.has(slug)) error(`${slot}/${rank}: duplicate slug "${slug}"`);
      slugs.add(slug);
    }

    // Every linked node in the crafting tree must point at a real piece.
    const mapFile = path.join(contentDir, "armorsmith", slot, rank, "map.json");
    if (fs.existsSync(mapFile)) {
      type Node = { slug: string; name: string; rarity?: unknown; children?: Node[] };
      const visit = (node: Node) => {
        if (node.rarity && !slugs.has(node.slug)) {
          error(
            `${slot}/${rank}/map.json: node "${node.name}" (slug: ${node.slug}) not found in armor data`,
          );
        }
        node.children?.forEach(visit);
      };
      (JSON.parse(fs.readFileSync(mapFile, "utf-8")) as { map?: Node[] }).map?.forEach(visit);
    }

    console.log(`  ${slot}/${rank}: ${pieces.length} pieces`);
  }
}

// ─── Decorations ──────────────────────────────────────────────────────────────

section("Validating decorations…");

const decoFile = path.join(dataDir, "decorations.json");
if (!fs.existsSync(decoFile)) {
  error("Missing data/decorations.json");
} else {
  const data = JSON.parse(fs.readFileSync(decoFile, "utf-8")) as {
    decorations: Record<string, unknown>[];
  };
  const slugs = new Set<string>();
  let count = 0;

  for (const d of data.decorations) {
    const name = d.name as string | undefined;
    if (!name) {
      error("decoration missing name");
      continue;
    }

    const slug = slugify(name);
    if (slugs.has(slug)) error(`decoration: duplicate slug "${slug}"`);
    slugs.add(slug);

    // Mirrors decoration.schema.json: every skill is a non-empty string.
    const skills = d.skills;
    if (!Array.isArray(skills) || skills.length === 0) {
      error(`decoration "${name}": skills must be a non-empty array`);
    } else if (skills.some((s) => typeof s !== "string" || s.trim() === "")) {
      error(`decoration "${name}": empty skill in skills`);
    }
    count++;
  }

  console.log(`  decorations: ${count} entries`);
}

// ─── Skills ───────────────────────────────────────────────────────────────────
// Every skill tree named on armor or a decoration must be in data/skills.json
// (by name or alias), or the set builder can't search for it.

section("Validating skills…");

{
  const trees = (
    JSON.parse(fs.readFileSync(path.join(dataDir, "skills.json"), "utf-8")) as {
      skills: SkillTreeData[];
    }
  ).skills;
  const names = treeNameIndex(trees);
  if (names.size !== trees.reduce((n, t) => n + 1 + (t.aliases?.length ?? 0), 0)) {
    error("skills: a tree name or alias appears twice");
  }
  const unknown = new Map<string, string>();
  for (const file of fs.readdirSync(path.join(dataDir, "armor"))) {
    const { armor } = JSON.parse(fs.readFileSync(path.join(dataDir, "armor", file), "utf-8")) as {
      armor: { name: string; skills?: { name: string }[] }[];
    };
    for (const p of armor) {
      for (const s of p.skills ?? []) if (!names.has(s.name)) unknown.set(s.name, p.name);
    }
  }
  const { decorations } = JSON.parse(
    fs.readFileSync(path.join(dataDir, "decorations.json"), "utf-8"),
  ) as { decorations: { name: string; skills?: string[] }[] };
  for (const d of decorations) {
    for (const s of d.skills ?? []) {
      const parsed = parseDecorationSkill(s);
      if (!parsed) {
        if (s.trim()) error(`decoration ${d.name}: can't read skill "${s}"`);
        continue;
      }
      if (!names.has(parsed.name)) unknown.set(parsed.name, d.name);
    }
  }
  for (const [tree, item] of unknown) {
    error(`skills: "${tree}" (on ${item}) is not a tree or alias in data/skills.json`);
  }
  console.log(`  skills: ${trees.length} trees`);
}

// ─── Monsters ─────────────────────────────────────────────────────────────────

section("Validating monsters…");

const monsterDataDir = path.join(dataDir, "monsters");
for (const file of fs
  .readdirSync(monsterDataDir)
  .sort()
  .filter((e) => e.endsWith(".json"))) {
  const category = file.replace(/\.json$/, "");
  const jsonFile = path.join(monsterDataDir, file);

  const data = JSON.parse(fs.readFileSync(jsonFile, "utf-8")) as {
    monsters: Record<string, unknown>[];
  };
  const slugs = new Set<string>();
  let count = 0;

  for (const m of data.monsters ?? []) {
    const name = m.name as string | undefined;
    if (!name) {
      error(`monsters/${category}: monster missing name`);
      continue;
    }

    const slug = slugify(name);
    if (slugs.has(slug)) error(`monsters/${category}: duplicate slug "${slug}"`);
    slugs.add(slug);
    count++;
  }

  console.log(`  ${category}: ${count} monsters`);
}

// ─── Equipment IDs ────────────────────────────────────────────────────────────

section("Validating equipment IDs…");

const equipmentIdsFile = path.join(dataDir, "equipment-ids.json");
if (!fs.existsSync(equipmentIdsFile)) {
  error("Missing data/equipment-ids.json (run `pnpm generate-equipment-ids`)");
} else {
  type IdEntry = { name: string; type?: string; sex?: string } | null;
  const ids = JSON.parse(fs.readFileSync(equipmentIdsFile, "utf-8")) as Record<string, IdEntry[]>;

  const readNames = (file: string, key: string) =>
    new Set(
      (
        JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf-8"))[key] as Record<
          string,
          unknown
        >[]
      ).map((i) => i.name as string),
    );
  const weaponNames = new Map(
    weaponTypes.map((t) => [t, readNames(`weapons/${t}.json`, "weapons")]),
  );

  for (const [slot, entries] of Object.entries(ids)) {
    const armorNames =
      slot === "melee" || slot === "ranged" ? null : readNames(`armor/${slot}.json`, "armor");
    let mapped = 0;
    entries.forEach((entry, id) => {
      if (!entry) return;
      mapped++;
      const names = armorNames ?? weaponNames.get(entry.type ?? "");
      if (!names?.has(entry.name)) {
        error(
          `equipment-ids ${slot}[${id}]: "${entry.name}"${entry.type ? ` (${entry.type})` : ""} not found in data/ (rerun \`pnpm generate-equipment-ids\`)`,
        );
      }
    });
    console.log(`  ${slot}: ${mapped} IDs mapped`);
  }
}

// ─── Items (in-game item IDs) ─────────────────────────────────────────────────

section("Validating items…");

const itemsFile = path.join(dataDir, "items.json");
if (!fs.existsSync(itemsFile)) {
  error("Missing data/items.json");
} else {
  const data = JSON.parse(fs.readFileSync(itemsFile, "utf-8")) as { items: ItemRecord[] };
  const ITEM_KEYS = new Set([
    "id",
    "name",
    "name_jp",
    "aliases",
    "rarity",
    "regions",
    "placeholder",
  ]);
  const REGIONS = new Set(["jp", "us", "eu"]);
  const ids = new Set<number>();

  if (!Array.isArray(data.items)) {
    error('items.json: "items" is not an array');
    data.items = [];
  }

  // Structural checks mirroring data/schemas/item.schema.json.
  for (const it of data.items) {
    const label = `items/${it.id ?? "?"}`;
    for (const k of Object.keys(it)) if (!ITEM_KEYS.has(k)) error(`${label}: unknown key "${k}"`);
    if (!Number.isInteger(it.id) || it.id < 1 || it.id > 65534)
      error(`${label}: id must be an integer 1–65534`);
    else if (ids.has(it.id)) error(`${label}: duplicate id`);
    ids.add(it.id);
    if (typeof it.name !== "string" || !it.name.trim()) error(`${label}: missing name`);
    else if (it.name !== it.name.trim()) error(`${label}: name has surrounding whitespace`);
    else if (it.name.length > ITEM_NAME_LENGTH)
      error(`${label}: name "${it.name}" is longer than the game's ${ITEM_NAME_LENGTH} characters`);
    if (typeof it.name_jp !== "string" || !it.name_jp) error(`${label}: missing name_jp`);
    if (it.aliases !== undefined) {
      if (
        !Array.isArray(it.aliases) ||
        it.aliases.some((a) => typeof a !== "string" || !a.trim())
      ) {
        error(`${label}: aliases must be non-empty strings`);
      } else if (new Set(it.aliases).size !== it.aliases.length) {
        error(`${label}: duplicate alias`);
      }
    }
    if (
      it.rarity !== undefined &&
      (!Number.isInteger(it.rarity) || it.rarity < 1 || it.rarity > 10)
    ) {
      error(`${label}: rarity must be an integer 1–10`);
    }
    if (
      it.regions !== undefined &&
      (!Array.isArray(it.regions) || it.regions.some((r) => !REGIONS.has(r)))
    ) {
      error(`${label}: regions must be a subset of jp/us/eu`);
    }
    if (it.placeholder !== undefined && it.placeholder !== true)
      error(`${label}: placeholder must be true`);
  }

  // Every name/alias must identify exactly one item.
  const { index, collisions } = buildItemNameIndex(data.items);
  for (const [name, owners] of collisions) {
    error(`items: name "${name}" is claimed by ids ${owners.join(", ")}`);
  }

  // Every material used by recipes and monster drops must link to an item, so
  // the same item is one entity across recipes and the save loader. Fix a miss
  // by correcting the spelling in the recipe data or adding an alias.
  //
  // Recipe materials, drops and quest items must also be spelled exactly like the game,
  // which is the item's `name` (aliases are older site spellings, kept so they
  // still link). A drop's " xN" amount suffix isn't part of the name.
  const gameName = new Map(data.items.map((it) => [it.id, it.name]));
  const unresolved = new Map<string, Set<string>>(); // name -> where used
  const misspelled = new Map<string, { game: string; where: Set<string> }>();
  const note = (name: unknown, where: string, exact = false) => {
    if (typeof name !== "string") return;
    const id = index.get(normalizeItemName(name));
    if (id !== undefined) {
      const game = gameName.get(id)!;
      const spelled = name.replace(/\s+x\d+$/i, "");
      if (exact && spelled !== game) {
        const entry = misspelled.get(spelled) ?? { game, where: new Set<string>() };
        entry.where.add(where);
        misspelled.set(spelled, entry);
      }
      return;
    }
    const set = unresolved.get(name) ?? new Set<string>();
    set.add(where);
    unresolved.set(name, set);
  };
  const walk = (file: string) => {
    const doc = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
    const rel = path.relative(dataDir, file);
    for (const list of Object.values(doc)) {
      if (!Array.isArray(list)) continue;
      for (const entry of list as Record<string, unknown>[]) {
        if (!entry || typeof entry !== "object") continue;
        for (const [key, val] of Object.entries(entry)) {
          if (key.endsWith("_mats") && Array.isArray(val)) {
            for (const m of val as { name?: unknown }[])
              note(m?.name, `${rel} ${entry.name}`, true);
          }
        }
        const drops = entry.drops as
          Record<string, Record<string, { name?: unknown }[]>> | undefined;
        if (drops && typeof drops === "object") {
          for (const sources of Object.values(drops)) {
            for (const list2 of Object.values(sources ?? {})) {
              for (const d of list2 ?? []) note(d?.name, `${rel} ${entry.name} (drop)`, true);
            }
          }
        }
      }
    }
  };
  for (const sub of ["weapons", "armor", "monsters"]) {
    const dir = path.join(dataDir, sub);
    for (const f of fs
      .readdirSync(dir)
      .filter((e) => e.endsWith(".json"))
      .sort())
      walk(path.join(dir, f));
  }
  walk(path.join(dataDir, "decorations.json"));

  // Quest supply boxes and reward tables.
  const questDir = path.join(dataDir, "quests");
  for (const f of fs
    .readdirSync(questDir)
    .filter((e) => e.endsWith(".json"))
    .sort()) {
    const { quests } = JSON.parse(fs.readFileSync(path.join(questDir, f), "utf-8")) as {
      quests: {
        id: number;
        supplies?: { item?: unknown }[];
        reward_tables?: { items?: { item?: unknown }[] }[];
      }[];
    };
    for (const q of quests) {
      const where = `quests/${f} #${q.id}`;
      for (const s of q.supplies ?? []) note(s?.item, `${where} (supplies)`, true);
      for (const t of q.reward_tables ?? [])
        for (const r of t.items ?? []) note(r?.item, `${where} (rewards)`, true);
    }
  }

  for (const [name, where] of unresolved) {
    error(
      `items: material "${name}" matches no item name or alias (used in ${[...where].slice(0, 2).join("; ")})`,
    );
  }
  for (const [name, { game, where }] of misspelled) {
    error(
      `items: "${name}" isn't the game's spelling "${game}" (used in ${[...where].slice(0, 2).join("; ")})`,
    );
  }

  console.log(
    `  items: ${data.items.length} ids, ${index.size} names/aliases, ${unresolved.size} unlinked materials`,
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(
  `\n${errors === 0 ? "✓" : "✗"} Validation complete — ${errors} error(s), ${warnings} warning(s)`,
);

if (errors > 0) {
  process.exit(1);
}
