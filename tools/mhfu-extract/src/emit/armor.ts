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
 * `sex`/`hunter_type`/`hr`/`elder` are skipped entirely: none of the fields
 * on `ArmorValueEntry` (`hunterType`, `maleId`/`femaleId` equality) were
 * found to correlate with the committed data's `sex`/`hunter_type` values
 * (see git history), and `hr`/`elder` unlock requirements aren't present in
 * this struct at all. All four are optional in the schema.
 */
import { ARMOR_SLOTS, readArmorValues, type ArmorSlot, type ArmorValueEntry } from "../tables/armor.js";
import { readEquipmentCreate, type EquipCreateEntry } from "../tables/recipes.js";
import type { TableAddressResolver } from "../tables/resolver.js";
import { getNameResolver, type NameTable } from "../strings/names.js";
import type { BinaryReader } from "../binary/reader.js";
import { displayRarity, groupEquipCreateByEquipId, halveCost, materialsOrNull, rankFromRarity, resolveMaterials, type Rank } from "./common.js";

const SLOT_TO_ARMOR_TYPE: Record<ArmorSlot, "helmet" | "plate" | "gauntlets" | "waist" | "leggings"> = {
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
  create_cost: number | null;
  skills: EmittedSkill[] | null;
  create_mats: ReturnType<typeof resolveMaterials> | null;
}

function emitSlot(
  armorValues: ArmorValueEntry[],
  slot: ArmorSlot,
  createByEquipId: Map<number, EquipCreateEntry[]>
): EmittedArmor[] {
  const names = getNameResolver();
  const nameTable = SLOT_TO_NAME_TABLE[slot];

  const out: EmittedArmor[] = [];
  for (const armor of armorValues) {
    const name = names.resolve(nameTable, armor.index);
    if (!name) continue;
    // The schema caps slots at 3. The absurd slot counts (10-65) once seen
    // at the end of "headArmor" were the leggings array read 16 entries past
    // its end, before the pointer-order fix. Kept as a guard so a bad read
    // is dropped rather than emitted.
    if (armor.slots > 3) continue;

    const skills = armor.skills
      .filter((s) => s.skill !== 0)
      .map((s) => ({ name: names.resolve("SkillID", s.skill) ?? `Skill${s.skill}`, amount: s.amount }));

    const [primaryRecipe] = createByEquipId.get(armor.index) ?? [];
    const createMats = primaryRecipe ? resolveMaterials(primaryRecipe.craft, names, "armor") : [];

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
      create_cost: primaryRecipe ? halveCost(armor.price) : null,
      skills: skills.length > 0 ? skills : null,
      create_mats: materialsOrNull(createMats),
    });
  }
  return out;
}

export function emitArmor(reader: BinaryReader, resolver?: TableAddressResolver): Record<ArmorSlot, EmittedArmor[]> {
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
