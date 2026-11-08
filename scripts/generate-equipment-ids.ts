/**
 * Generates data/equipment-ids.json: the game's equipment IDs (the ones a
 * save file's equipment box stores) mapped onto the weapons and armor in
 * data/.
 *
 * Each equipment box slot holds an equip type and a u16 ID. The type picks
 * one of seven ID spaces. Weapons share two spaces across all classes
 * (every blademaster weapon in one, every gunner weapon in the other):
 *
 *   type 0  leggings     LegArmorID
 *   type 1  helmet       HeadArmorID
 *   type 2  plate        ChestArmorID
 *   type 3  gauntlets    ArmArmorID
 *   type 4  waist        WaistArmorID
 *   type 5  melee        WepBMID   (GS, LS, SnS, DB, Hammer, HH, Lance, GL)
 *   type 6  ranged       WepGunID  (LBG, HBG, Bow)
 *
 * The ID-to-name tables come from IncognitoMan/mhp2g-patterns'
 * `equip.enum` (MIT, vendored at tools/mhfu-extract/vendor/mhp2g-patterns).
 * In that project the same tables name the `EquipID` of the EBOOT's crafting
 * recipes and quest rewards, which use the same type + u16 ID layout as a
 * save slot. mhfu-extract's diffs against the real disc also confirmed that
 * the recipe IDs index these tables. A real save file has not been checked
 * against this mapping yet.
 *
 * The enum names are MHP2G fan translations, so they don't always match the
 * MHFU names in data/. Each ID is resolved in this order:
 *   1. an explicit alias in scripts/equipment-id-aliases.json, keyed by ID
 *      (the alias also records the enum name it expects, so a change to the
 *      vendored file fails loudly instead of quietly shifting IDs);
 *   2. an exact name match in that slot's data;
 *   3. a match ignoring case, spaces and punctuation
 *      ("GoldenMoonGreavesZ" = "GoldenMoon Greaves Z").
 * IDs with no counterpart in data/ (unused placeholders and a handful of
 * MHP2G-only pieces) are written as null.
 *
 * Armor names that appear twice in one slot (the high-rank Red/Blue Guild
 * Guard pieces exist as separate Male and Female entries) are paired by
 * order: the first ID gets the first entry in data/ (Male), the second gets
 * the second (Female). These pieces have identical stats, so a swap would
 * only link the other sex's page.
 *
 * Rerun after renaming or adding weapons/armor: `pnpm generate-equipment-ids`.
 * The script fails if an alias is stale, if two IDs claim one item, or if
 * any item in data/ ends up without an ID.
 */
import fs from "fs";
import path from "path";
import { isPlaceholder, loose, readEnumFile } from "./lib/mhp2g-enum";

const root = process.cwd();
const ALIAS_FILE = path.join(root, "scripts/equipment-id-aliases.json");
const OUT_FILE = path.join(root, "data/equipment-ids.json");

const WEAPON_SLOTS = {
  melee: {
    table: "WepBMID",
    types: [
      "great-sword",
      "long-sword",
      "sword-and-shield",
      "dual-blades",
      "hammer",
      "hunting-horn",
      "lance",
      "gunlance",
    ],
  },
  ranged: { table: "WepGunID", types: ["light-bowgun", "heavy-bowgun", "bow"] },
} as const;

const ARMOR_SLOTS = {
  leggings: "LegArmorID",
  helmet: "HeadArmorID",
  plate: "ChestArmorID",
  gauntlets: "ArmArmorID",
  waist: "WaistArmorID",
} as const;

type Slot = keyof typeof WEAPON_SLOTS | keyof typeof ARMOR_SLOTS;

/** Output order: by equip type code (see the table above). */
const SLOT_ORDER: Slot[] = ["leggings", "helmet", "plate", "gauntlets", "waist", "melee", "ranged"];

interface Candidate {
  name: string;
  type?: string;
  sex?: string;
}

type Entry = { name: string; type?: string; sex?: string } | null;

interface Alias {
  enum: string;
  name: string;
  note?: string;
}

let failures = 0;
function fail(msg: string) {
  console.error(`  ✗ ${msg}`);
  failures++;
}

function readItems(file: string, key: "weapons" | "armor"): Record<string, unknown>[] {
  const data = JSON.parse(fs.readFileSync(path.join(root, "data", file), "utf-8"));
  return (data[key] as Record<string, unknown>[]).filter((i) => i.name);
}

function candidatesFor(slot: Slot): Candidate[] {
  if (slot === "melee" || slot === "ranged") {
    return WEAPON_SLOTS[slot].types.flatMap((type) =>
      readItems(`weapons/${type}.json`, "weapons").map((w) => ({ name: w.name as string, type })),
    );
  }
  return readItems(`armor/${slot}.json`, "armor").map((a) => ({
    name: a.name as string,
    sex: a.sex as string | undefined,
  }));
}

function resolveSlot(slot: Slot, enumNames: string[], aliases: Record<string, Alias>): Entry[] {
  const candidates = candidatesFor(slot);
  const byName = new Map<string, Candidate[]>();
  const byLoose = new Map<string, Candidate[]>();
  for (const c of candidates) {
    byName.set(c.name, [...(byName.get(c.name) ?? []), c]);
    byLoose.set(loose(c.name), [...(byLoose.get(loose(c.name)) ?? []), c]);
  }

  for (const [id, alias] of Object.entries(aliases)) {
    const enumName = enumNames[Number(id)];
    if (enumName !== alias.enum)
      fail(`${slot} alias ${id}: expected enum name "${alias.enum}", found "${enumName}"`);
    if (!byName.has(alias.name)) fail(`${slot} alias ${id}: "${alias.name}" is not in data/`);
    if (alias.name === enumName)
      fail(`${slot} alias ${id}: "${alias.name}" already matches exactly, drop the alias`);
  }

  const claimed = new Map<Candidate, number>();
  const taken = new Map<string, number>(); // how many same-name entries are already claimed, for in-order pairing
  const entries: Entry[] = enumNames.map((enumName, id) => {
    const alias = aliases[id];
    let pool: Candidate[] | undefined;
    if (alias) pool = byName.get(alias.name);
    else if (!isPlaceholder(enumName)) pool = byName.get(enumName) ?? byLoose.get(loose(enumName));
    if (!pool) return null;

    const key = pool[0].name;
    const nth = taken.get(key) ?? 0;
    taken.set(key, nth + 1);
    const match = pool[nth];
    if (!match) {
      fail(
        `${slot} ${id} ("${enumName}"): "${key}" is already claimed by ID ${claimed.get(pool[0])}`,
      );
      return null;
    }
    claimed.set(match, id);
    return {
      name: match.name,
      ...(match.type ? { type: match.type } : {}),
      ...(pool.length > 1 && match.sex ? { sex: match.sex } : {}),
    };
  });

  const unmapped = candidates.filter((c) => !claimed.has(c));
  for (const c of unmapped)
    fail(`${slot}: "${c.name}"${c.type ? ` (${c.type})` : ""} has no equipment ID`);

  const missing = enumNames.flatMap((n, id) =>
    entries[id] === null && !isPlaceholder(n) ? [`${id} ${n}`] : [],
  );
  console.log(
    `  ${slot}: ${entries.filter(Boolean).length}/${candidates.length} items mapped` +
      (missing.length ? `; IDs with no item in data/: ${missing.join(", ")}` : ""),
  );
  return entries;
}

/** One entry per line, so diffs show exactly which IDs changed. */
function serialize(slots: Record<Slot, Entry[]>): string {
  const sections = SLOT_ORDER.map((slot) => {
    const lines = slots[slot].map((e) => `    ${JSON.stringify(e)}`);
    return `  "${slot}": [\n${lines.join(",\n")}\n  ]`;
  });
  return `{\n${sections.join(",\n")}\n}\n`;
}

const tables = readEnumFile("equip.enum");
const aliases = JSON.parse(fs.readFileSync(ALIAS_FILE, "utf-8")) as Record<
  Slot,
  Record<string, Alias>
>;

console.log("Mapping equipment IDs…");
const result = {} as Record<Slot, Entry[]>;
for (const slot of SLOT_ORDER) {
  const table =
    slot === "melee" || slot === "ranged" ? WEAPON_SLOTS[slot].table : ARMOR_SLOTS[slot];
  const names = tables.get(table);
  if (!names) {
    fail(`equip.enum has no ${table} table`);
    continue;
  }
  result[slot] = resolveSlot(slot, names, aliases[slot] ?? {});
}

if (failures > 0) {
  console.error(`\n✗ ${failures} problem(s); data/equipment-ids.json was not written`);
  process.exit(1);
}

fs.writeFileSync(OUT_FILE, serialize(result));
console.log(`\n✓ Wrote ${path.relative(root, OUT_FILE)}`);
