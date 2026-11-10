/**
 * One-off importer that builds the names in data/items.json (in-game item ID ->
 * name) from upstream community datamines. It is not part of the build;
 * data/items.json is the committed source of truth. Re-run only when
 * refreshing names from upstream:
 *
 *   tsx scripts/import-items.ts \
 *     --master  <Daigo829/mhfu-save-viewer>/docs/item_master_table.csv \
 *     --enum    <IncognitoMan/mhp2g-patterns>/includes/mhp2g/items.enum
 *
 * Sources (both MIT licensed, plain data only):
 *   - Daigo829/mhfu-save-viewer  item_master_table.csv — per-ID names for
 *     ULUS (NA), ULES (EU), ULJM (JP), the MHP2G English fan patch and
 *     FUComplete. Primary source for `name`, `name_jp`.
 *   - IncognitoMan/mhp2g-patterns items.enum — ImHex enum indexed by item ID.
 *     Used to cross-check every ID; its spelling is kept as an alias.
 *
 * Rarity, carry limit and price come from the disc's item table, written by
 * `pnpm --filter mhfu-extract build-data --only items`; this keeps the ones
 * already in data/items.json.
 *
 * The import fails if the master table and the enum disagree on any ID other
 * than the known JP-only promo items listed in JP_ONLY_RENAMES.
 */
import fs from "fs";
import path from "path";
import { DATA_DIR, REPO_ROOT } from "../src/lib/paths";

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || !process.argv[i + 1]) {
    console.error(`import-items: missing --${name} <path>`);
    process.exit(1);
  }
  return process.argv[i + 1];
}

const masterPath = arg("master");
const enumPath = arg("enum");

// IDs whose name differs between the master table (NA column) and the enum.
// These are Japanese magazine/promo items: the NA/EU games only carry
// placeholder strings for them, so neither spelling is "official".
const JP_ONLY_RENAMES = new Set([92, 465, 519, 930, 931, 932, 934, 935, 936, 937, 938]);

// IDs that are not real items (UI placeholder / developer padding).
const PLACEHOLDERS = new Set([128, 465, 875]);

interface Item {
  id: number;
  name: string;
  name_jp: string;
  aliases?: string[];
  rarity?: number;
  carry?: number;
  price?: number;
  regions?: string[];
  placeholder?: true;
}

// --- master table ----------------------------------------------------------
const lines = fs.readFileSync(masterPath, "utf-8").trim().split(/\r?\n/);
const header = lines[0].split(",");
const rows = lines.slice(1).map((l) => {
  const cells = l.split(",");
  return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])) as Record<string, string>;
});

// --- enum ------------------------------------------------------------------
const enumNames = [
  ...fs.readFileSync(enumPath, "utf-8").matchAll(/^\s*"(.*)",?\s*(?:\};)?\s*$/gm),
].map((m) => m[1]);

// --- stats from the disc, kept from the committed file ---------------------
const dest = path.join(DATA_DIR, "items.json");
const committed = new Map<number, Item>(
  fs.existsSync(dest)
    ? (JSON.parse(fs.readFileSync(dest, "utf-8")) as { items: Item[] }).items.map((i) => [i.id, i])
    : [],
);

const isDummy = (s: string) => !s || s.trim().toLowerCase() === "dummy";
const problems: string[] = [];
const items: Item[] = [];

for (const r of rows) {
  const id = Number(r.item_id);
  const na = r.name_ULUS.trim();
  const en = (enumNames[id] ?? "").trim();
  if (na !== en && !JP_ONLY_RENAMES.has(id)) {
    problems.push(`id ${id}: master "${na}" vs enum "${en}"`);
  }

  const name = isDummy(na) ? en : na;
  const aliases = new Set<string>();
  for (const s of [r.name_ULES, r.name_ENGPATCH, r.name_COMPLETE, en]) {
    const t = (s ?? "").trim();
    if (!isDummy(t) && t !== name) aliases.add(t);
  }

  const item: Item = { id, name, name_jp: r.name_JP.trim() };
  if (aliases.size) item.aliases = [...aliases];

  const stats = committed.get(id);
  for (const key of ["rarity", "carry", "price"] as const) {
    if (stats?.[key] !== undefined) item[key] = stats[key];
  }

  if (isDummy(r.name_ULES) && !isDummy(na)) item.regions = ["jp", "us"];
  if (PLACEHOLDERS.has(id)) item.placeholder = true;
  items.push(item);
}

if (enumNames.length !== items.length + 1) {
  problems.push(`enum has ${enumNames.length} entries, master has ${items.length} (+ id 0)`);
}
if (problems.length) {
  console.error("import-items: sources disagree:\n  " + problems.join("\n  "));
  process.exit(1);
}

const out = {
  $comment:
    "In-game item IDs for MHFU / MHP2G (u16 values in the save's item box and pouch). " +
    "Names from apps/blacksmith/scripts/import-items.ts (Daigo829/mhfu-save-viewer and " +
    "IncognitoMan/mhp2g-patterns, both MIT); rarity, carry and price from the disc's " +
    "item table (mhfu-extract build-data).",
  items,
};
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`import-items: wrote ${items.length} items to ${path.relative(REPO_ROOT, dest)}`);
console.log(`  with disc stats: ${items.filter((i) => i.price !== undefined).length}`);
