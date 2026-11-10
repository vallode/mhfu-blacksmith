/**
 * Crafting and upgrade materials, from the EBOOT's `EquipmentCreate` and
 * `EquipmentUpgrade` tables (mhfu-extract's `tables/recipes.ts`).
 *
 * Materials: each slot's item is swapped with another slot whose item is
 * first found at the same tier (rank and star level). The reward and
 * gathering shuffles keep every tier's items in that tier, so a recipe
 * never needs anything from a later star level than before.
 * `checkRecipes` confirms that against the shuffled rewards and gathering
 * points.
 *
 * Items with no known source here (shop items, combinations, tickets) stay
 * where they are.
 *
 * Amounts: each slot's quantity is rescaled to its (new) item's typical
 * quantity, keeping the slot's size relative to that, then varied by a
 * random factor. A slot that wanted 10 Iron Ore and now takes a Tigrex Claw
 * asks for about as many claws as recipes usually do.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { DECORATION_ITEM_ID_OFFSET } from "mhfu-extract/src/emit/decorations.js";
import {
  EQUIP_CREATE_ENTRY_SIZE,
  EQUIP_UPGRADE_ENTRY_SIZE,
} from "mhfu-extract/src/tables/offsets.js";
import {
  equipmentCreateLayout,
  equipmentUpgradeLayout,
  type EquipmentCreateTables,
} from "mhfu-extract/src/tables/recipes.js";
import type { NameTable } from "mhfu-extract/src/strings/names.js";
import type { TableAddressResolver } from "mhfu-extract/src/tables/resolver.js";
import { tierKey, tierLabel, tierOrder, type Tier } from "../game/tiers.js";
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

export interface RecipeOptions {
  /** Swap materials between slots of the same tier. */
  materials: boolean;
  /** Vary quantities by up to this fraction (0.5 = 50% to 150%), or null to keep them. */
  amountSpread: number | null;
  /** The most of one material a slot can ask for when amounts vary. */
  maxQuantity: number;
}

export interface AssignedSlot {
  slot: RecipeSlot;
  /** The tier the slot's original item is first found at. */
  tier: Tier;
  itemId: number;
}

export function randomizeRecipes(
  slots: readonly RecipeSlot[],
  tiers: ReadonlyMap<number, Tier>,
  options: RecipeOptions,
  rng: { materials: Rng; amounts: Rng },
  edits: Edits,
): { report: ShuffleReport; assigned: AssignedSlot[] } {
  const notes: string[] = [];
  const items = slots.map((slot) => slot.itemId);
  let assigned: AssignedSlot[] = [];

  if (options.materials) {
    const shuffled = slots
      .map((slot) => ({ slot, tier: tiers.get(slot.itemId) }))
      .filter((s): s is { slot: RecipeSlot; tier: Tier } => s.tier !== undefined);
    const next = permuteWithinGroups(
      shuffled,
      (s) => tierKey(s.tier),
      (s) => s.slot.itemId,
      rng.materials,
    );
    assigned = shuffled.map((s, i) => ({ ...s, itemId: next[i]! }));
    const repeats = separateDuplicates(assigned, rng.materials);
    const bySlot = new Map(assigned.map((a) => [a.slot, a.itemId]));
    slots.forEach((slot, i) => (items[i] = bySlot.get(slot) ?? slot.itemId));
    notes.push(
      "Each material is replaced by another first found at the same rank and star level.",
      `${slots.length - shuffled.length} of ${slots.length} slots keep their material: no quest, monster or gathering source for it was found (shops, combining, tickets).`,
      repeats > 0
        ? `${repeats} recipes still list one material twice.`
        : "No recipe lists the same material twice.",
    );
  }

  const quantities = slots.map((slot) => slot.quantity);
  if (options.amountSpread !== null) {
    const typical = typicalQuantities(slots);
    const spread = options.amountSpread;
    slots.forEach((slot, i) => {
      const scale = typical.get(items[i]!)! / typical.get(slot.itemId)!;
      const factor = 1 - spread + rng.amounts.float() * 2 * spread;
      quantities[i] = clamp(Math.round(slot.quantity * scale * factor), 1, options.maxQuantity);
    });
    notes.push(
      `Quantities are rescaled to each material's usual amount in recipes, then varied by up to ${Math.round(spread * 100)}%.`,
    );
  }

  const buf = edits.eboot();
  const lines = slots.map((slot, i) => {
    buf.writeUInt16LE(items[i]!, slot.offset);
    buf.writeUInt16LE(quantities[i]!, slot.offset + 2);
    return {
      where: slot.recipe,
      text: `${itemName(items[i]!)} x${quantities[i]} (was ${itemName(slot.itemId)} x${slot.quantity})`,
    };
  });

  return { report: { title: "Crafting and upgrade materials", notes, lines }, assigned };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** The median quantity each item is asked for across all recipes. */
function typicalQuantities(slots: readonly RecipeSlot[]): Map<number, number> {
  const byItem = new Map<number, number[]>();
  for (const slot of slots) {
    const list = byItem.get(slot.itemId);
    if (list) list.push(slot.quantity);
    else byItem.set(slot.itemId, [slot.quantity]);
  }
  const out = new Map<number, number>();
  for (const [item, qs] of byItem) {
    qs.sort((a, b) => a - b);
    out.set(item, qs[Math.floor(qs.length / 2)]!);
  }
  return out;
}

/**
 * Swaps items so no recipe asks for the same material in two slots, which
 * the permutation can produce. Swaps stay within a tier. Returns how many
 * slots still repeat a material after a bounded number of tries.
 */
function separateDuplicates(assigned: AssignedSlot[], rng: Rng): number {
  const byRecipe = new Map<number, number[]>();
  const byTier = new Map<string, number[]>();
  const push = <K>(map: Map<K, number[]>, key: K, i: number): void => {
    const list = map.get(key);
    if (list) list.push(i);
    else map.set(key, [i]);
  };
  assigned.forEach((a, i) => {
    push(byRecipe, a.slot.entry, i);
    push(byTier, tierKey(a.tier), i);
  });
  const hasRepeat = (recipe: number, itemId: number, except: number): boolean =>
    byRecipe.get(recipe)!.some((j) => j !== except && assigned[j]!.itemId === itemId);

  let unresolved = 0;
  for (const indices of byRecipe.values()) {
    for (const i of indices) {
      const a = assigned[i]!;
      if (!hasRepeat(a.slot.entry, a.itemId, i)) continue;
      const pool = byTier.get(tierKey(a.tier))!;
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
 * found at or before the tier its slot was at. Returns the slots that
 * aren't, which should always be none.
 */
export function checkRecipes(
  assigned: readonly AssignedSlot[],
  tiersAfter: ReadonlyMap<number, Tier>,
): RecipeProblem[] {
  const problems: RecipeProblem[] = [];
  for (const { slot, tier, itemId } of assigned) {
    const found = tiersAfter.get(itemId);
    if (found === undefined || tierOrder(found) > tierOrder(tier)) {
      problems.push({
        recipe: slot.recipe,
        item: itemName(itemId),
        needs: found ? `${tierLabel(found)}, was ${tierLabel(tier)}` : "no source",
      });
    }
  }
  return problems;
}
