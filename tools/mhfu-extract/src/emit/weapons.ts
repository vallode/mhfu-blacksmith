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
 * Deliberately **not** emitted this pass (out of scope — no confirmed
 * derivation yet): Hunting Horn's hidden `bonus` attack stat and Gunlance's
 * `shelling` type/level (both packed into the shared `NoteGLType` byte, but
 * its exact decode isn't nailed down), and every gunner-specific ammo/
 * capacity/coating detail (`ammo`, `shots`, `rapid_fire`, `coatings`,
 * `reload`, `recoil` display strings) — `bowgunShotTable`/`bowChargeTable`/
 * `bowgunModTable` aren't read by any tables/*.ts reader yet. `notes` is
 * also not emitted (its committed content looks hand-written, not
 * disc-derived). These all come through as `null`/omitted, which the
 * loosely-typed weapon schema (`additionalProperties: true`) allows.
 */
import {
  decodeShotCoat,
  readBlademasterWeapons,
  readGunnerWeapons,
  readModelToWeaponType,
  readWeaponClassModifiers,
  type WeaponTypeName,
} from "../tables/weapons.js";
import { readSharpnessTable, sharpnessStepWidths } from "../tables/sharpness.js";
import { readEquipmentCreate, readEquipmentUpgrade, invertUpgradeTree, type EquipUpgradeEntry } from "../tables/recipes.js";
import type { TableAddressResolver } from "../tables/resolver.js";
import { getNameResolver, type NameTable } from "../strings/names.js";
import type { BinaryReader } from "../binary/reader.js";
import {
  displayRarity,
  groupEquipCreateByEquipId,
  halveCost,
  materialsOrNull,
  resolveMaterials,
} from "./common.js";

const ELEMENT_NAMES: Record<number, string> = { 1: "Fire", 2: "Water", 3: "Thunder", 4: "Dragon", 5: "Ice" };
const STATUS_NAMES: Record<number, string> = { 1: "Poison", 2: "Paralysis", 3: "Sleep" };

/** Raw element/status values are stored as true-value/10 (confirmed against ~170 real elemental weapons, zero exceptions). */
const ELEMENT_VALUE_SCALE = 10;

export interface EmittedElement {
  name: string;
  attack: number;
}

function emitElements(eleType: number, eleValue: number, statusType: number, statusValue: number): EmittedElement[] | null {
  const elements: EmittedElement[] = [];
  const eleName = ELEMENT_NAMES[eleType];
  if (eleName) elements.push({ name: eleName, attack: eleValue * ELEMENT_VALUE_SCALE });
  const statusName = STATUS_NAMES[statusType];
  if (statusName) elements.push({ name: statusName, attack: statusValue * ELEMENT_VALUE_SCALE });
  return elements.length > 0 ? elements : null;
}

/**
 * Sharpness display width per color, scaled from the raw cumulative table
 * by `/10` (matches the `attack`-style scaling seen elsewhere) and sliced
 * to `sharpnessAmount + 3` visible colors (`SharpnessAmount` is documented
 * in eboot.hexpat as "Visible Sharpness Steps (0-6)"; empirically, real
 * committed sharpness array lengths cluster tightly around
 * `sharpnessAmount + 3`, e.g. amount=0 -> length 3, amount=6 -> length 7).
 *
 * Known approximation: the *last* visible color's width sometimes differs
 * slightly from the committed value (the true rule for exactly where a
 * weapon's displayed bar gets cut off inside its last color isn't nailed
 * down yet) — earlier colors have matched exactly in every real sample
 * checked. Good enough to ship; flagged here for follow-up.
 */
function emitSharpness(cumulative: ReturnType<typeof readSharpnessTable>[number], sharpnessAmount: number): { sharpness: number[]; sharpnessPlus: number[] } {
  const widths = sharpnessStepWidths(cumulative);
  const scaled = Object.values(widths).map((w) => Math.round(w / ELEMENT_VALUE_SCALE));
  const visibleCount = Math.min(Math.max(sharpnessAmount + 3, 1), scaled.length);
  const plusCount = Math.min(visibleCount + 1, scaled.length);
  return { sharpness: scaled.slice(0, visibleCount), sharpnessPlus: scaled.slice(0, plusCount) };
}

interface UpgradeGraph {
  entries: EquipUpgradeEntry[];
  inverted: Map<number, number[]>;
}

function resolveImproveFrom(graph: UpgradeGraph, index: number, idTable: NameTable, names: ReturnType<typeof getNameResolver>): string[] | null {
  const sources = graph.inverted.get(index);
  if (!sources || sources.length === 0) return null;
  const resolved = sources.map((i) => names.resolve(idTable, i)).filter((n): n is string => n !== null);
  return resolved.length > 0 ? resolved : null;
}

function resolveImproveTo(entry: EquipUpgradeEntry | undefined, idTable: NameTable, names: ReturnType<typeof getNameResolver>): string[] | null {
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
  bonus: null;
  rarity: number;
  type: WeaponTypeName | null;
  create_cost: number | null;
  improve_cost: number | null;
  improve_from: string[] | null;
  create_mats: ReturnType<typeof resolveMaterials> | null;
  improve_mats: ReturnType<typeof resolveMaterials> | null;
  improve_to: string[] | null;
  elements: EmittedElement[] | null;
  alternative_create_mats: ReturnType<typeof resolveMaterials> | null;
  coatings?: string[];
}

export function emitBlademasterWeapons(reader: BinaryReader, resolver?: TableAddressResolver): EmittedWeapon[] {
  const weapons = readBlademasterWeapons(reader, resolver);
  const modelToType = readModelToWeaponType(reader, resolver);
  const classMods = readWeaponClassModifiers(reader, resolver);
  const sharpnessTable = readSharpnessTable(reader, resolver);
  const create = readEquipmentCreate(reader, resolver);
  const upgrade = readEquipmentUpgrade(reader, resolver);
  const names = getNameResolver();

  const createByEquipId = groupEquipCreateByEquipId([
    ...create.greatSwordLongSword,
    ...create.lanceGunlance,
    ...create.swordAndShieldDualBlades,
    ...create.hammerHuntingHorn,
    ...create.ancientRustBlademaster,
  ]);
  const upgradeGraph: UpgradeGraph = { entries: upgrade.blademaster, inverted: invertUpgradeTree(upgrade.blademaster) };

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
    const sharp = emitSharpness(sharpnessTable[w.sharpnessId]!, w.sharpnessAmount);

    const [primaryRecipe, altRecipe] = createByEquipId.get(w.index) ?? [];
    const upgradeEntry = upgradeGraph.entries[w.index];

    out.push({
      name,
      attack: Math.round((w.attack * classMod) / 100),
      sharpness: sharp.sharpness,
      sharpness_plus: sharp.sharpnessPlus,
      affinity: `${w.affinity}%`,
      slots: w.slots,
      bonus: null,
      rarity: displayRarity(w.rarity),
      type,
      create_cost: primaryRecipe ? halveCost(w.price) : null,
      improve_cost: upgradeEntry && upgradeEntry.craft.some((c) => c.itemId !== 0) ? halveCost(w.price) : null,
      improve_from: resolveImproveFrom(upgradeGraph, w.index, "WepBMID", names),
      create_mats: primaryRecipe ? materialsOrNull(resolveMaterials(primaryRecipe.craft, names)) : null,
      improve_mats:
        upgradeEntry && upgradeEntry.craft.some((c) => c.itemId !== 0)
          ? materialsOrNull(resolveMaterials(upgradeEntry.craft, names))
          : null,
      improve_to: resolveImproveTo(upgradeEntry, "WepBMID", names),
      elements: emitElements(w.eleType, w.eleValue, w.statusType, w.statusValue),
      alternative_create_mats: altRecipe ? materialsOrNull(resolveMaterials(altRecipe.craft, names)) : null,
    });
  }
  return out;
}

export function emitGunnerWeapons(reader: BinaryReader, resolver?: TableAddressResolver): EmittedWeapon[] {
  const weapons = readGunnerWeapons(reader, resolver);
  const modelToType = readModelToWeaponType(reader, resolver);
  const classMods = readWeaponClassModifiers(reader, resolver);
  const create = readEquipmentCreate(reader, resolver);
  const upgrade = readEquipmentUpgrade(reader, resolver);
  const names = getNameResolver();

  const createByEquipId = groupEquipCreateByEquipId([
    ...create.lightBowgun,
    ...create.heavyBowgun,
    ...create.bow,
    ...create.ancientRustGunner,
  ]);
  const upgradeGraph: UpgradeGraph = { entries: upgrade.gunner, inverted: invertUpgradeTree(upgrade.gunner) };

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
    const coatings = Object.entries(decodeShotCoat(w.shotCoatings))
      .filter(([, enabled]) => enabled)
      .map(([flag]) => flag);

    out.push({
      name,
      attack: Math.round((w.attack * classMod) / 100),
      sharpness: undefined,
      sharpness_plus: undefined,
      affinity: `${w.affinity}%`,
      slots: w.slots,
      bonus: null,
      rarity: displayRarity(w.rarity),
      type,
      create_cost: primaryRecipe ? halveCost(w.price) : null,
      improve_cost: upgradeEntry && upgradeEntry.craft.some((c) => c.itemId !== 0) ? halveCost(w.price) : null,
      improve_from: resolveImproveFrom(upgradeGraph, w.index, "WepGunID", names),
      create_mats: primaryRecipe ? materialsOrNull(resolveMaterials(primaryRecipe.craft, names)) : null,
      improve_mats:
        upgradeEntry && upgradeEntry.craft.some((c) => c.itemId !== 0)
          ? materialsOrNull(resolveMaterials(upgradeEntry.craft, names))
          : null,
      improve_to: resolveImproveTo(upgradeEntry, "WepGunID", names),
      elements: emitElements(w.eleType, w.eleValue, 0, 0),
      alternative_create_mats: altRecipe ? materialsOrNull(resolveMaterials(altRecipe.craft, names)) : null,
      coatings,
    });
  }
  return out;
}
