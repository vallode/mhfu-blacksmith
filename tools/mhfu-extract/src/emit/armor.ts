/**
 * Maps raw `ArmorValue` structs onto the `data/armor/*.json` schema shape.
 *
 * Direct array-index naming (ArmorValues[i] <-> e.g. HeadArmorID[i]) is the
 * design eboot.hexpat documents, and it holds exactly for the first ~10
 * entries per slot we spot-checked (defense/price/rarity/slots all agree
 * with the committed data). Beyond that it drifts — the committed EN data
 * and this direct indexing disagree on roughly 60-90% of entries per slot.
 * Confirmed (see vallode/mhfu-blacksmith#30 and its "resolved" update):
 * `ArmorValue`'s three unmapped fields (`unkn1`/`unkn2`/`unkn3`) are NOT a
 * hidden name-table index — tested directly against real disc bytes,
 * `unkn3` (the only one with per-entry-unique values) does not correlate
 * with committed stats when used as a name index. There is no known
 * in-binary field linking the two independently-sourced lists (stat array
 * position vs. `.enum`-file name order). A structural root cause (a real
 * permutation table, or a derivable sort-order rule) was searched for and
 * not found — see vallode/mhfu-blacksmith#30. The fix applied here is
 * `overlay/armor-index-corrections.ts`'s empirically-derived per-slot
 * correction table (fingerprint-matched raw stats <-> committed data),
 * which now resolves a solid majority (~68-73%) of entries per slot with
 * high confidence; the remainder still falls back to raw-position naming
 * and may be wrong. See that module's doc comment for full methodology and
 * known coverage limits.
 *
 * `slots` additionally goes through `overlay/armor-slots-corrections.ts`:
 * a small, separate bug where raw `slots` is transposed between certain
 * male/female armor pairs (e.g. "X Helm"/"X Cap") even though every other
 * field is already correctly identified via the name-index correction
 * above. Only 8 pairs (16 items) across all 5 slots are confirmed-clean
 * transpositions and corrected; see that module's doc comment for the
 * pairing/verification methodology and why the fix is deliberately narrow.
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
import { correctedArmorNameIndex } from "../overlay/armor-index-corrections.js";
import { correctedArmorSlots } from "../overlay/armor-slots-corrections.js";
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
    const nameIndex = correctedArmorNameIndex(slot, armor.index);
    if (nameIndex === null) continue;
    const name = names.resolve(nameTable, nameIndex);
    if (!name) continue;
    const slots = correctedArmorSlots(slot, armor.index, armor.slots);
    // The schema caps slots at 3 (no real armor piece has more); a handful
    // of tail entries in headArmor specifically (5 of 436, all in the last
    // ~15 slots) read absurd slot counts (seen: 10-65), which looks like
    // reused/repurposed bytes rather than a real armor piece — skip rather
    // than emit obviously-corrupt data.
    if (slots > 3) continue;

    const skills = armor.skills
      .filter((s) => s.skill !== 0)
      .map((s) => ({ name: names.resolve("SkillID", s.skill) ?? `Skill${s.skill}`, amount: s.amount }));

    const [primaryRecipe] = createByEquipId.get(nameIndex) ?? [];
    const createMats = primaryRecipe ? resolveMaterials(primaryRecipe.craft, names, "armor") : [];

    out.push({
      name,
      type: SLOT_TO_ARMOR_TYPE[slot],
      rank: rankFromRarity(displayRarity(armor.rarity)),
      rarity: displayRarity(armor.rarity),
      slots,
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
