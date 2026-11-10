/**
 * Maps raw weapon tables onto `data/weapons/*.json`'s schema shape.
 *
 * Confirmed end-to-end against a real JP EBOOT + the committed
 * `data/weapons/*.json` across all 11 weapon types (hundreds of weapons):
 * `WepBMID`/`WepGunID` direct-array-index naming, `modelToWeaponType`
 * classification, `attack`/`element`/`status` scaling, `improve_from`/
 * `improve_to`, and `create_mats`/`improve_mats` all matched with zero or
 * near-zero exceptions (remaining diffs traced to legacy-site
 * abbreviation/typo differences, not extraction bugs) — see this module's
 * derivation comments and `README.md`'s "Derived values" section.
 *
 * Hunting horn `notes` and gunlance `shelling` are both decoded from the
 * struct's `NoteGLType` byte (`hornNotes()`, `gunlanceShelling()`), and
 * every weapon's `bonus` is its `Defense` byte (`defenseBonus()`). Horn
 * `melodies` need `game_task.ovl` and are added by `attachHornMelodies()`.
 * Gunner ammo, shots, coatings, reload, recoil and rapid fire are in
 * emit/gunner.ts.
 */
import {
  readBlademasterWeapons,
  readGunnerWeapons,
  readModelToWeaponType,
  readWeaponClassModifiers,
  WEAPON_TYPE_NAMES,
  type WeaponTypeName,
} from "../tables/weapons.js";
import { readDualAttributeWeapons, type DualAttributeWeapon } from "../tables/dual-attributes.js";
import { readSharpnessTables, SHARPNESS_COLORS, type SharpnessEntry } from "../tables/sharpness.js";
import {
  readEquipmentCreate,
  readEquipmentUpgrade,
  invertUpgradeTree,
  type EquipUpgradeEntry,
} from "../tables/recipes.js";
import type { TableAddressResolver } from "../tables/resolver.js";
import { readHornNoteSets, readMelodyTable, songsForNotes, type Song } from "../tables/horn.js";
import { melodyEffect } from "../overlay/melody-effects.js";
import { getNameResolver, type NameTable } from "../strings/names.js";
import type { BinaryReader } from "../binary/reader.js";
import { emitBowCoatingBonuses, emitGunnerDetails, readGunnerTables } from "./gunner.js";
import {
  displayRarity,
  groupEquipCreateByEquipId,
  halveCost,
  materialsOrNull,
  resolveMaterials,
} from "./common.js";

const ELEMENT_NAMES: Record<number, string> = {
  1: "Fire",
  2: "Water",
  3: "Thunder",
  4: "Dragon",
  5: "Ice",
};
const STATUS_NAMES: Record<number, string> = { 1: "Poison", 2: "Paralysis", 3: "Sleep" };

/** Raw element/status values are stored as true-value/10 (confirmed against ~170 real elemental weapons, zero exceptions). */
const ELEMENT_VALUE_SCALE = 10;

export interface EmittedElement {
  name: string;
  /** Element value, or "Add" for a bow coating bonus. */
  attack: number | "Add";
}

function emitElements(
  eleType: number,
  eleValue: number,
  statusType: number,
  statusValue: number,
): EmittedElement[] | null {
  const elements: EmittedElement[] = [];
  const eleName = ELEMENT_NAMES[eleType];
  if (eleName) elements.push({ name: eleName, attack: eleValue * ELEMENT_VALUE_SCALE });
  const statusName = STATUS_NAMES[statusType];
  if (statusName) elements.push({ name: statusName, attack: statusValue * ELEMENT_VALUE_SCALE });
  return elements.length > 0 ? elements : null;
}

/**
 * Both elements of a dual-element weapon (`WepDualAttr`), in stored order,
 * which is also the site's order. These weapons have no element in their
 * own struct.
 */
export function emitDualElements(entry: DualAttributeWeapon): EmittedElement[] {
  return entry.attributes.map((a) => {
    if (!a.name) {
      throw new Error(
        `Unknown dual-attribute flag 0x${a.flag.toString(16)} on WepBMID ${entry.weaponId}.`,
      );
    }
    return { name: a.name, attack: a.value * ELEMENT_VALUE_SCALE };
  });
}

/** `WepDualAttr` keyed by `WepBMID`, skipping all-zero entries (synthetic fixtures). */
function dualAttributesByWeaponId(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): Map<number, DualAttributeWeapon> {
  const byId = new Map<number, DualAttributeWeapon>();
  for (const entry of readDualAttributeWeapons(reader, resolver)) {
    if (entry.attributes.every((a) => a.flag === 0)) continue;
    byId.set(entry.weaponId, entry);
  }
  return byId;
}

/**
 * Sharpness display width per color, derived from a real-data-correlated
 * "reach threshold" model rather than the old fixed-slice-count heuristic.
 *
 * Old approach (superseded): scale every raw cumulative step by `/10` and
 * slice the first `sharpnessAmount + 3` colors, always starting the *last*
 * visible color at its own full raw width. That's wrong on two counts,
 * confirmed by direct correlation against real weapons sharing one
 * `sharpnessId` across multiple `sharpnessAmount` values (e.g. `Great Demon
 * Rod` amount=4 vs `Great Demon Hot Rod` amount=5, same underlying
 * cumulative curve): (1) `sharpnessAmount` isn't a *count* of visible
 * colors, it's a *reach threshold* in raw cumulative units — the true bar
 * length is `50 * (sharpnessAmount + 3)` raw units (`sharpness`) or
 * `50 * (sharpnessAmount + 4)` (`sharpness_plus`, always exactly one
 * 5-display-unit "notch" longer) — confirmed exactly across every
 * cross-checked amount value (0,1,3,4,5) on two independent cumulative
 * curves; (2) the *last* visible color is genuinely a **partial** width cut
 * off wherever that reach threshold lands inside it, not its full raw
 * width — computing `min(cumulative[i], threshold) - min(cumulative[i-1],
 * threshold)` per color (stopping once a color's own cumulative reaches the
 * threshold) reproduces every color's width exactly, including the partial
 * last one, on every cross-checked sample.
 *
 * `entry` is the weapon class's own curve, found through
 * `SharpnessTable.PTR` (see `readSharpnessTables()`). The great sword and
 * long sword weapons that still disagree by one unit between colours
 * (`Imperial Sword`, `Aqua Guardian`, ...) have site bars that no table
 * entry produces at any length, so they are site errors, not a missing
 * rendering rule (vallode/mhfu-blacksmith#31).
 */
export function emitSharpness(
  entry: SharpnessEntry,
  sharpnessAmount: number,
): { sharpness: number[]; sharpnessPlus: number[] } {
  const reach = (steps: number) => ELEMENT_VALUE_SCALE * 5 * steps;
  const widthsToReach = (threshold: number): number[] => {
    const out: number[] = [];
    let prevScaled = 0;
    for (const color of SHARPNESS_COLORS) {
      const raw = entry.cumulative[color];
      const currScaled = Math.round(Math.min(raw, threshold) / ELEMENT_VALUE_SCALE);
      out.push(currScaled - prevScaled);
      if (raw >= threshold) break;
      prevScaled = currScaled;
    }
    return out;
  };
  return {
    sharpness: widthsToReach(reach(sharpnessAmount + 3)),
    sharpnessPlus: widthsToReach(reach(sharpnessAmount + 4)),
  };
}

interface UpgradeGraph {
  entries: EquipUpgradeEntry[];
  inverted: Map<number, number[]>;
}

/**
 * `data/`'s committed convention uses a bare string when a weapon has
 * exactly one upgrade source, and an array only for 2+ (confirmed directly,
 * e.g. `data/weapons/great-sword.json`'s `"Buster Sword+"` ->
 * `improve_from: "Buster Sword"`); the schema's `oneOf` permits both
 * shapes. Matching this convention exactly eliminates format-only `diff`
 * noise without changing any actual data.
 */
function resolveImproveFrom(
  graph: UpgradeGraph,
  index: number,
  idTable: NameTable,
  names: ReturnType<typeof getNameResolver>,
): string | string[] | null {
  const sources = graph.inverted.get(index);
  if (!sources || sources.length === 0) return null;
  const resolved = sources
    .map((i) => names.resolve(idTable, i))
    .filter((n): n is string => n !== null);
  if (resolved.length === 0) return null;
  return resolved.length === 1 ? resolved[0]! : resolved;
}

function resolveImproveTo(
  entry: EquipUpgradeEntry | undefined,
  idTable: NameTable,
  names: ReturnType<typeof getNameResolver>,
): string[] | null {
  if (!entry) return null;
  const targets = entry.upgradeTargets.filter((t) => t !== 0).map((t) => names.resolve(idTable, t));
  const resolved = targets.filter((n): n is string => n !== null);
  return resolved.length > 0 ? resolved : null;
}

export interface EmittedWeapon {
  name: string;
  attack: number;
  sharpness: number[] | undefined;
  sharpness_plus: number[] | undefined;
  affinity: string;
  slots: number;
  bonus: string | null;
  rarity: number;
  type: WeaponTypeName | null;
  create_cost: number | null;
  improve_cost: number | null;
  improve_from: string | string[] | null;
  create_mats: ReturnType<typeof resolveMaterials> | null;
  improve_mats: ReturnType<typeof resolveMaterials> | null;
  improve_to: string[] | null;
  elements: EmittedElement[] | null;
  alternative_create_mats: ReturnType<typeof resolveMaterials> | null;
  /** Gunner-only fields from `emitGunnerDetails()` (emit/gunner.ts). */
  [field: string]: unknown;
}

/**
 * Extra affinity a blademaster weapon shows for its sharpness, in points,
 * indexed by `sharpnessAmount` (vallode/mhfu-blacksmith#33).
 *
 * `WepBMValues.Affinity` is the base value. The committed site values
 * add 5 points to positive affinity when `sharpnessAmount` is 4, and 10
 * when it is 5 or 6. Zero and negative affinity never change, and gunner
 * weapons have no `sharpnessAmount`. Derived by correlating every raw
 * struct on the EU disc against `data/weapons/*.json`: 106 of the 108
 * positive-affinity weapons at amount 4–6 follow it, and 52 of the 53 at
 * amount 0–3 show no bonus. No other struct field (rarity, the unknown bytes)
 * separates the cases. This is a correlation, not a read of the game's
 * code, so the table holds only the amounts seen.
 */
const SHARPNESS_AFFINITY_BONUS: readonly number[] = [0, 0, 0, 0, 5, 10, 10];

/** The affinity a blademaster weapon shows: base affinity plus its sharpness bonus. */
export function blademasterAffinity(affinity: number, sharpnessAmount: number): number {
  if (affinity <= 0) return affinity;
  return affinity + (SHARPNESS_AFFINITY_BONUS[sharpnessAmount] ?? 0);
}

/**
 * A weapon's `bonus`: its `Defense` byte, the defense it adds when equipped
 * (vallode/mhfu-blacksmith#32). On the EU disc it equals the committed
 * bonus of 1524 of 1527 weapons in every type; the other 3 (Crater Maker,
 * Sanctioned Gunlance and Sanctioned Gunlance G) have none on the site.
 * Bowguns are written without the sign (`"10"`), everything else with it
 * (`"+10"`), as the committed files do.
 */
export function defenseBonus(defense: number, type: WeaponTypeName | null): string | null {
  if (defense === 0) return null;
  return type === "light-bowgun" || type === "heavy-bowgun" ? String(defense) : `+${defense}`;
}

/** Gunlance shell types in `NoteGLType` order. */
const SHELL_TYPES = ["Normal", "Spread", "Long"] as const;

/**
 * A gunlance's shelling from `NoteGLType`: type `n % 3` (Normal, Spread,
 * Long), level `n / 3 + 1`. 85 of the 87 EU gunlances match the committed
 * shelling; Scissor Gunlance and Scissor Cannon G are one level higher on
 * the site than in their family's progression.
 */
export function gunlanceShelling(noteGlType: number): { type: string; level: string } {
  return { type: SHELL_TYPES[noteGlType % 3]!, level: String(Math.floor(noteGlType / 3) + 1) };
}

/** A horn's notes from `NoteGLType`, an index into the note-set table (tables/horn.ts). */
export function hornNotes(noteSets: string[][], noteGlType: number): string[] {
  const notes = noteSets[noteGlType];
  if (!notes) throw new Error(`NoteGLType ${noteGlType} is past the note-set table.`);
  return notes;
}

export interface EmittedMelody {
  combo: string[];
  effect: string;
  description: string | null;
  duration: string | null;
  extended_effect: string | null;
  extended_duration: string | null;
}

/** A horn's melody list: the songs its notes can play, with the effect text from the overlay. */
export function emitMelodies(songs: Song[], notes: string[]): EmittedMelody[] {
  return songsForNotes(songs, notes).map((song) => {
    const { id: _id, ...effect } = melodyEffect(song.effectId);
    return { combo: song.notes, ...effect };
  });
}

/** Adds `melodies` to every emitted horn, from `game_task.ovl`'s melody table. */
export function attachHornMelodies(weapons: EmittedWeapon[], gameTask: BinaryReader): void {
  const songs = readMelodyTable(gameTask);
  for (const w of weapons) {
    if (w.type === "hunting-horn" && Array.isArray(w.notes)) {
      w.melodies = emitMelodies(songs, w.notes as string[]);
    }
  }
}

export function emitBlademasterWeapons(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): EmittedWeapon[] {
  const weapons = readBlademasterWeapons(reader, resolver);
  const modelToType = readModelToWeaponType(reader, resolver);
  const classMods = readWeaponClassModifiers(reader, resolver);
  const sharpnessTables = readSharpnessTables(reader, resolver);
  const create = readEquipmentCreate(reader, resolver);
  const upgrade = readEquipmentUpgrade(reader, resolver);
  const dualAttributes = dualAttributesByWeaponId(reader, resolver);
  const names = getNameResolver();
  const hasHorns = weapons.some((w) => modelToType[w.modelId] === "hunting-horn");
  const noteSets = hasHorns ? readHornNoteSets(reader) : [];

  const createByEquipId = groupEquipCreateByEquipId([
    ...create.greatSwordLongSword,
    ...create.lanceGunlance,
    ...create.swordAndShieldDualBlades,
    ...create.hammerHuntingHorn,
    ...create.ancientRustBlademaster,
  ]);
  const upgradeGraph: UpgradeGraph = {
    entries: upgrade.blademaster,
    inverted: invertUpgradeTree(upgrade.blademaster),
  };

  const classModByType: Record<WeaponTypeName, number> = {
    "great-sword": classMods.greatSword,
    "long-sword": classMods.longSword,
    "sword-and-shield": classMods.swordAndShield,
    "dual-blades": classMods.dualBlades,
    hammer: classMods.hammer,
    "hunting-horn": classMods.huntingHorn,
    lance: classMods.lance,
    gunlance: classMods.gunLance,
    "light-bowgun": classMods.lightBowgun,
    "heavy-bowgun": classMods.heavyBowgun,
    bow: classMods.bow,
  };

  const out: EmittedWeapon[] = [];
  for (const w of weapons) {
    const name = names.resolve("WepBMID", w.index);
    if (!name) continue;
    const type = modelToType[w.modelId] ?? null;
    const classMod = type ? classModByType[type] : 100;
    const typeId = type ? WEAPON_TYPE_NAMES.indexOf(type) : null;
    const sharp = emitSharpness(sharpnessTables.entryFor(typeId, w.sharpnessId), w.sharpnessAmount);

    const [primaryRecipe, altRecipe] = createByEquipId.get(w.index) ?? [];
    const upgradeEntry = upgradeGraph.entries[w.index];
    const dual = dualAttributes.get(w.index);

    out.push({
      name,
      attack: Math.round((w.attack * classMod) / 100),
      sharpness: sharp.sharpness,
      sharpness_plus: sharp.sharpnessPlus,
      affinity: `${blademasterAffinity(w.affinity, w.sharpnessAmount)}%`,
      slots: w.slots,
      bonus: defenseBonus(w.defense, type),
      rarity: displayRarity(w.rarity),
      type,
      ...(type === "hunting-horn" ? { notes: hornNotes(noteSets, w.noteGlType) } : {}),
      ...(type === "gunlance" ? { shelling: gunlanceShelling(w.noteGlType) } : {}),
      create_cost: primaryRecipe ? halveCost(w.price) : null,
      improve_cost:
        upgradeEntry && upgradeEntry.craft.some((c) => c.itemId !== 0) ? halveCost(w.price) : null,
      improve_from: resolveImproveFrom(upgradeGraph, w.index, "WepBMID", names),
      create_mats: primaryRecipe
        ? materialsOrNull(resolveMaterials(primaryRecipe.craft, names))
        : null,
      improve_mats:
        upgradeEntry && upgradeEntry.craft.some((c) => c.itemId !== 0)
          ? materialsOrNull(resolveMaterials(upgradeEntry.craft, names))
          : null,
      improve_to: resolveImproveTo(upgradeEntry, "WepBMID", names),
      elements: dual
        ? emitDualElements(dual)
        : emitElements(w.eleType, w.eleValue, w.statusType, w.statusValue),
      alternative_create_mats: altRecipe
        ? materialsOrNull(resolveMaterials(altRecipe.craft, names))
        : null,
    });
  }
  return out;
}

export function emitGunnerWeapons(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): EmittedWeapon[] {
  const weapons = readGunnerWeapons(reader, resolver);
  const modelToType = readModelToWeaponType(reader, resolver);
  const classMods = readWeaponClassModifiers(reader, resolver);
  const create = readEquipmentCreate(reader, resolver);
  const upgrade = readEquipmentUpgrade(reader, resolver);
  const names = getNameResolver();
  const gunnerTables = readGunnerTables(reader, resolver);

  const createByEquipId = groupEquipCreateByEquipId([
    ...create.lightBowgun,
    ...create.heavyBowgun,
    ...create.bow,
    ...create.ancientRustGunner,
  ]);
  const upgradeGraph: UpgradeGraph = {
    entries: upgrade.gunner,
    inverted: invertUpgradeTree(upgrade.gunner),
  };

  const classModByType: Partial<Record<WeaponTypeName, number>> = {
    "light-bowgun": classMods.lightBowgun,
    "heavy-bowgun": classMods.heavyBowgun,
    bow: classMods.bow,
  };

  const out: EmittedWeapon[] = [];
  for (const w of weapons) {
    const name = names.resolve("WepGunID", w.index);
    if (!name) continue;
    const type = modelToType[w.modelId] ?? null;
    const classMod = (type && classModByType[type]) ?? 100;

    const [primaryRecipe, altRecipe] = createByEquipId.get(w.index) ?? [];
    const upgradeEntry = upgradeGraph.entries[w.index];
    const elements = [
      ...(emitElements(w.eleType, w.eleValue, 0, 0) ?? []),
      ...(type === "bow" ? emitBowCoatingBonuses(w.shotCoatings) : []),
    ];

    out.push({
      name,
      attack: Math.round((w.attack * classMod) / 100),
      sharpness: undefined,
      sharpness_plus: undefined,
      affinity: `${w.affinity}%`,
      slots: w.slots,
      bonus: defenseBonus(w.defense, type),
      rarity: displayRarity(w.rarity),
      type,
      create_cost: primaryRecipe ? halveCost(w.price) : null,
      improve_cost:
        upgradeEntry && upgradeEntry.craft.some((c) => c.itemId !== 0) ? halveCost(w.price) : null,
      improve_from: resolveImproveFrom(upgradeGraph, w.index, "WepGunID", names),
      create_mats: primaryRecipe
        ? materialsOrNull(resolveMaterials(primaryRecipe.craft, names))
        : null,
      improve_mats:
        upgradeEntry && upgradeEntry.craft.some((c) => c.itemId !== 0)
          ? materialsOrNull(resolveMaterials(upgradeEntry.craft, names))
          : null,
      improve_to: resolveImproveTo(upgradeEntry, "WepGunID", names),
      elements: elements.length > 0 ? elements : null,
      alternative_create_mats: altRecipe
        ? materialsOrNull(resolveMaterials(altRecipe.craft, names))
        : null,
      ...emitGunnerDetails(w, type, classMod, gunnerTables),
    });
  }
  return out;
}
