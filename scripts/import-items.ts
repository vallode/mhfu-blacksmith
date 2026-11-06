/**
 * One-off importer that builds data/items.json (in-game item ID -> name) from
 * upstream community datamines. It is not part of the build; data/items.json is
 * the committed source of truth. Re-run only when refreshing from upstream:
 *
 *   tsx scripts/import-items.ts \
 *     --master  <Daigo829/mhfu-save-viewer>/docs/item_master_table.csv \
 *     --enum    <IncognitoMan/mhp2g-patterns>/includes/mhp2g/items.enum \
 *     --kolyn   <Kolyn090/mhfu-db>/items.json
 *
 * Sources (all MIT licensed, plain data only):
 *   - Daigo829/mhfu-save-viewer  item_master_table.csv — per-ID names for
 *     ULUS (NA), ULES (EU), ULJM (JP), the MHP2G English fan patch and
 *     FUComplete, plus rarity. Primary source for `name`, `name_jp`.
 *   - IncognitoMan/mhp2g-patterns items.enum — ImHex enum indexed by item ID.
 *     Used to cross-check every ID; its spelling is kept as an alias.
 *   - Kolyn090/mhfu-db items.json — item list with exact rarity. Used only to
 *     corroborate rarity (joined by name, not by position).
 *
 * The import fails if the master table and the enum disagree on any ID other
 * than the known JP-only promo items listed in JP_ONLY_RENAMES.
 */
import fs from "fs";
import path from "path";

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
const kolynPath = arg("kolyn");

// IDs whose name differs between the master table (NA column) and the enum.
// These are Japanese magazine/promo items: the NA/EU games only carry
// placeholder strings for them, so neither spelling is "official".
const JP_ONLY_RENAMES = new Set([92, 465, 519, 930, 931, 932, 934, 935, 936, 937, 938]);

// IDs that are not real items (UI placeholder / developer padding).
const PLACEHOLDERS = new Set([128, 465, 875]);

// Spellings used in this repo's recipe data (create/improve/alternative mats in
// data/weapons, data/armor) that match no upstream name. Mapped by hand after checking each recipe; kept as
// aliases so the recipe material and the save item resolve to the same entity.
const SITE_ALIASES: Record<number, string[]> = {
  48: ["Well Done Steak"], // Well-done Steak
  132: ["Paraylsiscoating"], // ParalysisCoating
  229: ["Knife Mackarel"], // Knife Mackerel
  405: ["HrdGypcerosHead"], // HardGypcerosHead
  436: ["Blngnga Hrd Whskr"], // Blngnga HrdWhskr
  439: ["Brwn Blngnga Pelt"], // Brwn BlngngaPelt
  441: ["Brwn Blngnga Tail"], // Brwn BlngngaTail
  477: ["Green Plesioth Scale+"], // Grn Plsioth Scl+
  588: ["Basarios Carapace"], // Basarios Carpace
  594: ["Tigrex Scale +"], // Tigrex Scale+
  694: ["Lao-Shan's Scale+"], // Lao-Shan Scale+
  695: ["Lao Shan'sThkScl", "Lao-Shan's Thick Scale"], // Lao-Shan'sThkScl
  696: ["Lao Shan's Ruby"], // Lao-Shan's Ruby
  480: ["Grn Plesioth Fin+"], // Grn Plsioth Fin+
  502: ["PlumD.HermitrClaw"], // PlumD.HermitrClw
  547: ["Fire Wyvern BrnStm"], // FireWyvrn BrnStm
  576: ["SlvrRthlosHrdTail"], // LthrSlvrRthlsTal / SlvRthlosHrdTail
  619: ["StrNargaCttngWing"], // StrNargaCttngWng
  661: ["Vespoid InnrWing"], // Vespoid InnrWng
  662: ["Vespoid RazorWing"], // Vspoid Razorwing
  905: ["Commedation S"], // Commendation S
  911: ["Plus Class Ticket"], // Plus Class Tcket
};

interface Item {
  id: number;
  name: string;
  name_jp: string;
  aliases?: string[];
  rarity?: number;
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
const enumNames = [...fs.readFileSync(enumPath, "utf-8").matchAll(/^\s*"(.*)",?\s*(?:\};)?\s*$/gm)].map(
  (m) => m[1]
);

// --- kolyn -----------------------------------------------------------------
const kolyn = JSON.parse(fs.readFileSync(kolynPath, "utf-8")) as { name: string; rare: number }[];
const kolynCount = new Map<string, number>();
for (const k of kolyn) kolynCount.set(k.name, (kolynCount.get(k.name) ?? 0) + 1);
const kolynRare = new Map(kolyn.filter((k) => kolynCount.get(k.name) === 1).map((k) => [k.name, k.rare]));

const isDummy = (s: string) => !s || s.trim().toLowerCase() === "dummy";
const problems: string[] = [];
const rarityConflicts: string[] = [];
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
  for (const s of [r.name_ULES, r.name_ENGPATCH, r.name_COMPLETE, en, ...(SITE_ALIASES[id] ?? [])]) {
    const t = (s ?? "").trim();
    if (!isDummy(t) && t !== name) aliases.add(t);
  }

  const item: Item = { id, name, name_jp: r.name_JP.trim() };
  if (aliases.size) item.aliases = [...aliases];

  // Rarity: keep only when two sources agree. The master table publishes
  // "4-5" for some items; accept Kolyn's exact value if it falls in range.
  const kr = kolynRare.get(na) ?? kolynRare.get(en);
  const mr = r.rarity;
  if (kr !== undefined && mr) {
    if (mr === String(kr) || (mr === "4-5" && (kr === 4 || kr === 5))) item.rarity = kr;
    else rarityConflicts.push(`id ${id} ${name}: master ${mr} vs kolyn ${kr}`);
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
    "Generated by scripts/import-items.ts from Daigo829/mhfu-save-viewer, " +
    "IncognitoMan/mhp2g-patterns and Kolyn090/mhfu-db (all MIT).",
  items,
};
const dest = path.join(process.cwd(), "data", "items.json");
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`import-items: wrote ${items.length} items to ${path.relative(process.cwd(), dest)}`);
console.log(`  with rarity: ${items.filter((i) => i.rarity).length}`);
if (rarityConflicts.length) {
  console.log(`  rarity omitted (sources disagree): ${rarityConflicts.length}`);
  for (const c of rarityConflicts) console.log(`    ${c}`);
}
