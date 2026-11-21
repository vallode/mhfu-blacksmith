/**
 * The weapon stitcher (`mods.weaponStitcher`, a prototype): a new look for
 * the hunter's weapon every time the game builds it, stitched in game from
 * the forges' parts: a melee weapon's of its class or (in "any" and "wild"
 * mode) any melee class's, as `mods.weaponMashups`' modes; a bow's or
 * bowgun's of its class, as `mods.gunnerMashups` mixes them.
 *
 * What the game does (EU and JP): the hunter's weapon model is built by one
 * EBOOT function (EU 0x08868234, JP 0x0886822C), `build(resources, hunter,
 * n)`, called when the hunter is made for a stage (the village, a quest) and
 * from `lobby_task` when the equipment changes at home. Slot `(n & 0xff) * 8
 * + 6` holds the weapon: its package from DATA.BIN is already in the slot's
 * buffer (`resources + 0x80258 + slot * 4`), read before the build, which
 * builds the model and texture from those bytes; the slot's capacity is at
 * `+0x80318` (0x5800 for every hunter's weapon) and the DATA.BIN file it
 * holds at `+0x80408` (u16), the weapon model plus a base per region.
 *
 * The patch hooks the build (hook 7, `game-hooks.ts`): the blob's
 * `rf_hook7` (`blob/stitch.c`) writes a stitched package over the buffer
 * for the hunter's own weapon (n = 0) when one fits, from `FORGE.BIN`
 * (`forge/stitch-library.ts`), a file of its own in `/PSP_GAME/USRDIR`.
 * Anything that fails keeps DATA.BIN's bytes. With relics (`forge/relics.ts`)
 * only a relic is stitched, from a seed kept in its equipment box slot, so it
 * keeps its look.
 */
import { decodeObjects } from "../blob/link.js";
import { STITCH_OBJECTS } from "../blob/stitch-object.js";
import type { Edits } from "../edits.js";
import { buildForgeLibrary, FORGE_ISO_PATH } from "../forge/stitch-library.js";
import { STITCH_MODES, type StitchMode } from "../forge/stitch.js";
import { findRelics, relicTable } from "../forge/relics.js";
import type { GameData } from "../game/load.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";
import { findImports } from "./code-loader.js";
import type { BuildSite } from "./game-hooks.js";
import { codeSegment, findUnique, luiLwAddress } from "./mips.js";
import { SAVE_POINTER_SIGNATURE } from "./poogie-luck.js";
import { gunnerParts } from "./gunner-mashups.js";
import { meleeParts, weaponFiles } from "./weapon-mashups.js";

const TITLE = "Weapon stitcher";

/** The weapon build's first 31 words (`maskWord`ed), the same on the EU and JP discs. */
export const BUILD_SIGNATURE = [
  0x27bdffd0, 0xafbf0000, 0xafb60000, 0xafb50000, 0xafb40000, 0xafb30000, 0xafb20000, 0x30d200ff,
  0x001210c0, 0xafb10000, 0x24420006, 0xafb00000, 0x305100ff, 0xe7b60008, 0x3c010000, 0xe7b50004,
  0x00a0a021, 0x0080a821, 0x00111080, 0x00551021, 0x34210258, 0xe7b40000, 0x00418021, 0x8e040000,
  0x0c000000, 0x00002821, 0x00409821, 0x56600003, 0x9676001c, 0x1000006e, 0x00001021,
];

/** Imports the blob calls that the code loader doesn't. */
export const STITCH_NIDS = {
  sceIoLseek: 0x27eb27b8,
  sceKernelGetSystemTimeLow: 0x369ed59d,
} as const;

export const stitchObjects = () => decodeObjects(STITCH_OBJECTS);

/** The blob's `rf_stitch_mode`: 1 + the mode's number (an extern's address isn't 0). */
export const stitchModeExtern = (mode: StitchMode) => 1 + STITCH_MODES.indexOf(mode);

/** The blob's `rf_relic_mode`: 2 with relics, 1 without (an extern's address isn't 0). */
export const relicModeExtern = (relics: boolean) => (relics ? 2 : 1);

export interface WeaponStitcher {
  externs: Record<string, number>;
  /** The blob's tables: `rf_relics`. */
  data: Record<string, Buffer>;
  build: BuildSite;
  /** The report, once the code loader is (or isn't) in; adds FORGE.BIN when it is. */
  finish(applied: boolean): ShuffleReport;
}

/** Finds the build and cuts the library, or says why it can't. */
export function prepareWeaponStitcher(
  game: GameData,
  edits: Edits,
  mode: StitchMode,
  /** Only relics (`forge/relics.ts`) are stitched, each keeping its look; else every weapon, anew. */
  relics = false,
): WeaponStitcher | string {
  const eboot = game.eboot;
  if (!eboot) return "the EBOOT wasn't loaded";
  const segment = codeSegment(eboot);
  if (!segment) return "the EBOOT isn't an ELF";
  const [build, savePointer] = findUnique(eboot, segment, [
    BUILD_SIGNATURE,
    SAVE_POINTER_SIGNATURE,
  ]);
  if (build == null) return "this EBOOT's weapon build doesn't match";
  if (savePointer == null) return "this EBOOT's save pointer wasn't found";
  const word = (vaddr: number) => eboot.readUInt32LE(segment.offset + (vaddr - segment.vaddr));
  const stubs = findImports(eboot, segment);
  const lseek = stubs.get(STITCH_NIDS.sceIoLseek);
  const time = stubs.get(STITCH_NIDS.sceKernelGetSystemTimeLow);
  if (lseek === undefined) return "this EBOOT doesn't import sceIoLseek";
  if (time === undefined) return "this EBOOT doesn't import sceKernelGetSystemTimeLow";
  const files = weaponFiles(game);
  const bases = new Set([...files].map(([model, file]) => file - model));
  if (bases.size !== 1) return "weapon models aren't one run of DATA.BIN files";
  const [base] = bases;
  const weapons = meleeParts(game, files);
  const gunners = gunnerParts(game, files);
  // Built now, not once the loader is in, so a disc past the blob's limits
  // keeps the hook out rather than failing the whole run.
  let forge: Buffer;
  try {
    forge = buildForgeLibrary(weapons, gunners);
  } catch (error) {
    return `${FORGE_ISO_PATH} couldn't be built: ${(error as Error).message}`;
  }
  const models = weapons.length + gunners.length;
  // The weapon shuffle has already moved the starters, if it ran.
  const relicList = relics ? findRelics(eboot, edits.eboot(), game.resolver) : [];
  return {
    externs: {
      rf_io_lseek: lseek,
      rf_time_low: time,
      rf_weapon_file_base: base!,
      rf_stitch_mode: stitchModeExtern(mode),
      rf_relic_mode: relicModeExtern(relics),
      rf_save_pointer: luiLwAddress(word(savePointer), word(savePointer + 4)),
    },
    data: { rf_relics: relicTable(relicList) },
    build: { build, prologue: [word(build), word(build + 4)] },
    finish(applied) {
      if (!applied) {
        return {
          title: TITLE,
          notes: ["The weapon stitcher needs the code loader, which isn't in this image."],
          lines: [],
          summary: `${TITLE}: not applied (no code loader)`,
        };
      }
      edits.discFile(FORGE_ISO_PATH, forge);
      return {
        title: TITLE,
        notes: [
          relics
            ? `Relics keep a stitched look: ${relicList.length} weapons, the upgrade lines of one starter per class. A relic's look is rolled the first time the game builds it after it is crafted (or upgraded), from a seed kept in its equipment box slot, and stays; crafting another rolls another. Other weapons look as they do.`
            : "The hunter's weapon gets a new look each time the game builds it (a stage load, an equipment change at home).",
          `Looks are stitched from ${models} models' parts in ${FORGE_ISO_PATH} (${forge.length} bytes): a melee weapon ${mode === "class" ? "within its class" : mode === "any" ? "across classes" : "from anything"}, a bow or bowgun within its class (${gunners.length} of them).`,
        ],
        lines: [],
        summary: `${TITLE}: ${mode}${relics ? `, ${relicList.length} relics` : ""} (${weapons.length} melee and ${gunners.length} gunner models, ${FORGE_ISO_PATH} ${forge.length} bytes)`,
      };
    },
  };
}
