/**
 * Maps raw decoration tables onto `data/decorations.json`'s schema shape.
 *
 * Confirmed end-to-end against a real JP EBOOT + the committed
 * `data/decorations.json` (166/169 decorations name-resolved; of those,
 * rarity matched 166/166, skills 139/166 exactly with the rest differing
 * only in enum-vs-legacy-site abbreviation spelling — e.g. our "Reload"
 * vs. the site's "Load" for the same SkillID — not value, cost 164/166).
 */
import { readDecorationSkills, readDecorationValues, resolveDecorationSkill } from "../tables/decorations.js";
import { readEquipmentCreate } from "../tables/recipes.js";
import { getNameResolver } from "../strings/names.js";
import { resolveDecorationCategory } from "../overlay/decoration-categories.js";
import { resolveMaterialStyle } from "../overlay/materials.js";
import type { BinaryReader } from "../binary/reader.js";
import {
  displayRarity,
  formatSignedAmount,
  groupEquipCreateByEquipId,
  halveCost,
  materialsOrNull,
  resolveMaterials,
} from "./common.js";

export interface EmittedDecoration {
  name: string;
  skills: string[];
  create_mats: ReturnType<typeof resolveMaterials> | null;
  color: string;
  slots: number;
  rarity: number;
  create_cost: number;
  type: "decoration";
  alternative_create_mats: ReturnType<typeof resolveMaterials> | null;
  category: string;
}

/** DecorationValues -> ItemID index offset (see tables/decorations.ts). */
const DECORATION_ITEM_ID_OFFSET = 948;

export function emitDecorations(reader: BinaryReader): EmittedDecoration[] {
  const decoValues = readDecorationValues(reader);
  const decoSkillTable = readDecorationSkills(reader);
  const create = readEquipmentCreate(reader);
  const createByEquipId = groupEquipCreateByEquipId(create.decoration);
  const names = getNameResolver();

  const out: EmittedDecoration[] = [];
  for (const deco of decoValues) {
    const itemId = deco.index + DECORATION_ITEM_ID_OFFSET;
    const name = names.resolve("ItemID", itemId);
    if (!name) continue; // dummy/placeholder slot, nothing to emit

    const skillEntry = resolveDecorationSkill(decoSkillTable, deco.skillTblId);
    // skillTblId=0 means "unset" (seen on exactly one real disc entry, the
    // very last decoration slot) — with no skill/slot data at all a
    // decoration isn't a valid, useful entry (slots would be 0, impossible
    // for a real jewel), so skip it rather than emit a bogus one.
    if (!skillEntry) continue;
    const skills = skillEntry.skills
      .filter((s) => s.skill !== 0)
      .map((s) => `${names.resolve("SkillID", s.skill) ?? `Skill${s.skill}`} ${formatSignedAmount(s.amount)}`);

    const [primaryRecipe, altRecipe] = createByEquipId.get(itemId) ?? [];
    const createMats = primaryRecipe ? resolveMaterials(primaryRecipe.craft, names) : [];
    const altMats = altRecipe ? resolveMaterials(altRecipe.craft, names) : [];

    out.push({
      name,
      skills,
      create_mats: materialsOrNull(createMats),
      color: resolveMaterialStyle(name).color,
      slots: skillEntry.reqSlots,
      rarity: displayRarity(deco.rarity),
      create_cost: halveCost(deco.price),
      type: "decoration",
      alternative_create_mats: materialsOrNull(altMats),
      category: resolveDecorationCategory(name),
    });
  }
  return out;
}
