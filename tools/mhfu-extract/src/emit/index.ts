/**
 * Orchestrates every emit/* module into the full set of data/*.json-shaped
 * files, keyed by their path relative to the repo's data/ directory. This is
 * a pure transform (BinaryReader in, in-memory JSON-shaped objects out) —
 * writing to disk is a separate, explicit step via writeEmitOutput() so
 * callers (tests, a future CLI) can inspect/diff the result first.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BinaryReader } from "../binary/reader.js";
import { ARMOR_SLOTS, type ArmorSlot } from "../tables/armor.js";
import type { TableAddressResolver } from "../tables/resolver.js";
import { WEAPON_TYPE_NAMES, type WeaponTypeName } from "../tables/weapons.js";
import { emitArmor } from "./armor.js";
import { emitDecorations } from "./decorations.js";
import { emitBlademasterWeapons, emitGunnerWeapons, type EmittedWeapon } from "./weapons.js";

const ARMOR_SLOT_TO_FILE: Record<ArmorSlot, string> = {
  head: "armor/helmet.json",
  chest: "armor/plate.json",
  arm: "armor/gauntlets.json",
  waist: "armor/waist.json",
  leg: "armor/leggings.json",
};

const WEAPON_TYPE_TO_FILE: Record<WeaponTypeName, string> = {
  "great-sword": "weapons/great-sword.json",
  "long-sword": "weapons/long-sword.json",
  "sword-and-shield": "weapons/sword-and-shield.json",
  "dual-blades": "weapons/dual-blades.json",
  hammer: "weapons/hammer.json",
  "hunting-horn": "weapons/hunting-horn.json",
  lance: "weapons/lance.json",
  gunlance: "weapons/gunlance.json",
  "light-bowgun": "weapons/light-bowgun.json",
  "heavy-bowgun": "weapons/heavy-bowgun.json",
  bow: "weapons/bow.json",
};

/** File path (relative to data/) -> JSON-serializable content matching that file's schema. */
export type EmitOutput = Record<string, unknown>;

function groupWeaponsByType(weapons: EmittedWeapon[]): Map<WeaponTypeName, EmittedWeapon[]> {
  const byType = new Map<WeaponTypeName, EmittedWeapon[]>();
  for (const weapon of weapons) {
    // Null only for a model ID with no Mod2WepType entry — can't route to a
    // file without knowing which one, so it's dropped rather than guessed.
    if (!weapon.type) continue;
    const list = byType.get(weapon.type);
    if (list) list.push(weapon);
    else byType.set(weapon.type, [weapon]);
  }
  return byType;
}

/**
 * Runs every emit/* module against one decrypted EBOOT and returns the full
 * data/*.json-shaped output (equipment only — quest emit is separate, see
 * cli/extract.ts). `resolver` is optional and defaults to JP's static
 * addresses (`tableOffset()`, unchanged pre-existing behavior); pass e.g.
 * `MHP2G_PROFILE.resolverForRegion("eu")` (games/mhp2g.ts) to read the same
 * struct layouts from a different region's EBOOT instead.
 */
export function emitAll(reader: BinaryReader, resolver?: TableAddressResolver): EmitOutput {
  const output: EmitOutput = {};

  output["decorations.json"] = { decorations: emitDecorations(reader, resolver) };

  const armor = emitArmor(reader, resolver);
  for (const slot of ARMOR_SLOTS) {
    output[ARMOR_SLOT_TO_FILE[slot]] = { armor: armor[slot] };
  }

  const weaponsByType = groupWeaponsByType([
    ...emitBlademasterWeapons(reader, resolver),
    ...emitGunnerWeapons(reader, resolver),
  ]);
  for (const type of WEAPON_TYPE_NAMES) {
    output[WEAPON_TYPE_TO_FILE[type]] = { weapons: weaponsByType.get(type) ?? [] };
  }

  return output;
}

/** Writes an emitAll() result to disk, one file per key, creating parent directories as needed. */
export async function writeEmitOutput(outDir: string, output: EmitOutput): Promise<void> {
  for (const [relPath, content] of Object.entries(output)) {
    const absPath = path.join(outDir, relPath);
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, `${JSON.stringify(content, null, 2)}\n`, "utf-8");
  }
}
