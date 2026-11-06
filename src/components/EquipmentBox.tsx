"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSave } from "@/context/SaveContext";
import { ARMOR_SLOTS, WEAPON_TYPES } from "@/lib/constants";
import { resolveEquip, useEquipmentIds, type ResolvedEquip } from "@/lib/equipment";
import { EQUIP_TYPE_SLOTS } from "@/lib/schema";
import type { EquipSlot } from "@/lib/save-store";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import styles from "@/styles/hunter.module.scss";

const CATEGORY_ORDER: readonly string[] = [...WEAPON_TYPES, ...ARMOR_SLOTS];

const formatCategory = (category: string) =>
  category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

interface Row {
  item: ResolvedEquip;
  count: number;
}

interface Group {
  category: string;
  rows: Row[];
  total: number;
}

/** e.g. "Helmet #240", or "type 9 #5" for an equip type the save worker doesn't know. */
function describeUnknown(slot: EquipSlot): string {
  const typeSlot = EQUIP_TYPE_SLOTS[slot.type];
  return `${typeSlot ? formatCategory(typeSlot) : `type ${slot.type}`} #${slot.id}`;
}

/** Groups by weapon type / armor slot, merging duplicates and keeping box order within a group. */
function groupEquipment(resolve: (slot: EquipSlot) => ResolvedEquip | null, slots: EquipSlot[]) {
  const groups = new Map<string, Map<string, Row>>();
  const unknown: EquipSlot[] = [];
  for (const slot of slots) {
    const item = resolve(slot);
    if (!item) {
      unknown.push(slot);
      continue;
    }
    const rows = groups.get(item.category) ?? new Map<string, Row>();
    groups.set(item.category, rows);
    const row = rows.get(item.href);
    if (row) row.count++;
    else rows.set(item.href, { item, count: 1 });
  }
  const ordered: Group[] = CATEGORY_ORDER.flatMap((category) => {
    const rows = groups.get(category);
    if (!rows) return [];
    const list = [...rows.values()];
    return [{ category, rows: list, total: list.reduce((n, r) => n + r.count, 0) }];
  });
  return { groups: ordered, unknown };
}

/** The loaded hunter's equipment box, grouped by weapon type and armor slot. */
export default function EquipmentBox() {
  const { save } = useSave();
  const { ids, error } = useEquipmentIds();
  const equipment = save?.equipment;

  const grouped = useMemo(
    () => (ids && equipment ? groupEquipment((slot) => resolveEquip(ids, slot), equipment) : null),
    [ids, equipment]
  );

  if (!save) return null;

  let body: React.ReactNode;
  if (!equipment) {
    body = <p className={styles["equipment-box__note"]}>Load your save again to read its equipment box.</p>;
  } else if (equipment.length === 0) {
    body = <p className={styles["equipment-box__note"]}>The equipment box is empty.</p>;
  } else if (error) {
    body = <p className={styles["equipment-box__note"]}>Couldn&apos;t load the equipment list.</p>;
  } else if (!grouped) {
    body = <p className={styles["equipment-box__note"]}>Loading…</p>;
  } else {
    body = (
      <>
        {grouped.groups.map((group) => (
          <section key={group.category} className={styles["equipment-box__group"]}>
            <h3 className={styles["equipment-box__heading"]}>
              <Icon type={group.category} size="mini" />
              {formatCategory(group.category)}
              <span className={styles["equipment-box__count"]}>{group.total}</span>
            </h3>
            <ul className={styles["equipment-box__list"]}>
              {group.rows.map(({ item, count }) => (
                <li key={item.href}>
                  <Link href={item.href} className={`list-row ${styles["equipment-box__row"]}`}>
                    <Icon type={item.category} size="mini" rarity={item.rarity} />
                    <span className={styles["equipment-box__name"]}>
                      {item.name}
                      {item.sex && <span className={styles["equipment-box__count"]}> ({item.sex})</span>}
                    </span>
                    {count > 1 && <span className={styles["equipment-box__count"]}>×{count}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {grouped.unknown.length > 0 && (
          <p className={styles["equipment-box__note"]}>
            {grouped.unknown.length} unrecognised{" "}
            {grouped.unknown.length === 1 ? "piece" : "pieces"} (
            {grouped.unknown.map(describeUnknown).join(", ")}).
          </p>
        )}
      </>
    );
  }

  return (
    <Card className={styles["equipment-box"]}>
      <h2 className={styles["equipment-box__title"]}>
        Equipment box
        <span className={styles["equipment-box__owner"]}>{save.name}</span>
        {equipment && equipment.length > 0 && (
          <span className={styles["equipment-box__count"]}>{equipment.length}</span>
        )}
      </h2>
      {body}
    </Card>
  );
}
