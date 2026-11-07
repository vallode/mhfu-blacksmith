/**
 * `export-site` subcommand — converts the model packages the website shows
 * and writes them under `public/models/` with a manifest the site reads.
 *
 *   public/models/monsters/emNN.glb
 *   public/models/weapons/weNNN.glb
 *   public/models/armor/<m|f>_<folder>NNN.glb
 *   public/models/manifest.json
 *
 * The manifest is keyed by the site's own names so the site resolves its own
 * slugs:
 *   monsters: { "<monster name>": "monsters/em01.glb" }
 *   weapons:  { "<weapon type>/<weapon name>": "weapons/we123.glb" }
 *   armor:    { "<slot>/<piece name>[|<sex>]": { "male"?: "...", "female"?: "..." } }
 *
 * Monsters map by game ID: `emmodel/emNN.pac` is `emID[NN]` in the vendored
 * monster.enum, matched to `data/monsters/*.json` by name. Weapons and armor
 * map through the EBOOT: each weapon/armor table entry (indexed by the game's
 * equipment ID, named in data/equipment-ids.json) holds the model ID of its
 * `weapon/weNNN.pac` or `player/<m|f>/<folder>/...pac`. That needs a
 * decrypted `eboot.bin` in the unpacked directory; without one, only
 * monsters are exported.
 *
 * Each run replaces the categories it exported and keeps the others from the
 * previous manifest, so a monsters-only run doesn't drop weapons.
 */
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BinaryReader } from "../binary/reader.js";
import type { Region } from "../container/sfo.js";
import { MHP2G_PROFILE } from "../games/mhp2g.js";
import { buildGlb } from "../models/gltf.js";
import { isPac, readPac } from "../models/pac.js";
import { isPmo, readPmo } from "../models/pmo.js";
import { isTmh, readTmh } from "../models/tmh.js";
import { loadEnums, lookupName } from "../strings/enums.js";
import { armorModelPath, readArmorModelIds, type SiteArmorSlot } from "../tables/armor-models.js";
import { readBlademasterWeapons, readGunnerWeapons } from "../tables/weapons.js";
import type { UnpackManifest } from "./unpack.js";

export interface ExportSiteOptions {
  /** An `unpack` output directory (containing `data-bin/`, and `eboot.bin` for weapons/armor). */
  unpacked: string;
  /** The repository's `data/` directory. */
  data: string;
  /** Output directory, normally the repository's `public/models/`. */
  out: string;
}

export interface ArmorModelFiles {
  male?: string;
  female?: string;
}

export interface SiteModelManifest {
  monsters: Record<string, string>;
  weapons: Record<string, string>;
  armor: Record<string, ArmorModelFiles>;
}

/** monster.enum names that differ from the site's names. */
const MONSTER_NAME_ALIASES: Record<string, string> = {
  "One-Ear Yian Garuga": "Scarred Yian Garuga",
  "Terra Shogun Ceanatur": "Terra Shogun Ceanataur",
};

type EquipmentIds = Record<string, ({ name: string; type?: string; sex?: string } | null)[]>;

/** Convert the first PMO + TMH in a package to GLB bytes, or null when it has no mesh. */
function packageToGlb(buf: Buffer, name: string): Buffer | null {
  if (!isPac(buf)) return null;
  const entries = readPac(buf);
  const pmoEntry = entries.find((entry) => isPmo(entry.data));
  if (!pmoEntry) return null;
  const tmhEntry = entries.find((entry) => isTmh(entry.data));
  return buildGlb(readPmo(pmoEntry.data), tmhEntry ? readTmh(tmhEntry.data) : [], name).glb;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** Converts each DATA.BIN package at most once, caching the result path (or null). */
class Converter {
  private readonly done = new Map<string, string | null>();
  /** Packages referenced by the game data but absent from the unpacked directory (e.g. a partial dump). */
  missing = 0;
  constructor(
    private readonly dataBin: string,
    private readonly out: string
  ) {}

  async convert(source: string, relativeOut: string): Promise<string | null> {
    const cached = this.done.get(source);
    if (cached !== undefined) return cached;
    let result: string | null = null;
    if (!(await exists(path.join(this.dataBin, source)))) {
      this.missing++;
      this.done.set(source, null);
      return null;
    }
    try {
      const glb = packageToGlb(await readFile(path.join(this.dataBin, source)), source);
      if (glb) {
        await mkdir(path.dirname(path.join(this.out, relativeOut)), { recursive: true });
        await writeFile(path.join(this.out, relativeOut), glb);
        result = relativeOut;
      } else {
        console.log(`skip ${source}: no mesh`);
      }
    } catch (err) {
      console.log(`skip ${source}: ${err instanceof Error ? err.message : String(err)}`);
    }
    this.done.set(source, result);
    return result;
  }
}

async function siteMonsterNames(dataDir: string): Promise<Set<string>> {
  const names = new Set<string>();
  const dir = path.join(dataDir, "monsters");
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
    const { monsters } = JSON.parse(await readFile(path.join(dir, file), "utf-8")) as { monsters: { name: string }[] };
    for (const monster of monsters) names.add(monster.name);
  }
  return names;
}

async function exportMonsters(options: ExportSiteOptions, converter: Converter): Promise<Record<string, string>> {
  const enums = loadEnums();
  const siteNames = await siteMonsterNames(options.data);
  const monsters: Record<string, string> = {};
  const emDir = path.join(options.unpacked, "data-bin", "emmodel");
  if (!(await exists(emDir))) return monsters;
  const files = (await readdir(emDir)).filter((f) => /^em\d+\.pac$/.test(f)).sort();
  for (const file of files) {
    const id = Number.parseInt(file.slice(2), 10);
    const gameName = lookupName(enums, "emID", id);
    const siteName = gameName ? (MONSTER_NAME_ALIASES[gameName] ?? gameName) : null;
    if (!siteName || !siteNames.has(siteName)) {
      console.log(`skip ${file}: ${gameName ?? "unnamed"} has no monster page`);
      continue;
    }
    if (monsters[siteName]) continue; // duplicate emID name (e.g. Yama Tsukami)
    const relative = await converter.convert(`emmodel/${file}`, `monsters/${file.replace(/\.pac$/, ".glb")}`);
    if (relative) monsters[siteName] = relative;
  }
  console.log(`monsters: ${Object.keys(monsters).length}`);
  return monsters;
}

async function exportWeapons(reader: BinaryReader, region: Region, ids: EquipmentIds, converter: Converter): Promise<Record<string, string>> {
  const resolver = MHP2G_PROFILE.resolverForRegion(region) ?? undefined;
  const weapons: Record<string, string> = {};
  const tables = [
    ["melee", readBlademasterWeapons(reader, resolver)],
    ["ranged", readGunnerWeapons(reader, resolver)],
  ] as const;
  for (const [list, entries] of tables) {
    for (const entry of entries) {
      const page = ids[list]?.[entry.index];
      if (!page?.type) continue;
      const id = String(entry.modelId).padStart(3, "0");
      const relative = await converter.convert(`weapon/we${id}.pac`, `weapons/we${id}.glb`);
      if (relative) weapons[`${page.type}/${page.name}`] = relative;
    }
  }
  console.log(`weapons: ${Object.keys(weapons).length}`);
  return weapons;
}

async function exportArmor(reader: BinaryReader, region: Region, ids: EquipmentIds, converter: Converter): Promise<Record<string, ArmorModelFiles>> {
  const resolver = MHP2G_PROFILE.resolverForRegion(region) ?? undefined;
  const armor: Record<string, ArmorModelFiles> = {};
  for (const [slot, entries] of Object.entries(readArmorModelIds(reader, resolver)) as [SiteArmorSlot, { index: number; maleId: number; femaleId: number }[]][]) {
    for (const entry of entries) {
      const page = ids[slot]?.[entry.index];
      if (!page) continue;
      const files: ArmorModelFiles = {};
      // Model 0 is the empty slot (e.g. piercings and other helmets with no mesh).
      for (const [sex, id] of [["m", entry.maleId], ["f", entry.femaleId]] as const) {
        if (id === 0) continue;
        const source = armorModelPath(slot, sex, id);
        const relative = await converter.convert(source, `armor/${path.basename(source, ".pac")}.glb`);
        if (relative) files[sex === "m" ? "male" : "female"] = relative;
      }
      if (files.male || files.female) armor[`${slot}/${page.name}${page.sex ? `|${page.sex}` : ""}`] = files;
    }
  }
  console.log(`armor: ${Object.keys(armor).length}`);
  return armor;
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

export async function runExportSite(options: ExportSiteOptions): Promise<SiteModelManifest> {
  const manifestPath = path.join(options.out, "manifest.json");
  let previous: Partial<SiteModelManifest> = {};
  try {
    previous = JSON.parse(await readFile(manifestPath, "utf-8")) as Partial<SiteModelManifest>;
  } catch {
    // no previous manifest
  }

  const converter = new Converter(path.join(options.unpacked, "data-bin"), options.out);
  const manifest: SiteModelManifest = {
    monsters: previous.monsters ?? {},
    weapons: previous.weapons ?? {},
    armor: previous.armor ?? {},
  };

  const monsters = await exportMonsters(options, converter);
  if (Object.keys(monsters).length) manifest.monsters = monsters;

  const ebootPath = path.join(options.unpacked, "eboot.bin");
  if (await exists(ebootPath)) {
    const unpackManifest = JSON.parse(await readFile(path.join(options.unpacked, "manifest.json"), "utf-8")) as UnpackManifest;
    const reader = new BinaryReader(await readFile(ebootPath));
    const ids = JSON.parse(await readFile(path.join(options.data, "equipment-ids.json"), "utf-8")) as EquipmentIds;
    if (await exists(path.join(options.unpacked, "data-bin", "weapon"))) {
      manifest.weapons = await exportWeapons(reader, unpackManifest.region, ids, converter);
    }
    if (await exists(path.join(options.unpacked, "data-bin", "player"))) {
      manifest.armor = await exportArmor(reader, unpackManifest.region, ids, converter);
    }
  } else {
    console.log("No eboot.bin in the unpacked directory: weapons and armor need it, keeping their previous entries.");
  }

  if (converter.missing) console.log(`${converter.missing} referenced packages were missing from the unpacked directory.`);
  const sorted: SiteModelManifest = {
    monsters: sortRecord(manifest.monsters),
    weapons: sortRecord(manifest.weapons),
    armor: sortRecord(manifest.armor),
  };
  await writeFile(manifestPath, `${JSON.stringify(sorted)}\n`);
  return sorted;
}
