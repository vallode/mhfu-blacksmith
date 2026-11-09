/**
 * Crafting and upgrade materials, from the EBOOT's `EquipmentCreate` and
 * `EquipmentUpgrade` tables (mhfu-extract's `tables/recipes.ts`).
 *
 * Each material slot keeps its quantity; its item is swapped with another
 * slot whose item is first found at the same rank. Items are only moved
 * within a rank, and the reward shuffles keep every rank's items at that
 * rank, so a recipe never needs anything from a higher rank than before.
 * `checkRecipes` confirms that against the shuffled rewards.
 *
 * Items with no known source here (gathered ores and plants, shop items,
 * combinations) stay where they are: their sources aren't read yet.
 */
import { BinaryReader } from "../../../mhfu-extract/src/binary/reader.js";
import { DECORATION_ITEM_ID_OFFSET } from "../../../mhfu-extract/src/emit/decorations.js";
import {
  EQUIP_CREATE_ENTRY_SIZE,
  EQUIP_UPGRADE_ENTRY_SIZE,
} from "../../../mhfu-extract/src/tables/offsets.js";
import {
  equipmentCreateLayout,
  equipmentUpgradeLayout,
  type EquipmentCreateTables,
} from "../../../mhfu-extract/src/tables/recipes.js";
import type { NameTable } from "../../../mhfu-extract/src/strings/names.js";
import type { TableAddressResolver } from "../../../mhfu-extract/src/tables/resolver.js";
import { BAND_NAMES, bandOrder, type Band } from "../game/bands.js";
import type { Edits } from "../edits.js";
import type { Rng } from "../rng.js";
import { itemName, tableName } from "../names.js";
import { permuteWithinGroups, type ShuffleReport } from "./shuffle.js";

const CRAFT_SLOTS = 4;

export interface RecipeSlot {
  /** Which recipe the slot belongs to, e.g. "Create: Rathalos Helm". */
  recipe: string;
  /** EBOOT file offset of the recipe's first material: tells apart recipes with the same name. */
  entry: number;
  /** EBOOT file offset of the material's u16 item ID (its u16 quantity follows). */
  offset: number;
  itemId: number;
  quantity: number;
}

const CREATE_NAME_TABLES: Partial<Record<keyof EquipmentCreateTables, NameTable>> = {
  head: "HeadArmorID",
  chest: "ChestArmorID",
  arm: "ArmArmorID",
  waist: "WaistArmorID",
  leg: "LegArmorID",
  greatSwordLongSword: "WepBMID",
  lanceGunlance: "WepBMID",
  swordAndShieldDualBlades: "WepBMID",
  hammerHuntingHorn: "WepBMID",
  ancientRustBlademaster: "WepBMID",
  lightBowgun: "WepGunID",
  heavyBowgun: "WepGunID",
  bow: "WepGunID",
  ancientRustGunner: "WepGunID",
};

function createName(section: keyof EquipmentCreateTables, equipId: number): string {
  if (section === "decoration") return itemName(equipId + DECORATION_ITEM_ID_OFFSET);
  const table = CREATE_NAME_TABLES[section];
  return (table && tableName(table, equipId)) ?? `${section} ${equipId}`;
}

/**
 * Every material slot in use: crafting recipes and weapon upgrades.
 *
 * Every create entry is included, whatever its `Hide` byte says: the field
 * isn't documented, and on the EU disc starter gear such as Buster Sword
 * has it set. Shuffling an unused entry's materials does no harm.
 */
export function collectRecipeSlots(
  eboot: Buffer,
  resolver: TableAddressResolver | undefined,
): RecipeSlot[] {
  const reader = new BinaryReader(eboot);
  const slots: RecipeSlot[] = [];
  const addMaterials = (recipe: string, materialsAt: number): void => {
    for (let k = 0; k < CRAFT_SLOTS; k++) {
      const offset = materialsAt + k * 4;
      const itemId = reader.u16(offset);
      const quantity = reader.u16(offset + 2);
      if (itemId !== 0 && quantity !== 0) {
        slots.push({ recipe, entry: materialsAt, offset, itemId, quantity });
      }
    }
  };

  const create = equipmentCreateLayout(reader, resolver);
  for (const [section, { offset, count }] of Object.entries(create) as [
    keyof EquipmentCreateTables,
    { offset: number; count: number },
  ][]) {
    for (let i = 0; i < count; i++) {
      const at = offset + i * EQUIP_CREATE_ENTRY_SIZE;
      addMaterials(`Create: ${createName(section, reader.u16(at + 2))}`, at + 4);
    }
  }

  const upgrade = equipmentUpgradeLayout(reader, resolver);
  for (const [section, table] of [
    ["blademaster", "WepBMID"],
    ["gunner", "WepGunID"],
  ] as const) {
    const { offset, count } = upgrade[section];
    for (let i = 1; i < count; i++) {
      const name = tableName(table, i) ?? `${section} ${i}`;
      addMaterials(`Upgrade from: ${name}`, offset + i * EQUIP_UPGRADE_ENTRY_SIZE);
    }
  }
  return slots;
}

export function shuffleRecipes(
  slots: readonly RecipeSlot[],
  bands: ReadonlyMap<number, Band>,
  rng: Rng,
  edits: Edits,
): { report: ShuffleReport; assigned: { slot: RecipeSlot; band: Band; itemId: number }[] } {
  const shuffled = slots
    .map((slot) => ({ slot, band: bands.get(slot.itemId) }))
    .filter((s): s is { slot: RecipeSlot; band: Band } => s.band !== undefined);
  const next = permuteWithinGroups(
    shuffled,
    (s) => s.band,
    (s) => s.slot.itemId,
    rng,
  );
  const assigned = shuffled.map((s, i) => ({ ...s, itemId: next[i]! }));
  const duplicates = separateDuplicates(assigned, rng);

  const buf = edits.eboot();
  const lines = assigned.map(({ slot, itemId }) => {
    buf.writeUInt16LE(itemId, slot.offset);
    return {
      where: slot.recipe,
      text: `${itemName(itemId)} x${slot.quantity} (was ${itemName(slot.itemId)})`,
    };
  });

  return {
    report: {
      title: "Crafting and upgrade materials",
      notes: [
        "Each material is replaced by another found first at the same rank; quantities stay with each slot.",
        `${slots.length - shuffled.length} of ${slots.length} slots are unchanged: their items have no monster or quest source the randomizer reads yet (gathering, shops, combining).`,
        ...(duplicates > 0
          ? [`${duplicates} recipes still list one material twice.`]
          : ["No recipe lists the same material twice."]),
      ],
      lines,
    },
    assigned,
  };
}

/**
 * Swaps items so no recipe asks for the same material in two slots, which
 * the permutation can produce. Swaps stay within a band. Returns how many
 * recipes still have a repeat after a bounded number of tries.
 */
function separateDuplicates(
  assigned: { slot: RecipeSlot; band: Band; itemId: number }[],
  rng: Rng,
): number {
  const byRecipe = new Map<number, number[]>();
  const byBand = new Map<Band, number[]>();
  const push = <K>(map: Map<K, number[]>, key: K, i: number): void => {
    const list = map.get(key);
    if (list) list.push(i);
    else map.set(key, [i]);
  };
  assigned.forEach((a, i) => {
    push(byRecipe, a.slot.entry, i);
    push(byBand, a.band, i);
  });
  const hasRepeat = (recipe: number, itemId: number, except: number): boolean =>
    byRecipe.get(recipe)!.some((j) => j !== except && assigned[j]!.itemId === itemId);

  let unresolved = 0;
  for (const indices of byRecipe.values()) {
    for (const i of indices) {
      const a = assigned[i]!;
      if (!hasRepeat(a.slot.entry, a.itemId, i)) continue;
      const pool = byBand.get(a.band)!;
      let fixed = false;
      for (let attempt = 0; attempt < 200 && !fixed; attempt++) {
        const j = pool[rng.int(pool.length)]!;
        const b = assigned[j]!;
        if (b.slot.entry === a.slot.entry || b.itemId === a.itemId) continue;
        if (hasRepeat(a.slot.entry, b.itemId, i) || hasRepeat(b.slot.entry, a.itemId, j)) continue;
        [a.itemId, b.itemId] = [b.itemId, a.itemId];
        fixed = true;
      }
      if (!fixed) unresolved++;
    }
  }
  return unresolved;
}

export interface RecipeProblem {
  recipe: string;
  item: string;
  needs: string;
}

/**
 * Checks every shuffled material against the shuffled rewards: it must be
 * found at or below the rank its slot was at before. Returns the slots that
 * aren't, which should always be none.
 */
export function checkRecipes(
  assigned: readonly { slot: RecipeSlot; band: Band; itemId: number }[],
  bandsAfter: ReadonlyMap<number, Band>,
): RecipeProblem[] {
  const problems: RecipeProblem[] = [];
  for (const { slot, band, itemId } of assigned) {
    const found = bandsAfter.get(itemId);
    if (found === undefined || bandOrder(found) > bandOrder(band)) {
      problems.push({
        recipe: slot.recipe,
        item: itemName(itemId),
        needs: found ? `${BAND_NAMES[found]}, was ${BAND_NAMES[band]}` : "no source",
      });
    }
  }
  return problems;
}
