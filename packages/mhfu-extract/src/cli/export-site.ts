/**
 * `export-site` subcommand — converts the model packages the website shows
 * and writes them under `public/models/` with a manifest the site reads.
 *
 *   public/models/monsters/emNN.glb            (skinned to its skeleton)
 *   public/models/monsters/emNN.motions.bin    (its motions; see packageToGlb)
 *   public/models/weapons/weNNN.glb
 *   public/models/armor/<m|f>_<folder>NNN.glb   (placed on the player's skeleton)
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
 * equipment ID, named in game-data's equipment-ids.json view) holds the model ID of its
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
 * With a decrypted `eboot.bin` from the EU disc, each monster also gets
 * `monsters/emNN.attacks.json` (`monsters/attacks.ts`): the attack capsules
 * its motions make, with the frames they can hit in, found by running the
 * game's spawner code. Other discs' addresses aren't known, so they get none.
 * Likewise `monsters/emNN.unused-motions.json` (`monsters/motion-use.ts`):
 * the motions in its bank that none of its code plays.
 *
 * `public/models/hunter/` holds the hunter shown holding a weapon or wearing
 * armor: `hunter.glb` (the default armor set and face on the player's
 * skeleton, `models/hunter.ts` and `models/look.ts`), which holds weapons;
 * `hunter-bare.glb` and `hunter-bare-female.glb` (each sex in the clothes
 * worn under armor, with the default face and hairstyle, on that sex's
 * skeleton), which the site dresses in armor; one
 * `wNN.motions.bin` per weapon class and `common.motions.bin`, the common
 * motions the site uses (motion-pack.ts); and the pieces of a hunter's look
 * the site's look picker dresses the bare hunters in (`exportLook`).
 * Weapons are written in `part_<n>`
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
import {
  boneRoots,
  composeHunter,
  HUNTER_ARMOR,
  type ArmorSlot,
  MISSING_TEXTURE,
  PLAYER_BONE_COUNT,
  readHunterPiece,
  type HunterModel,
  type HunterSlot,
} from "../models/hunter.js";
import { packMotions } from "../models/motion-pack.js";
import { readMotionBank } from "../models/motion.js";
import { packageModel } from "../models/rig.js";
import { spawnHidden, withoutHidden } from "../models/spawn-parts.js";
import { wearProps } from "../models/worn-props.js";
import { isPac, readPac, type PacEntry } from "../models/pac.js";
import { isPmo, type Pmo } from "../models/pmo.js";
import { missingTextures, SKIN_TONES, skinTexturePath, withSkin } from "../models/skin.js";
import {
  CLOTHING_MODELS,
  type ClothingSlot,
  dyeHair,
  FACE_MASKS,
  FACE_PART,
  FACE_SKIN_TONES,
  facePath,
  HAIR_MATERIAL,
  HAIR_PART,
  hairstylePath,
  HUNTER_FACE,
  HUNTER_HAIR_COLOR,
  HUNTER_HAIRSTYLE,
  maskFace,
} from "../models/look.js";
import { encodePng } from "../models/png.js";
import { isTmh, readTmh, type TmhImage } from "../models/tmh.js";
import {
  poseWeapon,
  SHEATHED_TARGET,
  weaponPoses,
  type WeaponPoses,
} from "../models/weapon-pose.js";
import { isElf } from "../container/eboot.js";
import { parseOvl, type OvlFile } from "../container/ovl.js";
import {
  buildSiteAttacks,
  ebootImage,
  ovlImage,
  sweepMonsterAttacks,
  type ImageSegment,
} from "../monsters/attacks.js";
import { findMotionUse } from "../monsters/motion-use.js";
import { readMonsterCollision } from "../monsters/collision.js";
import { familyOverlayId } from "../monsters/families.js";
import { buildSiteHitboxes, jointPositions } from "../monsters/hitboxes.js";
import { locateMonsterChunks } from "../monsters/hitzones.js";
import { OVERLAY_DIR } from "../monsters/overlays.js";
import { MONSTER_OVERLAY } from "../overlay/monsters.js";
import { armorModelPath, readArmorModelIds, type SiteArmorSlot } from "../tables/armor-models.js";
import {
  readBlademasterWeapons,
  readGunnerWeapons,
  type WeaponTypeName,
} from "../tables/weapons.js";
import { assertCurrentFileNames, type UnpackManifest } from "./unpack.js";
import { readData, readRawData, readStringsDoc } from "game-data";

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

type EquipmentIds = Record<string, ({ name: string; type?: string; sex?: string } | null)[]>;

/**
 * Convert the first PMO + TMH in a package to GLB bytes, or null when it has
 * no mesh. A severable tail tip is put back on (attach.ts). A monster's mesh
 * is skinned, and its motions come back apart, packed (motion-pack.ts), so a
 * page can show the model before fetching them; `motionsFile` names the file
 * the GLB should point at for them (monsters with the same motions share one).
 * A weapon's bones are posed as the game has them drawn, with the sheathed
 * pose as a morph target (`pose`, weapon-pose.ts). An armor piece's `skin`
 * textures go after its own (skin.ts). `missing` lists the texture indices
 * its materials use that have no image.
 */
async function packageToGlb(
  buf: Buffer,
  name: string,
  options: GlbOptions,
  clipOptions: ClipOptions,
  motionsFile: (motions: Buffer) => string,
  pose?: WeaponPoses,
  skin: readonly TmhImage[] = [],
): Promise<{ glb: Buffer; motions?: Buffer; slots?: number[]; missing: number[] } | null> {
  if (!isPac(buf)) return null;
  const entries = readPac(buf);
  const pmoEntry = entries.find((entry) => isPmo(entry.data));
  if (!pmoEntry) return null;
  const tmhEntry = entries.find((entry) => isTmh(entry.data));
  const model = packageModel(entries, pmoEntry.index, clipOptions);
  const { rig } = model;
  let textures = withSkin(tmhEntry ? readTmh(tmhEntry.data) : [], skin);
  if (name.startsWith("emmodel/")) {
    const pac = path.basename(name, ".pac");
    // A monster is shown as it spawns: no broken parts, stump caps or rage
    // layers. A table that doesn't fit the model leaves every part drawn.
    try {
      model.pmo = withoutHidden(model.pmo, spawnHidden(pac));
    } catch (err) {
      console.log(`${name}: ${err instanceof Error ? err.message : String(err)}, drawing them all`);
    }
    // And with what it wears from its props (King Shakalaka's crown). A
    // package without them is drawn bare.
    if (rig)
      try {
        ({ pmo: model.pmo, textures } = wearProps(
          pac,
          entries,
          pmoEntry.index,
          model.pmo,
          rig.bones,
          textures,
        ));
      } catch (err) {
        console.log(
          `${name}: ${err instanceof Error ? err.message : String(err)}, drawing it bare`,
        );
      }
  }
  // An unrigged model's skeleton still splits it into pieces and poses it.
  const bones = rig ? undefined : weaponSkeleton(entries, pmoEntry.index);
  const { pmo, sheathed } = pose && bones ? poseWeapon(model.pmo, bones, pose) : { pmo: model.pmo };
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
  return {
    glb,
    motions,
    slots: rig?.clips?.map((clip) => clip.slot),
    missing: missingTextures(pmo, textures),
  };
}

/**
 * What an armor piece needs to go on the player: its slot, the player's
 * skeleton for its sex (none if it couldn't be read) and the skin textures
 * its bare parts take (skin.ts).
 */
interface ArmorFit {
  slot: HunterSlot;
  skeleton?: Bone[];
  skin: readonly TmhImage[];
  /**
   * Tags each primitive with a part by its material in the piece
   * (`tagParts`): a face's two materials, a hairstyle's hair.
   */
  partOf?: (material: number) => number;
}

/**
 * An armor piece as a GLB placed on the player's skeleton (`composeHunter`
 * on the piece alone), so any pieces of one sex shown together line up as
 * the hunter wears them. It stays unskinned, in the bind pose, but each
 * vertex keeps its player joints and weights (`_JOINTS_0`, `_WEIGHTS_0`) for
 * the site to put it on the moving hunter. `missing` is as `packageToGlb`'s.
 */
async function armorToGlb(
  buf: Buffer,
  name: string,
  { slot, skeleton, skin, partOf }: ArmorFit & { skeleton: Bone[] },
  options: GlbOptions,
): Promise<{ glb: Buffer; missing: number[] }> {
  const piece = readHunterPiece(slot, readPac(buf), skin);
  const { pmo, textures, meshMaterialBases } = composeHunter([piece], skeleton);
  const { glb } = await buildGlb(pmo, textures, name, {
    ...options,
    jointWeights: true,
    materialExtras: skinExtras(textures, skin),
    ...(partOf
      ? {
          tagParts: true,
          partOf: (mesh, primitive) =>
            partOf(
              pmo.meshes[mesh]!.primitives[primitive]!.materialIndex - meshMaterialBases[mesh]!,
            ),
        }
      : {}),
  });
  // Reported as the piece's own indices, not composeHunter's stand-ins.
  const missing = missingTextures(pmo, textures).map((index) =>
    index >= MISSING_TEXTURE ? index - MISSING_TEXTURE : index,
  );
  return { glb, missing };
}

/**
 * Marks the materials drawn with a skin texture (skin.ts) with its index in
 * the skin tone's images (`extras.skin`), for the site to swap in the skin
 * tone the hunter's face has.
 */
function skinExtras(
  textures: readonly TmhImage[],
  skin: readonly TmhImage[],
): GlbOptions["materialExtras"] {
  return (index) => {
    const image = textures[index];
    const k = image ? skin.indexOf(image) : -1;
    return k >= 0 ? { skin: k } : undefined;
  };
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

/** The first skin tone's textures for `sex` (skin.ts); none, logged, when the file isn't there. */
async function readSkin(dataBin: string, sex: "m" | "f"): Promise<TmhImage[]> {
  const file = path.join(dataBin, skinTexturePath(sex));
  try {
    const buf = await readFile(file);
    if (isTmh(buf)) return readTmh(buf);
    console.log(`${skinTexturePath(sex)} isn't a .TMH: armor skin stays untextured`);
  } catch {
    console.log(`no ${skinTexturePath(sex)}: armor skin stays untextured`);
  }
  return [];
}

/** Weapon classes (`motion/wNN_tbl.bin`, by `WEAPON_TYPE_NAMES` index). */
const WEAPON_CLASS_COUNT = 11;
/** Slots of `motion/plcom_tbl.bin` the site plays: group 0's standing idle (weapon away). */
const COMMON_MOTION_SLOTS = new Set([0 * PLAYER_GROUP_SLOTS + 1]);

async function exportHunter(
  ids: EquipmentIds,
  { models, skeletons, skins }: PlayerBase,
  options: ExportSiteOptions,
): Promise<void> {
  const dataBin = path.join(options.unpacked, "data-bin");
  const piece = async (slot: HunterSlot, file: string, sex: "m" | "f") =>
    readHunterPiece(slot, readPac(await readFile(path.join(dataBin, file))), skins[sex]);
  /**
   * One sex's hunter, on the skeleton that sex's armor models are placed on
   * (`playerSkeletons`), with the default face (look.ts) less what its
   * helmet hides: in the default set, or `bare`, in the clothes under armor
   * (each slot's model 0) and the default hairstyle, dyed.
   */
  const compose = async (sex: "m" | "f", bare: boolean) => {
    const skeleton = skeletons[sex];
    if (!skeleton) throw new Error(`no ${sex} player skeleton`);
    let mask = 0;
    const armor = await Promise.all(
      (Object.entries(HUNTER_ARMOR) as [ArmorSlot, string][]).map(async ([slot, name]) => {
        if (bare && slot === "helmet")
          return dyeHair(
            await piece(slot, hairstylePath(sex, HUNTER_HAIRSTYLE), sex),
            HUNTER_HAIR_COLOR,
          );
        if (bare) return piece(slot, armorModelPath(slot, sex, 0), sex);
        const entry = models[slot].find((e) => ids[slot]?.[e.index]?.name === name);
        if (!entry) throw new Error(`Default armor piece not found: ${name}`);
        const id = sex === "m" ? entry.maleId : entry.femaleId;
        if (slot === "helmet") mask = FACE_MASKS[sex][id] ?? 0;
        return piece(slot, armorModelPath(slot, sex, id), sex);
      }),
    );
    const face = maskFace(await piece("face", facePath(sex, HUNTER_FACE), sex), mask);
    return composeHunter(face ? [...armor, face] : armor, skeleton);
  };
  const clipOptions = options.lossless ? {} : SITE_CLIP_OPTIONS;
  const dir = path.join(options.out, "hunter");
  await mkdir(dir, { recursive: true });
  let size = 0;
  /**
   * Writes a composed hunter. Each primitive is tagged with its part
   * (`extras.part`): its slot's index in `HUNTER_ARMOR` order, or for the
   * face, `FACE_PART` plus its material (0 or 1).
   */
  const writeHunter = async (name: string, sex: "m" | "f", hunter: HunterModel) => {
    const slots: string[] = Object.keys(HUNTER_ARMOR);
    const { glb } = await buildGlb(
      hunter.pmo,
      hunter.textures,
      name,
      {
        ...(options.lossless ? {} : SITE_GLB_OPTIONS),
        partOf: (mesh, primitive) => {
          const slot = hunter.meshSlots[mesh]!;
          if (slot !== "face") return slots.indexOf(slot);
          const { materialIndex } = hunter.pmo.meshes[mesh]!.primitives[primitive]!;
          return FACE_PART + materialIndex - hunter.meshMaterialBases[mesh]!;
        },
        materialExtras: skinExtras(hunter.textures, skins[sex]),
      },
      { bones: hunter.bones },
    );
    await writeFile(path.join(dir, `${name}.glb`), glb);
    size += glb.length;
  };
  const male = await compose("m", false);
  const { bones } = male;
  await writeHunter("hunter", "m", male);
  // The bare hunters, for armor; they play the same motions.
  for (const sex of ["m", "f"] as const) {
    const name = sex === "m" ? "hunter-bare" : "hunter-bare-female";
    try {
      await writeHunter(name, sex, await compose(sex, true));
    } catch (err) {
      console.log(`no ${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

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

/** What `hunter/look.json` holds for one sex: what the site's look pickers offer. */
interface SiteLook {
  /** Faces (`hunter/look/<s>_faceNNN.glb`) and hairstyles (`<s>_headNNN.glb`), from 0. */
  faces: number;
  hairstyles: number;
  /** Each face's skin tone, the `hunter/skin/<s>_<tone>_<k>.png` its skin takes. */
  faceSkinTones: readonly number[];
  /** Images in each skin tone (`<k>` above). */
  skinImages: number;
  /** `CLOTHING_MODELS`: the `armor/` model of each slot, by clothing and skin tone. */
  clothing: Record<ClothingSlot, readonly (readonly number[])[]>;
  /** `FACE_MASKS`: what each helmet model hides of the face. */
  faceMasks: Readonly<Record<number, number>>;
}

/**
 * The pieces of a hunter's look (look.ts), for the site to dress its bare
 * hunter in what a player picks, each placed on the player's skeleton like
 * armor (`armorToGlb`):
 *
 *   hunter/look/<s>_faceNNN.glb    each face, tagged `FACE_PART` + material
 *   hunter/look/<s>_headNNN.glb    each hairstyle, undyed, its hair tagged `HAIR_PART`
 *   armor/<s>_<folder>NNN.glb      each clothing model (`CLOTHING_MODELS`)
 *   hunter/skin/<s>_<tone>_<k>.png each skin tone's images
 *   hunter/look.json               `SiteLook` by sex
 *
 * Materials drawn with a skin image carry its index (`extras.skin`), to swap
 * for the face's skin tone.
 */
async function exportLook(
  converter: Converter,
  { skeletons, skins }: PlayerBase,
  options: ExportSiteOptions,
): Promise<void> {
  const dataBin = path.join(options.unpacked, "data-bin");
  const dir = path.join(options.out, "hunter");
  await rm(path.join(dir, "look"), { recursive: true, force: true });
  await rm(path.join(dir, "skin"), { recursive: true, force: true });
  await mkdir(path.join(dir, "skin"), { recursive: true });
  const looks: Partial<Record<"m" | "f", SiteLook>> = {};
  for (const sex of ["m", "f"] as const) {
    const skeleton = skeletons[sex];
    if (!skeleton) {
      console.log(`no ${sex} look: no player skeleton`);
      continue;
    }
    const fit = { skeleton, skin: skins[sex] };
    /** Converts the pieces numbered from 0 up to the first not on the disc; returns how many. */
    const convertAll = async (
      pathOf: (id: number) => string,
      slot: HunterSlot,
      partOf: (material: number) => number,
    ) => {
      let id = 0;
      for (; await exists(path.join(dataBin, pathOf(id))); id++) {
        const source = pathOf(id);
        const out = `hunter/look/${path.basename(source, ".pac")}.glb`;
        if (!(await converter.convert(source, out, undefined, { ...fit, slot, partOf })))
          throw new Error(`${source} didn't convert`);
      }
      return id;
    };
    const faces = await convertAll(
      (id) => facePath(sex, id),
      "face",
      (material) => FACE_PART + material,
    );
    const hairstyles = await convertAll(
      (id) => hairstylePath(sex, id),
      "helmet",
      (material) => (material === HAIR_MATERIAL ? HAIR_PART : 0),
    );
    const clothing = CLOTHING_MODELS[sex];
    for (const [slot, rows] of Object.entries(clothing) as [ClothingSlot, number[][]][])
      for (const id of new Set(rows.flat())) {
        const source = armorModelPath(slot, sex, id);
        await converter.convert(source, `armor/${path.basename(source, ".pac")}.glb`, undefined, {
          ...fit,
          slot,
        });
      }
    let skinImages = 0;
    for (let tone = 0; tone < SKIN_TONES; tone++) {
      const images = readTmh(await readFile(path.join(dataBin, skinTexturePath(sex, tone))));
      skinImages = images.length;
      for (const [k, image] of images.entries())
        await writeFile(
          path.join(dir, "skin", `${sex}_${tone}_${k}.png`),
          encodePng(image.width, image.height, image.rgba),
        );
    }
    looks[sex] = {
      faces,
      hairstyles,
      faceSkinTones: FACE_SKIN_TONES[sex].slice(0, faces),
      skinImages,
      clothing,
      faceMasks: FACE_MASKS[sex],
    };
    console.log(`look ${sex}: ${faces} faces, ${hairstyles} hairstyles`);
  }
  await writeFile(path.join(dir, "look.json"), `${JSON.stringify(looks)}\n`);
}

/** Converts each DATA.BIN package at most once, caching the result path (or null). */
class Converter {
  private readonly done = new Map<string, string | null>();
  /** Motion files written, by content: monsters with the same motions share the first's. */
  private readonly motionFiles = new Map<string, string>();
  /** The motion slots of each converted model, by its output path. */
  readonly motionSlots = new Map<string, number[]>();
  /** Packages referenced by the game data but absent from the unpacked directory (e.g. a partial dump). */
  missing = 0;
  /** Converted packages with materials no texture was found for, and those texture indices. */
  readonly untextured = new Map<string, number[]>();
  constructor(
    private readonly dataBin: string,
    private readonly out: string,
    private readonly options: GlbOptions,
    private readonly clipOptions: ClipOptions,
  ) {}

  /**
   * `armor` puts an armor piece on the player's skeleton (`armorToGlb`); a
   * piece that doesn't fit it is converted as it is, in its own bind pose.
   */
  async convert(
    source: string,
    relativeOut: string,
    pose?: WeaponPoses,
    armor?: ArmorFit,
  ): Promise<string | null> {
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
      /** Why the armor piece couldn't go on the player, logged once it's converted as it is. */
      let unfit: string | undefined;
      if (armor?.skeleton) {
        const buf = await readFile(path.join(this.dataBin, source));
        const fit = { ...armor, skeleton: armor.skeleton };
        const placed = await armorToGlb(buf, source, fit, this.options).catch((err: unknown) => {
          unfit = err instanceof Error ? err.message : String(err);
          return null;
        });
        if (placed) {
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(file, placed.glb);
          if (placed.missing.length) this.untextured.set(source, placed.missing);
          this.done.set(source, relativeOut);
          return relativeOut;
        }
      }
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
        armor?.skin,
      );
      if (converted) {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, converted.glb);
        if (converted.missing.length) this.untextured.set(source, converted.missing);
        // A model that shares another's motions, or has none, loses a stale file.
        const motionsPath = path.join(path.dirname(file), ownMotions);
        if (converted.motions && !shared) {
          await writeFile(motionsPath, converted.motions);
          // Only now can others share it: a conversion that failed wrote nothing.
          if (motionsKey) this.motionFiles.set(motionsKey, ownMotions);
        } else await rm(motionsPath, { force: true });
        if (unfit) console.log(`${source}: ${unfit}, kept in its own pose`);
        if (converted.slots) this.motionSlots.set(relativeOut, converted.slots);
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

/** The site's monsters: emID -> name (`data/strings`). */
async function siteMonsters(dataDir: string): Promise<Map<number, string>> {
  const names = (readStringsDoc(dataDir).monster ?? {}) as Record<string, string>;
  const out = new Map<number, string>();
  const dir = path.join(dataDir, "monsters");
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json"))) {
    const { monsters } = readRawData<{ monsters: { id: number }[] }>(dataDir, "monsters", file);
    for (const { id } of monsters) if (names[id]) out.set(id, names[id]);
  }
  return out;
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

/** The skeleton a monster package's mesh (its first PMO) is bound to; [] if none. */
async function monsterSkeleton(pacPath: string): Promise<Bone[]> {
  const pac = await readFile(pacPath);
  const entries = isPac(pac) ? readPac(pac) : [];
  const pmoEntry = entries.find((entry) => isPmo(entry.data));
  return pmoEntry ? skeletonFor(entries, pmoEntry.index) : [];
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
    const bones = await monsterSkeleton(pacPath);
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

/** What attack hitboxes are found with: the game's code and data, without a monster overlay, and every `emNN.ovl`. */
interface AttackSource {
  image: ImageSegment[];
  overlays: Map<number, ImageSegment>;
}

async function loadAttackSource(
  unpacked: string,
  region: Region,
  collision: CollisionSource | null,
): Promise<AttackSource | null> {
  const skip = (reason: string) => {
    console.log(`${reason}: skipping monster attacks.`);
    return null;
  };
  if (region !== "eu")
    return skip(`Attack addresses are known for the EU disc only, not ${region}`);
  if (!collision) return skip("No game_task.ovl");
  const ebootPath = path.join(unpacked, "eboot.bin");
  const gameSubPath = path.join(unpacked, OVERLAY_DIR, "game_sub.ovl");
  if (!(await exists(ebootPath))) return skip("No eboot.bin");
  if (!(await exists(gameSubPath))) return skip("No overlay/game_sub.ovl");
  const eboot = await readFile(ebootPath);
  if (!isElf(eboot)) return skip("eboot.bin isn't decrypted");
  return {
    image: [
      ...ebootImage(eboot),
      ovlImage(collision.gameTask),
      ovlImage(parseOvl(await readFile(gameSubPath))),
    ],
    overlays: new Map([...collision.emOvls].map(([id, ovl]) => [id, ovlImage(ovl)])),
  };
}

/**
 * Writes `monsters/emNN.attacks.json` for one exported monster, or removes
 * a stale one and logs why there is none.
 */
async function exportAttacks(
  source: AttackSource,
  pacPath: string,
  emId: number,
  siteName: string,
  out: string,
): Promise<boolean> {
  const file = path.join(out, "monsters", `em${String(emId).padStart(2, "0")}.attacks.json`);
  const fail = async (reason: string) => {
    console.log(`no attacks for ${siteName}: ${reason}`);
    await rm(file, { force: true });
    return false;
  };
  try {
    const bones = await monsterSkeleton(pacPath);
    if (bones.length === 0) return await fail("no skeleton in the model package");
    const sweep = sweepMonsterAttacks(source.image, source.overlays, emId, familyOverlayId(emId));
    if ("error" in sweep) return await fail(sweep.error);
    const { attacks, skipped } = buildSiteAttacks(sweep.spawns, jointPositions(bones));
    for (const reason of skipped) console.log(`${siteName} attacks: skipped ${reason}`);
    if (attacks.attacks.length === 0)
      return await fail(
        sweep.spawns.length
          ? "no attack shape could be placed"
          : "its spawner makes no attack objects",
      );
    await writeFile(file, `${JSON.stringify(attacks)}\n`);
    return true;
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Writes `monsters/emNN.unused-motions.json`, `{ "unused": [slot, …] }`:
 * the motions in a monster's bank that none of its code plays
 * (`monsters/motion-use.ts`). A monster with none, or whose code couldn't
 * be followed all the way, gets no file (an old one is removed); the reason
 * is logged.
 */
async function exportUnusedMotions(
  source: AttackSource | null,
  emId: number,
  slots: readonly number[] | undefined,
  siteName: string,
  out: string,
): Promise<boolean> {
  const file = path.join(out, "monsters", `em${String(emId).padStart(2, "0")}.unused-motions.json`);
  const none = async (reason?: string) => {
    if (reason) console.log(`no unused motions for ${siteName}: ${reason}`);
    await rm(file, { force: true });
    return false;
  };
  // Another disc's code addresses aren't known; a file from an earlier
  // export into the same place mustn't outlive it.
  if (!source) return none();
  if (!slots) return none("its model has no motions");
  try {
    const use = findMotionUse(source.image, source.overlays, emId, familyOverlayId(emId));
    if ("error" in use) return await none(use.error);
    if (use.uncertain) return await none(use.uncertain);
    const used = new Set([...use.used, ...use.undecided]);
    const unused = slots.filter((slot) => !used.has(slot));
    if (unused.length === 0) return await none("its code plays every motion");
    await writeFile(file, `${JSON.stringify({ unused })}\n`);
    return true;
  } catch (err) {
    return none(err instanceof Error ? err.message : String(err));
  }
}

async function exportMonsters(
  options: ExportSiteOptions,
  converter: Converter,
  region: Region,
): Promise<Record<string, number>> {
  const siteNames = await siteMonsters(options.data);
  const monsters: Record<string, number> = {};
  const emDir = path.join(options.unpacked, "data-bin", "emmodel");
  if (!(await exists(emDir))) return monsters;
  const files = (await readdir(emDir)).filter((f) => /^em\d+\.pac$/.test(f)).sort();
  const collision = await loadCollisionSource(options.unpacked);
  const attackSource = await loadAttackSource(options.unpacked, region, collision);
  let hitboxCount = 0;
  let attackCount = 0;
  let unusedCount = 0;
  for (const file of files) {
    const id = Number.parseInt(file.slice(2), 10);
    const siteName = siteNames.get(id);
    if (!siteName) {
      console.log(`skip ${file}: emID ${id} has no monster page`);
      continue;
    }
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
    if (
      attackSource &&
      (await exportAttacks(attackSource, path.join(emDir, file), id, siteName, options.out))
    )
      attackCount++;
    const slots = converter.motionSlots.get(relative);
    if (await exportUnusedMotions(attackSource, id, slots, siteName, options.out)) unusedCount++;
  }
  console.log(
    `monsters: ${Object.keys(monsters).length}, with hitboxes: ${hitboxCount}, with attacks: ${attackCount}, with unused motions: ${unusedCount}`,
  );
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
        weaponPoses(page.type as WeaponTypeName, entry.modelId),
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

/**
 * The player's skeleton for each sex, which every armor piece goes on: the
 * default leggings' (`HUNTER_ARMOR`). Most leggings carry the same one.
 */
async function playerSkeletons(
  dataBin: string,
  models: ReturnType<typeof readArmorModelIds>,
  ids: EquipmentIds,
): Promise<Partial<Record<"m" | "f", Bone[]>>> {
  const entry = models.leggings.find(
    (e) => ids.leggings?.[e.index]?.name === HUNTER_ARMOR.leggings,
  );
  const out: Partial<Record<"m" | "f", Bone[]>> = {};
  for (const [sex, id] of [
    ["m", entry?.maleId],
    ["f", entry?.femaleId],
  ] as const) {
    if (!id) {
      console.log(
        `no ${sex} player skeleton: no ${HUNTER_ARMOR.leggings} model, armor kept in its own pose`,
      );
      continue;
    }
    try {
      const source = path.join(dataBin, armorModelPath("leggings", sex, id));
      out[sex] = readHunterPiece("leggings", readPac(await readFile(source))).bones;
    } catch (err) {
      console.log(`no ${sex} player skeleton: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

/**
 * What the armor models and the hunters are built from, read once: each
 * slot's model IDs, and per sex the player skeleton (`playerSkeletons`) and
 * skin textures (`readSkin`).
 */
interface PlayerBase {
  models: ReturnType<typeof readArmorModelIds>;
  skeletons: Partial<Record<"m" | "f", Bone[]>>;
  skins: Record<"m" | "f", TmhImage[]>;
}

async function readPlayerBase(
  reader: BinaryReader,
  region: Region,
  ids: EquipmentIds,
  dataBin: string,
): Promise<PlayerBase> {
  const models = readArmorModelIds(reader, MHP2G_PROFILE.resolverForRegion(region) ?? undefined);
  return {
    models,
    skeletons: await playerSkeletons(dataBin, models, ids),
    skins: { m: await readSkin(dataBin, "m"), f: await readSkin(dataBin, "f") },
  };
}

async function exportArmor(
  ids: EquipmentIds,
  converter: Converter,
  { models, skeletons, skins }: PlayerBase,
): Promise<SiteModelManifest["armor"]> {
  const armor: SiteModelManifest["armor"] = {};
  let count = 0;
  for (const [slot, entries] of Object.entries(models) as [
    SiteArmorSlot,
    { index: number; maleId: number; femaleId: number }[],
  ][]) {
    for (const entry of entries) {
      const page = ids[slot]?.[entry.index];
      if (!page) continue;
      const found: [number, number] = [0, 0];
      // Model 0 is the empty slot (e.g. piercings and other helmets with no mesh).
      for (const [i, sex, id] of [
        [0, "m", entry.maleId],
        [1, "f", entry.femaleId],
      ] as const) {
        if (id === 0) continue;
        const source = armorModelPath(slot, sex, id);
        if (
          await converter.convert(source, `armor/${path.basename(source, ".pac")}.glb`, undefined, {
            slot,
            skeleton: skeletons[sex],
            skin: skins[sex],
          })
        )
          found[i] = id;
      }
      if (found[0] || found[1]) {
        (armor[slot] ??= {})[`${page.name}${page.sex ? `|${page.sex}` : ""}`] = found;
        count++;
      }
    }
  }
  console.log(`armor: ${count}`);
  // What the skin didn't cover: a material indexing past the piece's
  // textures and the skin's, which shows untextured.
  const untextured = [...converter.untextured].filter(([source]) => source.startsWith("player/"));
  if (untextured.length) {
    console.log(`armor: ${untextured.length} models with untextured materials, e.g.`);
    for (const [source, indices] of untextured.slice(0, 10))
      console.log(`  ${source}: texture ${indices.join(", ")}`);
  }
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

  const monsters = await exportMonsters(options, converter, unpackManifest.region);
  if (Object.keys(monsters).length) manifest.monsters = monsters;

  const ebootPath = path.join(options.unpacked, "eboot.bin");
  if (await exists(ebootPath)) {
    const reader = new BinaryReader(await readFile(ebootPath));
    const ids = readData<EquipmentIds>(options.data, "equipment-ids.json");
    if (await exists(path.join(options.unpacked, "data-bin", "weapon"))) {
      manifest.weapons = await exportWeapons(reader, unpackManifest.region, ids, converter);
    }
    if (await exists(path.join(options.unpacked, "data-bin", "player"))) {
      const base = await readPlayerBase(
        reader,
        unpackManifest.region,
        ids,
        path.join(options.unpacked, "data-bin"),
      );
      manifest.armor = await exportArmor(ids, converter, base);
      await exportLook(converter, base, options).catch((err: unknown) => {
        console.log(`no look: ${err instanceof Error ? err.message : String(err)}`);
      });
      await exportHunter(ids, base, options).catch((err: unknown) => {
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
