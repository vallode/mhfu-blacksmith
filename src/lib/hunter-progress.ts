/**
 * What the loaded hunter owns and which weapon upgrades they can make right
 * now, from the save's equipment box, items and zenny.
 *
 * An upgrade is "ready" when every improve material is owned in the needed
 * amount and the hunter has the zenny. It is "unknown" (and never shown as
 * ready) when a material doesn't link to an in-game item, an amount isn't a
 * plain number, or the save was stored before zenny was kept.
 */
import { resolveEquip } from "./equipment";
import type { CompactWeapon, Dictionaries, EquipmentIds } from "./schema";
import type { SaveData } from "./save-store";

export type UpgradeCheck = { status: "ready"; cost: number } | { status: "short" } | { status: "unknown" };

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
  zenny: number | undefined
): UpgradeCheck {
  if (!counts || zenny === undefined || !weapon.im?.length) return { status: "unknown" };
  let short = false;
  for (const [materialId, amount] of weapon.im) {
    const itemId = materials[dict.material_ids[materialId]];
    if (itemId === undefined || typeof amount !== "number") return { status: "unknown" };
    if ((counts.get(itemId) ?? 0) < amount) short = true;
  }
  const cost = weapon.ic ?? 0;
  return short || cost > zenny ? { status: "short" } : { status: "ready", cost };
}
