/**
 * Weapon mashups: every melee weapon model is rebuilt by the forge
 * (`src/forge/`) from the parts of the game's own models: a handle, a head,
 * maybe another guard, small extras, effects, its second piece, and a
 * material over them. Looks only; stats don't change.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { loadFileList } from "mhfu-extract/src/container/filelist.js";
import {
  readBlademasterWeapons,
  readModelToWeaponType,
  type WeaponTypeName,
} from "mhfu-extract/src/tables/weapons.js";
import type { Edits } from "../edits.js";
import {
  buildLibrary,
  forgeWeapon,
  lighterRecipes,
  paletteFormat,
  rollRecipe,
  type ForgeMode,
  type Recipe,
  vertexRoom,
} from "../forge/assemble.js";
import { cutWeapon, MELEE_TYPES, type WeaponParts } from "../forge/parts.js";
import type { GameData } from "../game/load.js";
import { tableName } from "../names.js";
import type { Rng } from "../rng.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";
import { forgeGunners } from "./gunner-mashups.js";

const TITLE = "Weapon mashups";

const CLASS_LABELS: Record<WeaponTypeName, string> = {
  "great-sword": "Great Sword",
  "long-sword": "Long Sword",
  "sword-and-shield": "Sword and Shield",
  "dual-blades": "Dual Blades",
  hammer: "Hammer",
  "hunting-horn": "Hunting Horn",
  lance: "Lance",
  gunlance: "Gunlance",
  "light-bowgun": "Light Bowgun",
  "heavy-bowgun": "Heavy Bowgun",
  bow: "Bow",
};

/** Recipes rolled for each model before it is left as it is. */
const TRIES = 8;

/** Each weapon model's DATA.BIN file index. */
export function weaponFiles(game: GameData): Map<number, number> {
  const files = new Map<number, number>();
  for (const [index, path] of loadFileList(game.region)) {
    const model = /^weapon\/we(\d{3})\.pac$/.exec(path)?.[1];
    if (model && index < game.dataBin.fileCount) files.set(Number(model), index);
  }
  return files;
}

/** A weapon model's name for the log: the first weapon using it, and how many more do. */
export function weaponLabels(game: GameData, eboot: Buffer): (model: number) => string {
  const names = new Map<number, string[]>();
  readBlademasterWeapons(new BinaryReader(eboot), game.resolver).forEach((weapon, i) => {
    const name = tableName("WepBMID", i);
    if (!name) return;
    const list = names.get(weapon.modelId) ?? names.set(weapon.modelId, []).get(weapon.modelId)!;
    list.push(name);
  });
  return (model) => {
    const list = names.get(model) ?? [];
    const first = list[0] ?? `model ${model}`;
    return list.length > 1 ? `${first} (+${list.length - 1})` : first;
  };
}

/** The parts of every melee model on the disc (as the disc has them, not forged). */
export function meleeParts(game: GameData, files: Map<number, number>): WeaponParts[] {
  const modelType = readModelToWeaponType(new BinaryReader(game.eboot), game.resolver);
  const weapons: WeaponParts[] = [];
  for (const [model, index] of [...files].sort((a, b) => a[0] - b[0])) {
    const type = modelType[model];
    if (!type || !MELEE_TYPES.includes(type)) continue;
    const parts = cutWeapon(model, type, game.dataBin.read(index));
    if (typeof parts !== "string") weapons.push(parts);
  }
  return weapons;
}

/** What a recipe takes from where, in a line. */
export function describeRecipe(r: Recipe, label: (model: number) => string): string {
  const of = (w: WeaponParts) =>
    w.type === r.frame.type ? label(w.model) : `${label(w.model)} (${CLASS_LABELS[w.type]})`;
  const bits = [`${of(r.head)}'s head on ${of(r.handle)}'s handle`];
  if (r.guard) bits.push(`${of(r.guard)}'s guard`);
  if (r.twin) bits.push("a matching second blade");
  else if (r.second && r.second !== r.frame) bits.push(`${of(r.second)}'s second piece`);
  if (r.extras.length > 0) bits.push(`${r.extras.length} borrowed trim`);
  if (r.effect) bits.push(`${of(r.effect.from)}'s effect`);
  if (r.material) bits.push(`all ${r.material}`);
  else if (r.headMaterial) bits.push(`${r.headMaterial} head`);
  return bits.join(", ");
}

/** Forges a new look for every melee weapon model. */
export function addWeaponMashups(
  game: GameData,
  rng: Rng,
  edits: Edits,
  mode: ForgeMode,
): ShuffleReport {
  const files = weaponFiles(game);
  const label = weaponLabels(game, edits.eboot());
  const weapons = meleeParts(game, files);
  const library = buildLibrary(weapons);
  const describe = (r: Recipe) => describeRecipe(r, label);

  const lines: ShuffleReport["lines"] = [];
  let skipped = 0;
  for (const frame of weapons) {
    const index = files.get(frame.model)!;
    const pac = game.dataBin.read(index);
    const blendedEffects = paletteFormat(pac) === 3;
    const room = vertexRoom(frame, pac, game.dataBin.lengthOf(index));
    let done = false;
    for (let tries = 0; tries < TRIES && !done; tries++) {
      const rolled = rollRecipe(frame, library, rng, mode, { blendedEffects, room });
      if (!rolled) break;
      for (const recipe of lighterRecipes(rolled)) {
        const forged = forgeWeapon(pac, recipe, library);
        if (typeof forged === "string" || forged.length > game.dataBin.lengthOf(index)) continue;
        const out = edits.dataFile(index);
        out.fill(0);
        forged.copy(out);
        lines.push({
          where: CLASS_LABELS[frame.type],
          text: `${label(frame.model)}: ${describe(recipe)}`,
        });
        done = true;
        break;
      }
    }
    if (!done) skipped++;
  }
  // Bows and bowguns, from their own class in either mode, on a stream of their own.
  const gunners = forgeGunners(game, rng.fork("gunners"), edits, files, (t) => CLASS_LABELS[t]);
  lines.push(...gunners.lines);
  skipped += gunners.skipped;

  return {
    title: TITLE,
    notes: [
      "Each bow and bowgun is rebuilt from parts of its class's models: a heavy bowgun's body and barrel, a light bowgun's body, stock, barrel and sometimes crossbow limbs, or a bow and its quiver.",
      mode === "class"
        ? "Each melee weapon is rebuilt from parts of its class's models: a handle, a head, sometimes another guard, trim and effects, and its second piece."
        : `Each melee weapon is rebuilt from parts of the game's models: a handle of its class, a head (of another class about ${mode === "wild" ? "90" : "50"}% of the time, scaled to fit), sometimes another guard, trim and effects, and its second piece.`,
      "Dual blades get a matching pair where it fits: the second blade is built from the same parts as the first.",
      ...(skipped > 0
        ? [
            `${skipped} models are left as they are: no recipe fit their file, or their parts couldn't be found.`,
          ]
        : []),
    ],
    lines,
    summary: `${TITLE}: ${lines.length} models`,
  };
}
