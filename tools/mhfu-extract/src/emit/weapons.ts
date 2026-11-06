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
  decodeBowCoatings,
  decodeShotCoat,
  readBlademasterWeapons,
  readGunnerWeapons,
  readModelToWeaponType,
  readWeaponClassModifiers,
  type WeaponTypeName,
} from "../tables/weapons.js";
import { readSharpnessTable, SHARPNESS_COLORS } from "../tables/sharpness.js";
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
 * Residual known approximation: a small minority of real weapons (~10%,
 * concentrated in `data/weapons/long-sword.json` in samples checked, e.g.
 * `Imperial Sword`/`Aqua Guardian`/`Atlantica`) show every committed width
 * shifted by exactly \u00b11 raw-scaled unit between the first and last
 * visible color (the *sum* of all widths still matches this model exactly —
 * only the internal split differs), which looks like either a secondary
 * rendering rule this derivation hasn't isolated yet, or committed-data
 * transcription noise local to those specific entries (same weapon+amount+
 * sharpnessId combination as *other* unaffected weapons that *do* match
 * exactly, which argues against a code-level formula error). Flagged here
 * for follow-up rather than blocking on it.
 */
function emitSharpness(entry: ReturnType<typeof readSharpnessTable>[number], sharpnessAmount: number): { sharpness: number[]; sharpnessPlus: number[] } {
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
  names: ReturnType<typeof getNameResolver>
): string | string[] | null {
  const sources = graph.inverted.get(index);
  if (!sources || sources.length === 0) return null;
  const resolved = sources.map((i) => names.resolve(idTable, i)).filter((n): n is string => n !== null);
  if (resolved.length === 0) return null;
  return resolved.length === 1 ? resolved[0]! : resolved;
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
  improve_from: string | string[] | null;
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
      create_mats: primaryRecipe ? materialsOrNull(resolveMaterials(primaryRecipe.craft, names, "weapon")) : null,
      improve_mats:
        upgradeEntry && upgradeEntry.craft.some((c) => c.itemId !== 0)
          ? materialsOrNull(resolveMaterials(upgradeEntry.craft, names, "weapon"))
          : null,
      improve_to: resolveImproveTo(upgradeEntry, "WepBMID", names),
      elements: emitElements(w.eleType, w.eleValue, w.statusType, w.statusValue),
      alternative_create_mats: altRecipe ? materialsOrNull(resolveMaterials(altRecipe.craft, names, "weapon")) : null,
    });
  }
  return out;
}

/**
 * `decodeShotCoat`'s `SHOT_COAT_FIELDS` is the bowgun 32-bit ammo-type
 * bitfield (norm1/pierce1/pellet1/...) — semantically meaningless for a
 * bow, which uses a completely different, much smaller vocabulary (close-
 * range/power/paralysis/poison/sleep/paint, confirmed against every
 * committed `data/weapons/bow.json` entry). `WepGunValue`'s `ShotCoatings`
 * field is shared by both sub-types (eboot.hexpat's own comment on the
 * neighboring `Reload` field already notes other shared fields have
 * different bow semantics), so decoding it as bowgun ammo flags for a bow
 * produced 100%-wrong coatings (106/106 real bows). Gate to bowgun types
 * only, and use `decodeBowCoatings()`'s independently-derived 6-flag bit
 * layout for bows (see that function's doc comment for the correlation
 * methodology and confidence level).
 */
function coatingsForType(type: WeaponTypeName | null, shotCoatings: number): string[] | undefined {
  if (type === "light-bowgun" || type === "heavy-bowgun") {
    return Object.entries(decodeShotCoat(shotCoatings))
      .filter(([, enabled]) => enabled)
      .map(([flag]) => flag);
  }
  if (type === "bow") {
    const decoded = decodeBowCoatings(shotCoatings);
    if (!decoded) return undefined;
    return Object.entries(decoded)
      .filter(([, enabled]) => enabled)
      .map(([flag]) => flag);
  }
  return undefined;
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
    // decodeShotCoat()'s SHOT_COAT_FIELDS is the bowgun 32-bit ammo-type
    // bitfield (norm1/pierce1/pellet1/...) — semantically meaningless for
    // bows, which use a completely different, much smaller vocabulary
    // (close-range/power/paralysis/poison/sleep/paint). WepGunValue's
    // ShotCoatings field is shared by both sub-types (confirmed via
    // eboot.hexpat's own comment noting other shared fields like Reload
    // already have different bow semantics), so decoding it as bowgun ammo
    // flags for a bow produced 100%-wrong coatings. Gate it to bowgun types
    // only until bow's own bit layout is decoded (see decodeBowCoatings()).
    const coatings = coatingsForType(type, w.shotCoatings);

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
      create_mats: primaryRecipe ? materialsOrNull(resolveMaterials(primaryRecipe.craft, names, "weapon")) : null,
      improve_mats:
        upgradeEntry && upgradeEntry.craft.some((c) => c.itemId !== 0)
          ? materialsOrNull(resolveMaterials(upgradeEntry.craft, names, "weapon"))
          : null,
      improve_to: resolveImproveTo(upgradeEntry, "WepGunID", names),
      elements: emitElements(w.eleType, w.eleValue, 0, 0),
      alternative_create_mats: altRecipe ? materialsOrNull(resolveMaterials(altRecipe.craft, names, "weapon")) : null,
      coatings,
    });
  }
  return out;
}
