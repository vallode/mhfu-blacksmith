/**
 * `export-site` subcommand — converts the model packages the website shows
 * and writes them under `public/models/` with a manifest the site reads.
 *
 *   public/models/monsters/emNN.glb            (skinned to its skeleton)
 *   public/models/monsters/emNN.motions.bin    (its motions; see packageToGlb)
 *   public/models/weapons/weNNN.glb
 *   public/models/armor/<m|f>_<folder>NNN.glb
 *
 * and a manifest split by category, so a page only fetches its own list:
 *   public/models/manifest/monsters.json         { "<monster name>": NN }
 *   public/models/manifest/weapons/<type>.json   { "<weapon name>": NNN }
 *   public/models/manifest/armor/<slot>.json     { "<piece name>[|<sex>]": [maleNNN, femaleNNN] }
 * Values are model IDs (0 = none); the site rebuilds the file paths from
 * them (src/lib/models.ts). Keys are the site's own names.
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
 *
 * Next to each monster's model goes its hitboxes, `monsters/emNN.hitboxes.json`
 * (`monsters/hitboxes.ts`): the collision capsules from `game_task.ovl` or the
 * monster's `overlay/emNN.ovl`, placed with the package's skeleton. The site
 * fetches it by the model's path; a monster whose hitboxes can't be read has
 * none, and the reason is logged.
 *
 * `public/models/hunter/` holds the hunter shown holding a weapon: `hunter.glb`
 * (the default armor set on the player's skeleton, `models/hunter.ts`), one
 * `wNN.motions.bin` per weapon class and `common.motions.bin`, the common
 * motions the site uses (motion-pack.ts). Weapons are written in `part_<n>`
 * pieces (a shield, a second blade) so the site can carry them apart.
 */
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { BinaryReader } from "../binary/reader.js";
import type { Region } from "../container/sfo.js";
import { MHP2G_PROFILE } from "../games/mhp2g.js";
import { buildPlayerClips, PLAYER_GROUP_SLOTS, type ClipOptions } from "../models/animation.js";
import { isAhi, readAhi, type Bone } from "../models/ahi.js";
import { skeletonFor } from "../models/attach.js";
import { buildGlb, type GlbOptions, type GlbPartOf } from "../models/gltf.js";
import { boneRoots, composeHunter, readHunterPiece, type HunterSlot } from "../models/hunter.js";
import { packMotions } from "../models/motion-pack.js";
import { readMotionBank } from "../models/motion.js";
import { packageModel } from "../models/rig.js";
import { isPac, readPac, type PacEntry } from "../models/pac.js";
import { isPmo, type Pmo } from "../models/pmo.js";
import { isTmh, readTmh } from "../models/tmh.js";
import {
  poseWeapon,
  SHEATHED_TARGET,
  WEAPON_POSES,
  type WeaponPoses,
} from "../models/weapon-pose.js";
import { parseOvl, type OvlFile } from "../container/ovl.js";
import { readMonsterCollision } from "../monsters/collision.js";
import { buildSiteHitboxes, jointPositions } from "../monsters/hitboxes.js";
import { locateMonsterChunks } from "../monsters/hitzones.js";
import { OVERLAY_DIR } from "../monsters/overlays.js";
import { MONSTER_OVERLAY } from "../overlay/monsters.js";
import { loadEnums, lookupName } from "../strings/enums.js";
import { armorModelPath, readArmorModelIds, type SiteArmorSlot } from "../tables/armor-models.js";
import { readBlademasterWeapons, readGunnerWeapons } from "../tables/weapons.js";
import { assertCurrentFileNames, type UnpackManifest } from "./unpack.js";

export interface ExportSiteOptions {
  /** An `unpack` output directory (containing `data-bin/`, and `eboot.bin` for weapons/armor). */
  unpacked: string;
  /** The repository's `data/` directory. */
  data: string;
  /** Output directory, normally the site's `apps/blacksmith/public/models/`. */
  out: string;
  /** Skip the lossy size reductions in SITE_GLB_OPTIONS. */
  lossless?: boolean;
}

/**
 * Lossy settings for the site, chosen to be visually indistinguishable while
 * saving ~3.5% over lossless on top of everything gltf.ts does losslessly:
 * textures re-quantized to libimagequant quality 80 (>= 40 dB PSNR on every
 * texture tested), positions rounded to 12 bits (<= 1/4096 of a model's
 * extent) and UVs to 11 bits per repeat (<= 1/32 texel on a 64px texture).
 */
export const SITE_GLB_OPTIONS: GlbOptions = { textureQuality: 80, positionBits: 12, uvBits: 11 };

/**
 * Lossy key reduction for the site's monster motions: keys go where linear
 * interpolation would be off by more than half a degree or 0.1 model units
 * (a Kelbi is ~180 units long). About half the keys of the lossless default.
 */
export const SITE_CLIP_OPTIONS: ClipOptions = {
  rotationTolerance: 0.0087,
  translationTolerance: 0.1,
};

/** Model IDs keyed by the site's names; see the module comment for the files they become. */
export interface SiteModelManifest {
  monsters: Record<string, number>;
  /** weapon type -> weapon name -> model ID */
  weapons: Record<string, Record<string, number>>;
  /** armor slot -> "name" or "name|Sex" -> [male model ID, female model ID], 0 = none */
  armor: Record<string, Record<string, [number, number]>>;
}

/** monster.enum names that differ from the site's names. */
const MONSTER_NAME_ALIASES: Record<string, string> = {
  "One-Ear Yian Garuga": "Scarred Yian Garuga",
  "Terra Shogun Ceanatur": "Terra Shogun Ceanataur",
};

type EquipmentIds = Record<string, ({ name: string; type?: string; sex?: string } | null)[]>;

/**
 * Convert the first PMO + TMH in a package to GLB bytes, or null when it has
 * no mesh. A severable tail tip is put back on (attach.ts). A monster's mesh
 * is skinned, and its motions come back apart, packed (motion-pack.ts), so a
 * page can show the model before fetching them; `motionsFile` names the file
 * the GLB should point at for them (monsters with the same motions share one).
 * A weapon's bones are posed as the game has them drawn, with the sheathed
 * pose as a morph target (`pose`, weapon-pose.ts).
 */
async function packageToGlb(
  buf: Buffer,
  name: string,
  options: GlbOptions,
  clipOptions: ClipOptions,
  motionsFile: (motions: Buffer) => string,
  pose?: WeaponPoses,
): Promise<{ glb: Buffer; motions?: Buffer } | null> {
  if (!isPac(buf)) return null;
  const entries = readPac(buf);
  const pmoEntry = entries.find((entry) => isPmo(entry.data));
  if (!pmoEntry) return null;
  const tmhEntry = entries.find((entry) => isTmh(entry.data));
  const model = packageModel(entries, pmoEntry.index, clipOptions);
  const { rig } = model;
  // An unrigged model's skeleton still splits it into pieces and poses it.
  const bones = rig ? undefined : weaponSkeleton(entries, pmoEntry.index);
  const { pmo, sheathed } = pose && bones ? poseWeapon(model.pmo, bones, pose) : { pmo: model.pmo };
  const textures = tmhEntry ? readTmh(tmhEntry.data) : [];
  const motions = rig?.clips?.length ? packMotions(rig.clips) : undefined;
  const { glb } = await buildGlb(
    pmo,
    textures,
    name,
    rig
      ? options
      : {
          ...options,
          partOf: bones && partsByRoot(bones, pmo),
          ...(sheathed ? { targets: [{ name: SHEATHED_TARGET, pmo: sheathed }] } : {}),
        },
    rig && { bones: rig.bones, motionsFile: motions && motionsFile(motions) },
  );
  return { glb, motions };
}

/** A weapon's skeleton: the first `.ahi` after its mesh, if it parses. */
function weaponSkeleton(entries: PacEntry[], pmoIndex: number): Bone[] | undefined {
  const ahi = entries.slice(pmoIndex + 1).find((entry) => isAhi(entry.data));
  if (!ahi) return undefined;
  try {
    return readAhi(ahi.data);
  } catch {
    return undefined;
  }
}

/**
 * A weapon's pieces: a primitive belongs to the root of its most-weighted
 * bone, in the skeleton that follows the mesh (`weaponSkeleton`, see
 * `boneRoots`). Undefined for a model with one root, which is all but the
 * two-piece weapons.
 */
function partsByRoot(bones: Bone[], pmo: Pmo): GlbPartOf | undefined {
  const roots = boneRoots(bones);
  if (Math.max(...roots) === 0) return undefined;
  return (mesh, primitive) => {
    const { bones: palette, geometry } = pmo.meshes[mesh]!.primitives[primitive]!;
    const weight = new Map<number, number>();
    for (const vertex of geometry.vertices)
      vertex.weights?.forEach((w, slot) => {
        const bone = palette[slot] ?? -1;
        if (bone >= 0) weight.set(bone, (weight.get(bone) ?? 0) + w);
      });
    const main = [...weight].sort((a, b) => b[1] - a[1])[0]?.[0];
    return main === undefined ? 0 : (roots[main] ?? 0);
  };
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** The armor the hunter wears: the model of each slot's piece of this name, by data name. */
const HUNTER_ARMOR: Record<HunterSlot, string> = {
  helmet: "Battle Helm",
  plate: "Battle Mail",
  gauntlets: "Battle Vambraces",
  waist: "Battle Tasset",
  leggings: "Battle Greaves",
};
/** Weapon classes (`motion/wNN_tbl.bin`, by `WEAPON_TYPE_NAMES` index). */
const WEAPON_CLASS_COUNT = 11;
/** Slots of `motion/plcom_tbl.bin` the site plays: group 0's standing idle (weapon away). */
const COMMON_MOTION_SLOTS = new Set([0 * PLAYER_GROUP_SLOTS + 1]);

async function exportHunter(
  reader: BinaryReader,
  region: Region,
  ids: EquipmentIds,
  options: ExportSiteOptions,
): Promise<void> {
  const dataBin = path.join(options.unpacked, "data-bin");
  const models = readArmorModelIds(reader, MHP2G_PROFILE.resolverForRegion(region) ?? undefined);
  const pieces = await Promise.all(
    (Object.entries(HUNTER_ARMOR) as [HunterSlot, string][]).map(async ([slot, name]) => {
      const entry = models[slot].find((e) => ids[slot]?.[e.index]?.name === name);
      if (!entry) throw new Error(`Default armor piece not found: ${name}`);
      const source = path.join(dataBin, armorModelPath(slot, "m", entry.maleId));
      return readHunterPiece(slot, readPac(await readFile(source)));
    }),
  );
  const { pmo, textures, bones } = composeHunter(pieces);
  const clipOptions = options.lossless ? {} : SITE_CLIP_OPTIONS;
  const dir = path.join(options.out, "hunter");
  await mkdir(dir, { recursive: true });
  const { glb } = await buildGlb(
    pmo,
    textures,
    "hunter",
    options.lossless ? {} : SITE_GLB_OPTIONS,
    { bones },
  );
  await writeFile(path.join(dir, "hunter.glb"), glb);

  let size = glb.length;
  const writeClips = async (file: string, clips: ReturnType<typeof buildPlayerClips>) => {
    const pack = packMotions(clips);
    size += pack.length;
    await writeFile(path.join(dir, file), pack);
  };
  const bank = async (name: string) =>
    readMotionBank(await readFile(path.join(dataBin, "motion", `${name}_tbl.bin`)));
  await writeClips(
    "common.motions.bin",
    buildPlayerClips(bones, await bank("plcom"), clipOptions).filter((clip) =>
      COMMON_MOTION_SLOTS.has(clip.slot),
    ),
  );
  for (let weaponClass = 0; weaponClass < WEAPON_CLASS_COUNT; weaponClass++) {
    const name = `w${String(weaponClass).padStart(2, "0")}`;
    await writeClips(`${name}.motions.bin`, buildPlayerClips(bones, await bank(name), clipOptions));
  }
  console.log(`hunter: ${(size / 1024).toFixed(0)} KB`);
}

/** Converts each DATA.BIN package at most once, caching the result path (or null). */
class Converter {
  private readonly done = new Map<string, string | null>();
  /** Motion files written, by content: monsters with the same motions share the first's. */
  private readonly motionFiles = new Map<string, string>();
  /** Packages referenced by the game data but absent from the unpacked directory (e.g. a partial dump). */
  missing = 0;
  constructor(
    private readonly dataBin: string,
    private readonly out: string,
    private readonly options: GlbOptions,
    private readonly clipOptions: ClipOptions,
  ) {}

  async convert(source: string, relativeOut: string, pose?: WeaponPoses): Promise<string | null> {
    const cached = this.done.get(source);
    if (cached !== undefined) return cached;
    let result: string | null = null;
    if (!(await exists(path.join(this.dataBin, source)))) {
      this.missing++;
      this.done.set(source, null);
      return null;
    }
    try {
      const file = path.join(this.out, relativeOut);
      // Own motions sit next to the model (emNN.glb -> emNN.motions.bin).
      const ownMotions = path.basename(file).replace(/\.glb$/, ".motions.bin");
      let motionsKey: string | undefined;
      let shared = false;
      const converted = await packageToGlb(
        await readFile(path.join(this.dataBin, source)),
        source,
        this.options,
        this.clipOptions,
        (motions) => {
          motionsKey = createHash("sha256").update(motions).digest("hex");
          const existing = this.motionFiles.get(motionsKey);
          shared = existing !== undefined;
          return existing ?? ownMotions;
        },
        pose,
      );
      if (converted) {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, converted.glb);
        // A model that shares another's motions, or has none, loses a stale file.
        const motionsPath = path.join(path.dirname(file), ownMotions);
        if (converted.motions && !shared) {
          await writeFile(motionsPath, converted.motions);
          // Only now can others share it: a conversion that failed wrote nothing.
          if (motionsKey) this.motionFiles.set(motionsKey, ownMotions);
        } else await rm(motionsPath, { force: true });
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
    const { monsters } = JSON.parse(await readFile(path.join(dir, file), "utf-8")) as {
      monsters: { name: string }[];
    };
    for (const monster of monsters) names.add(monster.name);
  }
  return names;
}

/** What monster hitboxes are read from: `game_task.ovl`, its chunk array and every `emNN.ovl`. */
interface CollisionSource {
  gameTask: OvlFile;
  chunksOffset: number;
  emOvls: Map<number, OvlFile>;
}

async function loadCollisionSource(unpacked: string): Promise<CollisionSource | null> {
  const overlayDir = path.join(unpacked, OVERLAY_DIR);
  const gameTaskPath = path.join(overlayDir, "game_task.ovl");
  if (!(await exists(gameTaskPath))) {
    console.log("No overlay/game_task.ovl: skipping monster hitboxes.");
    return null;
  }
  const gameTask = parseOvl(await readFile(gameTaskPath));
  const chunks = locateMonsterChunks(gameTask);
  if (!chunks) {
    console.log("game_task.ovl: monster chunk array not found, skipping monster hitboxes.");
    return null;
  }
  const emOvls = new Map<number, OvlFile>();
  for (const name of await readdir(overlayDir)) {
    const match = /^em(\d+)\.ovl$/.exec(name);
    if (!match) continue;
    try {
      emOvls.set(Number(match[1]), parseOvl(await readFile(path.join(overlayDir, name))));
    } catch (err) {
      console.log(`skip overlay/${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { gameTask, chunksOffset: chunks.offset, emOvls };
}

/**
 * Writes `monsters/emNN.hitboxes.json` for one exported monster, or removes
 * a stale one and logs why there is none.
 */
async function exportHitboxes(
  source: CollisionSource,
  pacPath: string,
  emId: number,
  siteName: string,
  out: string,
): Promise<boolean> {
  const file = path.join(out, "monsters", `em${String(emId).padStart(2, "0")}.hitboxes.json`);
  const fail = async (reason: string) => {
    console.log(`no hitboxes for ${siteName}: ${reason}`);
    await rm(file, { force: true });
    return false;
  };
  try {
    const pac = await readFile(pacPath);
    const entries = isPac(pac) ? readPac(pac) : [];
    const pmoEntry = entries.find((entry) => isPmo(entry.data));
    // The skeleton the model's mesh (the first PMO) is bound to.
    const bones = pmoEntry ? skeletonFor(entries, pmoEntry.index) : [];
    if (bones.length === 0) return await fail("no skeleton in the model package");
    const collision = readMonsterCollision(
      source.gameTask,
      source.chunksOffset,
      emId,
      source.emOvls,
      bones.length,
    );
    if ("error" in collision) return await fail(collision.error);
    if (collision.borrowedFrom !== undefined)
      console.log(
        `${siteName} hitboxes: table from em${String(collision.borrowedFrom).padStart(2, "0")}.ovl`,
      );
    const slots = MONSTER_OVERLAY.find((m) => m.id === emId)?.hitzones;
    const { hitboxes, skipped } = buildSiteHitboxes(
      collision.records,
      jointPositions(bones),
      slots,
    );
    for (const reason of skipped) console.log(`${siteName} hitboxes: skipped ${reason}`);
    if (hitboxes.capsules.length === 0) return await fail("no usable collision records");
    await writeFile(file, `${JSON.stringify(hitboxes)}\n`);
    return true;
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

async function exportMonsters(
  options: ExportSiteOptions,
  converter: Converter,
): Promise<Record<string, number>> {
  const enums = loadEnums();
  const siteNames = await siteMonsterNames(options.data);
  const monsters: Record<string, number> = {};
  const emDir = path.join(options.unpacked, "data-bin", "emmodel");
  if (!(await exists(emDir))) return monsters;
  const files = (await readdir(emDir)).filter((f) => /^em\d+\.pac$/.test(f)).sort();
  const collision = await loadCollisionSource(options.unpacked);
  let hitboxCount = 0;
  for (const file of files) {
    const id = Number.parseInt(file.slice(2), 10);
    const gameName = lookupName(enums, "emID", id);
    const siteName = gameName ? (MONSTER_NAME_ALIASES[gameName] ?? gameName) : null;
    if (!siteName || !siteNames.has(siteName)) {
      console.log(`skip ${file}: ${gameName ?? "unnamed"} has no monster page`);
      continue;
    }
    if (monsters[siteName]) continue; // duplicate emID name (e.g. Yama Tsukami)
    const relative = await converter.convert(
      `emmodel/${file}`,
      `monsters/${file.replace(/\.pac$/, ".glb")}`,
    );
    if (!relative) continue;
    monsters[siteName] = id;
    if (
      collision &&
      (await exportHitboxes(collision, path.join(emDir, file), id, siteName, options.out))
    )
      hitboxCount++;
  }
  console.log(`monsters: ${Object.keys(monsters).length}, with hitboxes: ${hitboxCount}`);
  return monsters;
}

async function exportWeapons(
  reader: BinaryReader,
  region: Region,
  ids: EquipmentIds,
  converter: Converter,
): Promise<SiteModelManifest["weapons"]> {
  const resolver = MHP2G_PROFILE.resolverForRegion(region) ?? undefined;
  const weapons: SiteModelManifest["weapons"] = {};
  let count = 0;
  const tables = [
    ["melee", readBlademasterWeapons(reader, resolver)],
    ["ranged", readGunnerWeapons(reader, resolver)],
  ] as const;
  for (const [list, entries] of tables) {
    for (const entry of entries) {
      const page = ids[list]?.[entry.index];
      if (!page?.type) continue;
      const id = String(entry.modelId).padStart(3, "0");
      const relative = await converter.convert(
        `weapon/we${id}.pac`,
        `weapons/we${id}.glb`,
        WEAPON_POSES[page.type as keyof typeof WEAPON_POSES],
      );
      if (relative) {
        (weapons[page.type] ??= {})[page.name] = entry.modelId;
        count++;
      }
    }
  }
  console.log(`weapons: ${count}`);
  return weapons;
}

async function exportArmor(
  reader: BinaryReader,
  region: Region,
  ids: EquipmentIds,
  converter: Converter,
): Promise<SiteModelManifest["armor"]> {
  const resolver = MHP2G_PROFILE.resolverForRegion(region) ?? undefined;
  const armor: SiteModelManifest["armor"] = {};
  let count = 0;
  for (const [slot, entries] of Object.entries(readArmorModelIds(reader, resolver)) as [
    SiteArmorSlot,
    { index: number; maleId: number; femaleId: number }[],
  ][]) {
    for (const entry of entries) {
      const page = ids[slot]?.[entry.index];
      if (!page) continue;
      const models: [number, number] = [0, 0];
      // Model 0 is the empty slot (e.g. piercings and other helmets with no mesh).
      for (const [i, sex, id] of [
        [0, "m", entry.maleId],
        [1, "f", entry.femaleId],
      ] as const) {
        if (id === 0) continue;
        const source = armorModelPath(slot, sex, id);
        if (await converter.convert(source, `armor/${path.basename(source, ".pac")}.glb`))
          models[i] = id;
      }
      if (models[0] || models[1]) {
        (armor[slot] ??= {})[`${page.name}${page.sex ? `|${page.sex}` : ""}`] = models;
        count++;
      }
    }
  }
  console.log(`armor: ${count}`);
  return armor;
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

/** Read a manifest written by writeManifest (missing parts come back empty). */
async function readManifest(dir: string): Promise<Partial<SiteModelManifest>> {
  const manifest: Partial<SiteModelManifest> = {};
  const monsters = await readJson<Record<string, number>>(path.join(dir, "monsters.json"));
  if (monsters) manifest.monsters = monsters;
  for (const category of ["weapons", "armor"] as const) {
    const files = await readdir(path.join(dir, category)).catch(() => [] as string[]);
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const content = await readJson<Record<string, never>>(path.join(dir, category, file));
      if (content) (manifest[category] ??= {})[file.replace(/\.json$/, "")] = content;
    }
  }
  return manifest;
}

async function writeManifest(dir: string, manifest: SiteModelManifest): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(path.join(dir, "weapons"), { recursive: true });
  await mkdir(path.join(dir, "armor"), { recursive: true });
  const write = (file: string, record: Record<string, unknown>) =>
    writeFile(path.join(dir, file), `${JSON.stringify(sortRecord(record))}\n`);
  await write("monsters.json", manifest.monsters);
  for (const [type, weapons] of Object.entries(manifest.weapons))
    await write(`weapons/${type}.json`, weapons);
  for (const [slot, pieces] of Object.entries(manifest.armor))
    await write(`armor/${slot}.json`, pieces);
}

export async function runExportSite(options: ExportSiteOptions): Promise<SiteModelManifest> {
  const unpackManifest = JSON.parse(
    await readFile(path.join(options.unpacked, "manifest.json"), "utf-8"),
  ) as UnpackManifest;
  assertCurrentFileNames(unpackManifest, options.unpacked);
  const manifestDir = path.join(options.out, "manifest");
  const previous = await readManifest(manifestDir);
  await rm(path.join(options.out, "manifest.json"), { force: true }); // the old single-file manifest

  const converter = new Converter(
    path.join(options.unpacked, "data-bin"),
    options.out,
    options.lossless ? {} : SITE_GLB_OPTIONS,
    options.lossless ? {} : SITE_CLIP_OPTIONS,
  );
  const manifest: SiteModelManifest = {
    monsters: previous.monsters ?? {},
    weapons: previous.weapons ?? {},
    armor: previous.armor ?? {},
  };

  const monsters = await exportMonsters(options, converter);
  if (Object.keys(monsters).length) manifest.monsters = monsters;

  const ebootPath = path.join(options.unpacked, "eboot.bin");
  if (await exists(ebootPath)) {
    const reader = new BinaryReader(await readFile(ebootPath));
    const ids = JSON.parse(
      await readFile(path.join(options.data, "equipment-ids.json"), "utf-8"),
    ) as EquipmentIds;
    if (await exists(path.join(options.unpacked, "data-bin", "weapon"))) {
      manifest.weapons = await exportWeapons(reader, unpackManifest.region, ids, converter);
    }
    if (await exists(path.join(options.unpacked, "data-bin", "player"))) {
      manifest.armor = await exportArmor(reader, unpackManifest.region, ids, converter);
      await exportHunter(reader, unpackManifest.region, ids, options).catch((err: unknown) => {
        console.log(`no hunter: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
  } else {
    console.log(
      "No eboot.bin in the unpacked directory: weapons and armor need it, keeping their previous entries.",
    );
  }

  if (converter.missing)
    console.log(
      `${converter.missing} referenced packages were missing from the unpacked directory.`,
    );
  await writeManifest(manifestDir, manifest);
  return manifest;
}
