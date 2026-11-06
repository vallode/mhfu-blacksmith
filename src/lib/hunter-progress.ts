"use client";

/**
 * What the loaded hunter owns and which weapon upgrades they can make right
 * now, from the save's equipment box, item box and zenny.
 *
 * An upgrade is "ready" when every improve material is in the item box in
 * the needed amount and the hunter has the zenny. It is "unknown" (and never
 * shown as ready) when a material has no known item ID, an amount isn't a
 * plain number, or the save predates item box/zenny tracking.
 */
import { getBundle, getDictionaries } from "./client-data";
import { resolveEquip } from "./equipment";
import type { CompactTreeNode, CompactWeapon, Dictionaries, EquipmentIds, WeaponBundle } from "./schema";
import type { SaveData } from "./save-store";

export type UpgradeCheck =
  | { status: "ready"; cost: number }
  | { status: "short"; missing: { name: string; need: number; have: number }[]; zennyShort: number }
  | { status: "unknown" };

export const weaponHref = (type: string, slug: string) => `/blacksmith/${type}/${slug}/`;

/** Hrefs of every item page the hunter owns. */
export function ownedHrefs(ids: EquipmentIds, save: SaveData | null): Set<string> {
  const owned = new Set<string>();
  for (const slot of save?.equipment ?? []) {
    const item = resolveEquip(ids, slot);
    if (item) owned.add(item.href);
  }
  return owned;
}

/** Item box quantities by item ID, or null for saves stored before the item box was kept separately. */
export function itemBoxCounts(save: SaveData | null): Map<number, number> | null {
  if (!save?.chest) return null;
  const counts = new Map<number, number>();
  for (const { id, qty } of save.chest) counts.set(id, (counts.get(id) ?? 0) + qty);
  return counts;
}

export function checkUpgrade(
  dict: Dictionaries,
  weapon: CompactWeapon,
  counts: Map<number, number> | null,
  zenny: number | undefined
): UpgradeCheck {
  if (!counts || zenny === undefined || !weapon.im?.length) return { status: "unknown" };
  const missing: { name: string; need: number; have: number }[] = [];
  for (const [materialId, amount] of weapon.im) {
    const itemId = dict.material_item_ids?.[materialId];
    if (itemId == null || typeof amount !== "number") return { status: "unknown" };
    const have = counts.get(itemId) ?? 0;
    if (have < amount) missing.push({ name: dict.material_ids[materialId], need: amount, have });
  }
  const cost = weapon.ic ?? 0;
  const zennyShort = Math.max(0, cost - zenny);
  return missing.length === 0 && zennyShort === 0 ? { status: "ready", cost } : { status: "short", missing, zennyShort };
}

export interface ReadyUpgrade {
  from: { name: string; type: string; href: string };
  to: { name: string; type: string; href: string; rarity: number | null };
  cost: number;
}

/** Every upgrade the hunter can make now: owned weapon -> a tree child they don't own yet. */
export async function findReadyUpgrades(
  owned: Set<string>,
  counts: Map<number, number> | null,
  zenny: number | undefined
): Promise<ReadyUpgrade[]> {
  if (!counts || zenny === undefined) return [];
  const ownedTypes = new Set(
    [...owned].filter((h) => h.startsWith("/blacksmith/")).map((h) => h.split("/")[2])
  );
  if (ownedTypes.size === 0) return [];

  const [dict, ...bundles] = await Promise.all([
    getDictionaries(),
    ...[...ownedTypes].map((t) => getBundle(`weapon-${t}`) as Promise<WeaponBundle>),
  ]);

  // Owned parent -> child edges, from each owned type's own tree.
  const edges: { parent: CompactTreeNode; parentType: string; child: CompactTreeNode; childType: string }[] = [];
  const walk = (nodes: CompactTreeNode[], bundleType: string, parent?: CompactTreeNode) => {
    for (const node of nodes) {
      const type = node.t ?? bundleType;
      if (parent && owned.has(weaponHref(bundleType, parent.s)) && !owned.has(weaponHref(type, node.s)) && node.r) {
        edges.push({ parent, parentType: bundleType, child: node, childType: type });
      }
      // External nodes are leaves in another type's tree; their own subtree lives in their bundle.
      if (node.k && type === bundleType) walk(node.k, bundleType, node);
    }
  };
  bundles.forEach((b) => walk(b.tree, b.type));

  const childBundles = new Map<string, WeaponBundle>();
  await Promise.all(
    [...new Set(edges.map((e) => e.childType))].map(async (t) => {
      childBundles.set(t, (await getBundle(`weapon-${t}`)) as WeaponBundle);
    })
  );

  const seen = new Set<string>();
  const ready: ReadyUpgrade[] = [];
  for (const { parent, parentType, child, childType } of edges) {
    const key = `${weaponHref(parentType, parent.s)}>${weaponHref(childType, child.s)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const weapon = childBundles.get(childType)?.items.find((w) => w.s === child.s);
    if (!weapon) continue;
    const check = checkUpgrade(dict, weapon, counts, zenny);
    if (check.status !== "ready") continue;
    ready.push({
      from: { name: parent.n, type: parentType, href: weaponHref(parentType, parent.s) },
      to: { name: child.n, type: childType, href: weaponHref(childType, child.s), rarity: weapon.r ?? null },
      cost: check.cost,
    });
  }
  return ready;
}
