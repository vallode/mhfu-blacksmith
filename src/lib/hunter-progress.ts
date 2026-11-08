/**
 * What the loaded hunter owns and which weapon upgrades they can make right
 * now, from the save's equipment box, items and zenny.
 *
 * An upgrade is "ready" when every improve material is owned in the needed
 * amount and the hunter has the zenny. It is "unknown" (and never shown as
 * ready) when a material doesn't link to an in-game item or an amount isn't a
 * plain number. A save stored before zenny was kept still gets a material
 * check; only the cost goes unchecked.
 */
import { resolveEquip } from "./equipment";
import type { CompactWeapon, Dictionaries, EquipmentIds } from "./schema";
import type { SaveData } from "./save-store";

/** One improve material: how many the upgrade needs and how many the hunter has. */
export interface MaterialCheck {
  name: string;
  need: number;
  /** Item box and pouch together; Infinity for the infinite-stack item. */
  have: number;
}

/**
 * `materials` lists every improve material in recipe order. `missing` counts
 * the things standing in the way: one per material owned in too small an
 * amount, plus one if the hunter can't pay the zenny.
 */
export type UpgradeCheck =
  | { status: "ready"; cost: number; materials: MaterialCheck[]; missing: 0 }
  | { status: "short"; cost: number; materials: MaterialCheck[]; missing: number }
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

/** Hrefs of every item page the hunter owns. */
export function ownedHrefs(ids: EquipmentIds, save: SaveData | null): Set<string> {
  const owned = new Set<string>();
  for (const slot of save?.equipment ?? []) {
    const item = resolveEquip(ids, slot);
    if (item) owned.add(item.href);
  }
  return owned;
}

export function checkUpgrade(
  dict: Dictionaries,
  /** recipe material name -> in-game item ID (ItemLookup.materials) */
  materials: Record<string, number>,
  weapon: CompactWeapon,
  counts: Map<number, number> | null,
  zenny: number | undefined,
): UpgradeCheck {
  if (!counts || !weapon.im?.length) return { status: "unknown" };
  const checks: MaterialCheck[] = [];
  let missing = 0;
  for (const [materialId, amount] of weapon.im) {
    const name = dict.material_ids[materialId];
    const itemId = materials[name];
    if (itemId === undefined || typeof amount !== "number") return { status: "unknown" };
    const have = counts.get(itemId) ?? 0;
    if (have < amount) missing++;
    checks.push({ name, need: amount, have });
  }
  const cost = weapon.ic ?? 0;
  if (zenny !== undefined && cost > zenny) missing++;
  return missing === 0
    ? { status: "ready", cost, materials: checks, missing: 0 }
    : { status: "short", cost, materials: checks, missing };
}
