/**
 * Validates the content JSON data files for common issues: the files as
 * the site reads them (readData), and their IDs and string tables.
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
import {
  ARMOR_SLOTS,
  EQUIPMENT_TABLES,
  readData,
  readRawData,
  readStringsDoc,
  weaponTable,
} from "game-data";

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

// ─── IDs and strings ──────────────────────────────────────────────────────────
// Records carry game IDs and refer to each other by ID; names are in
// data/strings/ (see packages/game-data). Every record needs an English name,
// IDs are unique per table, every reference resolves, and the string tables
// name nothing that isn't there.

section("Validating IDs and strings…");

{
  const weaponTypes = fs
    .readdirSync(path.join(dataDir, "weapons"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => f.slice(0, -".json".length));
  type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const en = readStringsDoc(dataDir) as Record<string, Record<string, unknown> | undefined>;
  const ja = readStringsDoc(dataDir, "ja") as Record<string, Record<string, unknown> | undefined>;
  const owned = new Map<string, Set<string>>();
  const own = (kind: string, key: number | string, where: string, named = true) => {
    const keys = owned.get(kind) ?? new Set<string>();
    owned.set(kind, keys);
    if (keys.has(String(key))) error(`${where}: ${kind} ID ${key} is used twice`);
    keys.add(String(key));
    if (named && en[kind]?.[String(key)] === undefined)
      error(`${where}: ${kind} ${key} has no name in data/strings/en.json`);
  };

  for (const item of readRawData<{ items: Raw[] }>(dataDir, "items.json").items)
    own("item", item.id, "items.json");
  for (const type of weaponTypes)
    for (const w of readRawData<{ weapons: Raw[] }>(dataDir, "weapons", `${type}.json`).weapons)
      own(weaponTable(type), w.id, `weapons/${type}.json`);
  for (const slot of ARMOR_SLOTS)
    for (const a of readRawData<{ armor: Raw[] }>(dataDir, "armor", `${slot}.json`).armor)
      own(slot, a.id, `armor/${slot}.json`);
  for (const t of readRawData<{ skills: Raw[] }>(dataDir, "skills.json").skills) {
    own("skill", t.id, "skills.json");
    for (const a of t.skills) own("skill_activation", `${t.id}:${a.points}`, "skills.json");
  }
  const decorationIds = new Set<string>();
  for (const d of readRawData<{ decorations: Raw[] }>(dataDir, "decorations.json").decorations) {
    if (!owned.get("item")?.has(String(d.id))) error(`decorations.json: ${d.id} is not an item`);
    if (decorationIds.has(String(d.id))) error(`decorations.json: item ${d.id} is listed twice`);
    decorationIds.add(String(d.id));
  }
  const monsterFiles = fs
    .readdirSync(path.join(dataDir, "monsters"))
    .filter((f) => f.endsWith(".json"));
  for (const f of monsterFiles)
    for (const m of readRawData<{ monsters: Raw[] }>(dataDir, "monsters", f).monsters)
      own("monster", m.id, `monsters/${f}`);
  const questFiles = fs
    .readdirSync(path.join(dataDir, "quests"))
    .filter((f) => f.endsWith(".json"));
  const questMonsters = new Set<string>();
  for (const f of questFiles)
    for (const q of readRawData<{ quests: Raw[] }>(dataDir, "quests", f).quests) {
      own("quest", q.id, `quests/${f}`, false);
      for (const m of [q.target, ...q.large_monsters, ...q.small_monsters])
        if (m) questMonsters.add(String(m.monster));
    }

  // References resolve: reading each file's named view looks every one up
  // (items, weapons, skills and their aliases, monsters, maps).
  const files = [
    "items.json",
    "skills.json",
    "decorations.json",
    "gathering.json",
    "shops.json",
    "veggie-trades.json",
    "combinations.json",
    ...weaponTypes.map((t) => `weapons/${t}.json`),
    ...ARMOR_SLOTS.map((s) => `armor/${s}.json`),
    ...monsterFiles.map((f) => `monsters/${f}`),
    ...questFiles.map((f) => `quests/${f}`),
  ];
  for (const rel of files) {
    try {
      readData(dataDir, rel);
    } catch (e) {
      error(`${rel}: ${(e as Error).message}`);
    }
  }
  for (const type of weaponTypes)
    for (const w of readRawData<{ weapons: Raw[] }>(dataDir, "weapons", `${type}.json`).weapons) {
      const refs = [w.improve_from ?? [], w.improve_to ?? []].flat() as number[];
      for (const id of refs)
        if (!owned.get(weaponTable(type))?.has(String(id)))
          error(
            `weapons/${type}.json: ${w.id} upgrades from or to ${id}, which isn't a ${weaponTable(type)} weapon`,
          );
    }

  // Nothing in the string tables that no record has.
  const stale = (lang: string, doc: typeof en, kind: string, keys: Set<string> | undefined) => {
    for (const key of Object.keys(doc[kind] ?? {}))
      if (!keys?.has(key)) error(`strings/${lang}.json: ${kind} ${key} names nothing in data/`);
  };
  for (const kind of [...EQUIPMENT_TABLES, "item", "skill", "skill_activation"])
    stale("en", en, kind, owned.get(kind));
  stale("en", en, "decoration", decorationIds);
  stale("en", en, "monster_description", owned.get("monster"));
  stale("en", en, "monster", new Set([...(owned.get("monster") ?? []), ...questMonsters]));
  for (const kind of ["quest", "quest_goal", "quest_details", "quest_fail", "quest_client"])
    stale("en", en, kind, owned.get("quest"));
  stale("ja", ja, "item", owned.get("item"));

  console.log(
    `  ${[...owned].map(([kind, keys]) => `${kind} ${keys.size}`).join(", ")}; ${Object.keys(en.map ?? {}).length} maps`,
  );
}

// The checks below read the named view; a broken reference above would stop them.
if (errors > 0) {
  console.error(`\n✗ Validation stopped — ${errors} error(s) in the IDs and strings`);
  process.exit(1);
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
  const data = readData(dataDir, "weapons", `${type}.json`) as {
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

  const data = readData(dataDir, "weapons", `${type}.json`) as {
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

  const data = readData(dataDir, "armor", file) as {
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
  const data = readData(dataDir, "decorations.json") as {
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
    readData(dataDir, "skills.json") as {
      skills: SkillTreeData[];
    }
  ).skills;
  const names = treeNameIndex(trees);
  if (names.size !== trees.reduce((n, t) => n + 1 + (t.aliases?.length ?? 0), 0)) {
    error("skills: a tree name or alias appears twice");
  }
  const unknown = new Map<string, string>();
  for (const file of fs.readdirSync(path.join(dataDir, "armor"))) {
    const { armor } = readData(dataDir, "armor", file) as {
      armor: { name: string; skills?: { name: string }[] }[];
    };
    for (const p of armor) {
      for (const s of p.skills ?? []) if (!names.has(s.name)) unknown.set(s.name, p.name);
    }
  }
  const { decorations } = readData(dataDir, "decorations.json") as {
    decorations: { name: string; skills?: string[] }[];
  };
  for (const d of decorations) {
    let positive = 0;
    for (const s of d.skills ?? []) {
      const parsed = parseDecorationSkill(s);
      if (!parsed) {
        if (s.trim()) error(`decoration ${d.name}: can't read skill "${s}"`);
        continue;
      }
      if (!names.has(parsed.name)) unknown.set(parsed.name, d.name);
      if (parsed.amount > 0) positive++;
    }
    // The set search's bounds count each decoration slot toward one wanted
    // skill (set-search.ts, `reachable`).
    if (positive > 1) error(`decoration ${d.name}: adds to more than one skill tree`);
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

  const data = readData(dataDir, "monsters", file) as {
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

// ─── Items (in-game item IDs) ─────────────────────────────────────────────────

section("Validating items…");

const itemsFile = path.join(dataDir, "items.json");
if (!fs.existsSync(itemsFile)) {
  error("Missing data/items.json");
} else {
  const data = readData(dataDir, "items.json") as {
    colors?: string[];
    items: ItemRecord[];
  };
  const ITEM_KEYS = new Set([
    "id",
    "name",
    "name_jp",
    "aliases",
    "rarity",
    "carry",
    "price",
    "icon",
    "color",
    "regions",
    "placeholder",
  ]);
  const REGIONS = new Set(["jp", "us", "eu"]);
  const ids = new Set<number>();

  if (!Array.isArray(data.items)) {
    error('items.json: "items" is not an array');
    data.items = [];
  }

  // Icon tints live twice, the palette here and as --color-item-* tokens.
  const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf-8");
  const tint = (i: number) => css.match(new RegExp(`--color-item-${i}:\\s*(#[0-9a-f]{6})`))?.[1];
  data.colors?.forEach((hex, i) => {
    if (i !== 9 && tint(i) !== hex)
      error(`items.json: colors[${i}] is ${hex}, but --color-item-${i} is ${tint(i)}`);
  });

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
    if (it.icon !== undefined) {
      const sprite = path.join(root, "public/images", `item-${it.icon}.png`);
      if (!fs.existsSync(sprite)) error(`${label}: no sprite for icon ${it.icon}`);
    }
    if (it.color !== undefined && (it.color === 9 || !tint(it.color)))
      error(`${label}: no --color-item-${it.color} token`);
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
    if (it.carry !== undefined && (!Number.isInteger(it.carry) || it.carry < 1 || it.carry > 255))
      error(`${label}: carry must be an integer 1–255`);
    if (it.price !== undefined && (!Number.isInteger(it.price) || it.price < 0))
      error(`${label}: price must be a non-negative integer`);
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
  const walk = (rel: string) => {
    const doc = readData<Record<string, unknown>>(dataDir, rel);
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
    for (const f of fs
      .readdirSync(path.join(dataDir, sub))
      .filter((e) => e.endsWith(".json"))
      .sort())
      walk(`${sub}/${f}`);
  }
  walk("decorations.json");

  // Quest supply boxes and reward tables.
  const questDir = path.join(dataDir, "quests");
  for (const f of fs
    .readdirSync(questDir)
    .filter((e) => e.endsWith(".json"))
    .sort()) {
    const { quests } = readData(dataDir, "quests", f) as {
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
