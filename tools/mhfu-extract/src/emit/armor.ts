/**
 * Maps raw `ArmorValue` structs onto the `data/armor/*.json` schema shape.
 *
 * Direct array-index naming (ArmorValues[i] <-> e.g. HeadArmorID[i]) is the
 * design eboot.hexpat documents, and it holds exactly for the first ~10
 * entries per slot we spot-checked (defense/price/rarity/slots all agree
 * with the committed data). Beyond that it drifts — the committed EN data
 * and this direct indexing disagree on roughly 60-75% of entries per slot,
 * consistent with either extra JP-only armor pieces the EN name enum never
 * accounted for, or historical transcription drift in the committed data.
 * We were unable to find a consistent correction (the drift isn't a fixed
 * offset — see git history for the investigation), so we emit strictly
 * by-index here and rely on the future `diff` tool to surface disagreements
 * against the committed files for manual review, rather than guessing.
 *
 * `sex`/`hunter_type`/`hr`/`elder` are skipped entirely: none of the fields
 * on `ArmorValueEntry` (`hunterType`, `maleId`/`femaleId` equality) were
 * found to correlate with the committed data's `sex`/`hunter_type` values
 * (see git history), and `hr`/`elder` unlock requirements aren't present in
 * this struct at all. All four are optional in the schema.
 */
import { ARMOR_SLOTS, readArmorValues, type ArmorSlot, type ArmorValueEntry } from "../tables/armor.js";
import { readEquipmentCreate, type EquipCreateEntry } from "../tables/recipes.js";
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
    // The schema caps slots at 3 (no real armor piece has more); a handful
    // of tail entries in headArmor specifically (5 of 436, all in the last
    // ~15 slots) read absurd slot counts (seen: 10-65), which looks like
    // reused/repurposed bytes rather than a real armor piece — skip rather
    // than emit obviously-corrupt data.
    if (armor.slots > 3) continue;

    const skills = armor.skills
      .filter((s) => s.skill !== 0)
      .map((s) => ({ name: names.resolve("SkillID", s.skill) ?? `Skill${s.skill}`, amount: s.amount }));

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
      create_cost: primaryRecipe ? halveCost(armor.price) : null,
      skills: skills.length > 0 ? skills : null,
      create_mats: materialsOrNull(createMats),
    });
  }
  return out;
}

export function emitArmor(reader: BinaryReader): Record<ArmorSlot, EmittedArmor[]> {
  const armorValues = readArmorValues(reader);
  const create = readEquipmentCreate(reader);
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
