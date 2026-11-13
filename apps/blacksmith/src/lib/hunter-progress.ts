/**
 * What the loaded hunter owns and which weapons and decorations they can make
 * right now, from the save's equipment box, items and zenny.
 *
 * A weapon can be made two ways: forged from scratch with its create recipe,
 * or upgraded from its tree parent (which the hunter must own) with its
 * improve recipe. A recipe is "ready" when every material is owned in the
 * needed amount and the hunter has the zenny. It is "unknown" (and never shown
 * as ready) when a material doesn't link to an in-game item or an amount isn't
 * a plain number. A save stored before zenny was kept still gets a material
 * check; only the cost goes unchecked.
 *
 * Decorations are items: the hunter owns those in their item box and pouch,
 * and those attached to equipment in their equipment box. A jewel with two
 * recipes can be made with either.
 */
import { resolveEquip } from "./equipment-ref";
import type {
  CompactDecoration,
  CompactWeapon,
  Dictionaries,
  EquipmentIds,
  MatTuple,
} from "./schema";
import type { SaveData } from "./save-store";

/** One recipe material: how many the recipe needs and how many the hunter has. */
export interface MaterialCheck {
  name: string;
  need: number;
  /** Item box and pouch together; Infinity for the infinite-stack item. */
  have: number;
}

/** Forged from scratch (create recipe) or upgraded from the tree parent (improve recipe). */
export type CraftRoute = "create" | "upgrade";

/**
 * `materials` lists every material of the route's recipe in order. `missing`
 * counts the things standing in the way: one per material owned in too small
 * an amount, plus one if the hunter can't pay the zenny.
 */
export type CraftCheck =
  | { status: "ready"; via: CraftRoute; cost: number; materials: MaterialCheck[]; missing: 0 }
  | { status: "short"; via: CraftRoute; cost: number; materials: MaterialCheck[]; missing: number }
  | { status: "unknown" };

/** The game stores 255 for the one infinite-stack item (Normal S Lv1). */
const INFINITE_STACK = 255;

/** Owned quantity per in-game item ID, item box and pouch together. */
export function ownedItemCounts(save: SaveData | null): Map<number, number> | null {
  if (!save) return null;
  const counts = new Map<number, number>();
  for (const { id, qty } of save.items) {
    counts.set(id, (counts.get(id) ?? 0) + (qty === INFINITE_STACK ? Infinity : qty));
  }
  return counts;
}

/** How many of each decoration (by item ID) are attached to the hunter's equipment. */
export function attachedDecorationCounts(save: SaveData | null): Map<number, number> | null {
  if (!save) return null;
  const counts = new Map<number, number>();
  for (const slot of save.equipment ?? []) {
    for (const id of slot.decorations ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Hrefs of every item page the hunter owns. */
export function ownedHrefs(ids: EquipmentIds, save: SaveData | null): Set<string> {
  const owned = new Set<string>();
  for (const slot of save?.equipment ?? []) {
    const item = resolveEquip(ids, slot);
    if (item) owned.add(item.href);
  }
  return owned;
}

function checkRecipe(
  dict: Dictionaries,
  materials: Record<string, number>,
  via: CraftRoute,
  recipe: MatTuple[] | undefined,
  cost: number,
  counts: Map<number, number> | null,
  zenny: number | undefined,
): CraftCheck {
  if (!counts || !recipe?.length) return { status: "unknown" };
  const checks: MaterialCheck[] = [];
  let missing = 0;
  for (const [materialId, amount] of recipe) {
    const name = dict.material_ids[materialId];
    const itemId = materials[name];
    if (itemId === undefined || typeof amount !== "number") return { status: "unknown" };
    const have = counts.get(itemId) ?? 0;
    if (have < amount) missing++;
    checks.push({ name, need: amount, have });
  }
  if (zenny !== undefined && cost > zenny) missing++;
  return missing === 0
    ? { status: "ready", via, cost, materials: checks, missing: 0 }
    : { status: "short", via, cost, materials: checks, missing };
}

/** Can the hunter forge this weapon from scratch with its create recipe? */
export function checkCreate(
  dict: Dictionaries,
  /** recipe material name -> in-game item ID (ItemLookup.materials) */
  materials: Record<string, number>,
  weapon: CompactWeapon,
  counts: Map<number, number> | null,
  zenny: number | undefined,
): CraftCheck {
  return checkRecipe(dict, materials, "create", weapon.cm, weapon.cc ?? 0, counts, zenny);
}

/** Can the hunter upgrade this weapon's tree parent into it with its improve recipe? */
export function checkUpgrade(
  dict: Dictionaries,
  /** recipe material name -> in-game item ID (ItemLookup.materials) */
  materials: Record<string, number>,
  weapon: CompactWeapon,
  counts: Map<number, number> | null,
  zenny: number | undefined,
): CraftCheck {
  return checkRecipe(dict, materials, "upgrade", weapon.im, weapon.ic ?? 0, counts, zenny);
}

/** Ready first, then fewest missing; on a tie the first (the upgrade) wins. */
function rank(check: CraftCheck): number {
  if (check.status === "unknown") return Infinity;
  return check.missing;
}

/**
 * The hunter's best way to make this weapon now: its create recipe, or (only
 * when they own the tree parent) its improve recipe, whichever is closer.
 */
export function checkCraft(
  dict: Dictionaries,
  /** recipe material name -> in-game item ID (ItemLookup.materials) */
  materials: Record<string, number>,
  weapon: CompactWeapon,
  counts: Map<number, number> | null,
  zenny: number | undefined,
  parentOwned: boolean,
): CraftCheck {
  const create = checkCreate(dict, materials, weapon, counts, zenny);
  if (!parentOwned) return create;
  const upgrade = checkUpgrade(dict, materials, weapon, counts, zenny);
  return rank(create) < rank(upgrade) ? create : upgrade;
}

/**
 * The hunter's best way to make this decoration now: its create recipe or
 * its second recipe, whichever is closer. Owning some already doesn't stop
 * them making more.
 */
export function checkDecoration(
  dict: Dictionaries,
  /** recipe material name -> in-game item ID (ItemLookup.materials) */
  materials: Record<string, number>,
  decoration: CompactDecoration,
  counts: Map<number, number> | null,
  zenny: number | undefined,
): CraftCheck {
  const cost = decoration.cc ?? 0;
  const create = checkRecipe(dict, materials, "create", decoration.cm, cost, counts, zenny);
  if (!decoration.am) return create;
  const alt = checkRecipe(dict, materials, "create", decoration.am, cost, counts, zenny);
  return rank(alt) < rank(create) ? alt : create;
}
