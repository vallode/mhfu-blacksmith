/**
 * Weapon mashups for bows and bowguns: every gunner model is rebuilt by the
 * gunner forge (`src/forge/gunner-*.ts`) from parts of its class's models.
 * Part of `mods.weaponMashups` (`weapon-mashups.ts` does the melee classes).
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { readGunnerWeapons, readModelToWeaponType } from "mhfu-extract/src/tables/weapons.js";
import type { Edits } from "../edits.js";
import {
  buildGunnerLibrary,
  forgeGunner,
  rollGunnerRecipe,
  type GunnerRecipe,
} from "../forge/gunner-assemble.js";
import { cutGunner, GUNNER_TYPES, type GunnerParts } from "../forge/gunner-parts.js";
import type { GameData } from "../game/load.js";
import { tableName } from "../names.js";
import type { Rng } from "../rng.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";

/** Recipes rolled for each model before it is left as it is. */
const TRIES = 8;

/** A gunner model's name for the log: the first weapon using it, and how many more do. */
export function gunnerLabels(game: GameData, eboot: Buffer): (model: number) => string {
  const names = new Map<number, string[]>();
  readGunnerWeapons(new BinaryReader(eboot), game.resolver).forEach((weapon, i) => {
    const name = tableName("WepGunID", i);
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

/** The parts of every bow and bowgun model on the disc (as the disc has them). */
export function gunnerParts(game: GameData, files: Map<number, number>): GunnerParts[] {
  const modelType = readModelToWeaponType(new BinaryReader(game.eboot), game.resolver);
  const weapons: GunnerParts[] = [];
  for (const [model, index] of [...files].sort((a, b) => a[0] - b[0])) {
    const type = modelType[model];
    if (!type || !GUNNER_TYPES.includes(type)) continue;
    const parts = cutGunner(model, type, game.dataBin.read(index));
    if (typeof parts !== "string") weapons.push(parts);
  }
  return weapons;
}

/** What a recipe takes from where, in a line. */
export function describeGunnerRecipe(r: GunnerRecipe, label: (model: number) => string): string {
  const of = (w: GunnerParts) => label(w.model);
  const bits = [r.frame.type === "bow" ? `${of(r.body)}'s bow` : `${of(r.body)}'s body`];
  if (r.stock && r.stock !== r.body) bits.push(`${of(r.stock)}'s stock`);
  if (r.barrel) bits.push(`${of(r.barrel)}'s barrel`);
  if (r.limbs) bits.push(`${of(r.limbs)}'s limbs`);
  if (r.second && r.second !== r.frame) bits.push(`${of(r.second)}'s quiver`);
  if (r.material) bits.push(`all ${r.material}`);
  else if (r.accentMaterial) {
    bits.push(`${r.accentMaterial} ${r.frame.type === "bow" ? "quiver" : "barrel"}`);
  }
  return bits.join(", ");
}

/** Forges a new look for every bow and bowgun model; the lines say what each got. */
export function forgeGunners(
  game: GameData,
  rng: Rng,
  edits: Edits,
  files: Map<number, number>,
  where: (type: GunnerParts["type"]) => string,
): { lines: ShuffleReport["lines"]; skipped: number } {
  const label = gunnerLabels(game, edits.eboot());
  const weapons = gunnerParts(game, files);
  const library = buildGunnerLibrary(weapons);
  const lines: ShuffleReport["lines"] = [];
  let skipped = 0;
  for (const frame of weapons) {
    const index = files.get(frame.model)!;
    const pac = game.dataBin.read(index);
    let done = false;
    for (let tries = 0; tries < TRIES && !done; tries++) {
      const recipe = rollGunnerRecipe(frame, library, rng);
      if (!recipe) break;
      const forged = forgeGunner(pac, recipe);
      if (typeof forged === "string" || forged.length > game.dataBin.lengthOf(index)) continue;
      const out = edits.dataFile(index);
      out.fill(0);
      forged.copy(out);
      lines.push({
        where: where(frame.type),
        text: `${label(frame.model)}: ${describeGunnerRecipe(recipe, label)}`,
      });
      done = true;
    }
    if (!done) skipped++;
  }
  return { lines, skipped };
}
