/**
 * Maps raw `ArmorValue` structs onto the `data/armor/*.json` schema shape.
 *
 * Naming is direct array-index: `ArmorValues.head[i]` is `HeadArmorID[i]`,
 * and its recipe is the `EquipmentCreateTable.head` entry with
 * `equipId === i`. This only holds once `tables/armor.ts` reads each slot
 * from the right `ArmorValuePTR` pointer (`ARMOR_POINTER_INDEX`). Before
 * that fix every slot read the next slot's array, so index-naming looked
 * like it "drifted" (vallode/mhfu-blacksmith#30): a helmet name sat on a
 * leggings stat block, and set pieces share defense, resistances, rarity
 * and price, which made the mismatch look like a reordering. The
 * fingerprint-derived `armor-index-corrections.json` and
 * `armor-slots-corrections.json` overlays that papered over it were removed
 * with the fix: 1285 of their 1291 index remaps and all 16 "male/female
 * slots transpositions" are exactly the rotated slot's piece at the same
 * index (e.g. the Vespoid Helm "remap" was Vespoid Greaves, which has the
 * Helm's stats).
 *
 * **`sex`/`hunter_type`** come from `HunterType`, a bit field: 1 male,
 * 2 female, 4 Blademaster, 8 Gunner (`HUNTER_TYPE_BITS`). Its values on the
 * EU disc are 15 (anyone), 7/11 (Blademaster/Gunner only), 13/14 (male/
 * female only) and 5/6/9/10 (both restrictions). An earlier check found no
 * correlation, but it ran before vallode/mhfu-blacksmith#61, when every slot
 * read the next slot's array. Matched by game ID, the disc agrees with all
 * 1820 committed `hunter_type` and all 1820 committed `sex` values. Male-
 * or female-only pieces also have a 0 `femaleId`/`maleId` model.
 *
 * **Max defence.** `ArmorSphereCaps` holds seven cumulative max levels, one
 * per upgrade tier: Armor Sphere, Armor Sphere+, Hard, Heavy, Royal, True,
 * and a second True tier (`truMax`). The armor sphere `EquipUpgrade`
 * entries (tables/recipes.ts) have seven tiers too, and the last two both
 * take a True Armor Sphere (item 228): the seventh tier is the levels that
 * open after Ukanlos is beaten. A piece starts at level 1 and every level
 * adds `DEFENCE_PER_LEVEL` (2). No per-level table was found near the
 * armor or upgrade tables, so the +2 is the community figure, checked
 * against published level tables:
 * - Hunter's S (Blademaster) set: 190 initial, 540 max (Monster Hunter
 *   Wiki): 5 × 38 and 5 × (38 + 2 × 35), `truMax` = 36.
 * - Ukanlos (Blademaster) series (MHP2G@Wiki): LV2 102 to LV9 116, Hard
 *   at LV2, Heavy LV3, Royal LV4-7, True LV8-9; the disc's Dark Ukanlos
 *   Mask is base 100, caps 1/1/2/3/7/8/9.
 * - Kirin (Blade) set: Armor Sphere to LV4, Sphere+ LV5-11, Hard LV12 at
 *   66 (Monster Hunter Wiki); the disc's Kirin Horn is base 44, caps
 *   4/11/12/...
 * `max_defence` uses `truMax`, `max_defence_pre_ukanlos` the sixth cap.
 *
 * `hr`/`elder` unlock requirements aren't in this struct and stay as
 * committed. All four of `sex`/`hunter_type`/`hr`/`elder` are optional in
 * the schema.
 */
import {
  ARMOR_SLOTS,
  readArmorValues,
  type ArmorSlot,
  type ArmorValueEntry,
} from "../tables/armor.js";
import { readEquipmentCreate, type EquipCreateEntry } from "../tables/recipes.js";
import type { TableAddressResolver } from "../tables/resolver.js";
import { getNameResolver, type NameTable } from "../strings/names.js";
import type { BinaryReader } from "../binary/reader.js";
import {
  displayRarity,
  groupEquipCreateByEquipId,
  halveCost,
  materialsOrNull,
  rankFromRarity,
  resolveMaterials,
  type Rank,
} from "./common.js";

const SLOT_TO_ARMOR_TYPE: Record<
  ArmorSlot,
  "helmet" | "plate" | "gauntlets" | "waist" | "leggings"
> = {
  head: "helmet",
  chest: "plate",
  arm: "gauntlets",
  waist: "waist",
  leg: "leggings",
};

const SLOT_TO_NAME_TABLE: Record<ArmorSlot, NameTable> = {
  head: "HeadArmorID",
  chest: "ChestArmorID",
  arm: "ArmArmorID",
  waist: "WaistArmorID",
  leg: "LegArmorID",
};

/** `ArmorValue.HunterType` bits. */
export const HUNTER_TYPE_BITS = { male: 1, female: 2, blademaster: 4, gunner: 8 } as const;

/** Defence gained per upgrade level (see the module comment for the sources). */
export const DEFENCE_PER_LEVEL = 2;

export type ArmorSex = "Male/Female" | "Male" | "Female";
export type ArmorHunterType = "Blademaster/Gunner" | "Blademaster" | "Gunner";

function pair<T extends string>(a: boolean, b: boolean, both: T, onlyA: T, onlyB: T): T | null {
  if (a && b) return both;
  if (a) return onlyA;
  if (b) return onlyB;
  return null;
}

/** `sex` from `HunterType`, or null when neither sex bit is set (the dummy entries). */
export function sexFromHunterType(bits: number): ArmorSex | null {
  const { male, female } = HUNTER_TYPE_BITS;
  return pair<ArmorSex>(!!(bits & male), !!(bits & female), "Male/Female", "Male", "Female");
}

/** `hunter_type` from `HunterType`, or null when neither class bit is set. */
export function hunterTypeFromBits(bits: number): ArmorHunterType | null {
  const { blademaster, gunner } = HUNTER_TYPE_BITS;
  return pair<ArmorHunterType>(
    !!(bits & blademaster),
    !!(bits & gunner),
    "Blademaster/Gunner",
    "Blademaster",
    "Gunner",
  );
}

/** Defence at `maxLevel`, starting from `defense` at level 1. */
export function defenceAtLevel(defense: number, maxLevel: number): number {
  return defense + DEFENCE_PER_LEVEL * Math.max(0, maxLevel - 1);
}

export interface EmittedSkill {
  name: string;
  amount: number;
}

export interface EmittedArmor {
  name: string;
  type: "helmet" | "plate" | "gauntlets" | "waist" | "leggings";
  rank: Rank;
  rarity: number;
  slots: number;
  defence: number;
  fire_res: number;
  thunder_res: number;
  dragon_res: number;
  water_res: number;
  ice_res: number;
  sex: ArmorSex | null;
  hunter_type: ArmorHunterType | null;
  /** Defence at the highest level, after Ukanlos (`truMax`). */
  max_defence: number;
  /** Defence at the highest level before Ukanlos (the sixth sphere cap). */
  max_defence_pre_ukanlos: number;
  create_cost: number | null;
  skills: EmittedSkill[] | null;
  create_mats: ReturnType<typeof resolveMaterials> | null;
}

function emitSlot(
  armorValues: ArmorValueEntry[],
  slot: ArmorSlot,
  createByEquipId: Map<number, EquipCreateEntry[]>,
): EmittedArmor[] {
  const names = getNameResolver();
  const nameTable = SLOT_TO_NAME_TABLE[slot];

  const out: EmittedArmor[] = [];
  for (const armor of armorValues) {
    const name = names.resolve(nameTable, armor.index);
    if (!name) continue;
    // The schema caps slots at 3. The absurd slot counts (10-65) once seen
    // at the end of "headArmor" were the leggings array read 16 entries past
    // its end, before the pointer-order fix; no entry on a real EU EBOOT
    // trips this now. Kept as a guard so a bad read is dropped rather than
    // emitted.
    if (armor.slots > 3) continue;

    const skills = armor.skills
      .filter((s) => s.skill !== 0)
      .map((s) => ({
        name: names.resolve("SkillID", s.skill) ?? `Skill${s.skill}`,
        amount: s.amount,
      }));

    const [primaryRecipe] = createByEquipId.get(armor.index) ?? [];
    const createMats = primaryRecipe ? resolveMaterials(primaryRecipe.craft, names) : [];

    out.push({
      name,
      type: SLOT_TO_ARMOR_TYPE[slot],
      rank: rankFromRarity(displayRarity(armor.rarity)),
      rarity: displayRarity(armor.rarity),
      slots: armor.slots,
      defence: armor.defense,
      fire_res: armor.resistances.fire,
      thunder_res: armor.resistances.thunder,
      dragon_res: armor.resistances.dragon,
      water_res: armor.resistances.water,
      ice_res: armor.resistances.ice,
      sex: sexFromHunterType(armor.hunterType),
      hunter_type: hunterTypeFromBits(armor.hunterType),
      max_defence: defenceAtLevel(armor.defense, armor.sphereCaps.truMax),
      max_defence_pre_ukanlos: defenceAtLevel(armor.defense, armor.sphereCaps.truArmorSphere),
      create_cost: primaryRecipe ? halveCost(armor.price) : null,
      skills: skills.length > 0 ? skills : null,
      create_mats: materialsOrNull(createMats),
    });
  }
  return out;
}

export function emitArmor(
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): Record<ArmorSlot, EmittedArmor[]> {
  const armorValues = readArmorValues(reader, resolver);
  const create = readEquipmentCreate(reader, resolver);
  const createByEquipId: Record<ArmorSlot, Map<number, EquipCreateEntry[]>> = {
    head: groupEquipCreateByEquipId(create.head),
    chest: groupEquipCreateByEquipId(create.chest),
    arm: groupEquipCreateByEquipId(create.arm),
    waist: groupEquipCreateByEquipId(create.waist),
    leg: groupEquipCreateByEquipId(create.leg),
  };

  const result = {} as Record<ArmorSlot, EmittedArmor[]>;
  for (const slot of ARMOR_SLOTS) {
    result[slot] = emitSlot(armorValues[slot], slot, createByEquipId[slot]);
  }
  return result;
}
