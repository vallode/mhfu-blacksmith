"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { useItems, type ItemLookup, type ResolvedItem } from "@/lib/client-data";
import styles from "@/styles/hunter.module.scss";

interface Slot {
  id: number;
  qty: number;
}

interface HunterInventoryProps {
  pouch: Slot[];
  box: Slot[];
  /** Open the item box by default (pouch is always open). */
  boxOpen?: boolean;
}

/** The game stores 255 for the one infinite-stack item (Normal S Lv1). */
const formatQty = (qty: number) => (qty === 255 ? "∞" : String(qty));

function resolve(items: ItemLookup | null, id: number): ResolvedItem {
  if (items) return items.get(id);
  return { id, name: `Item #${id}`, type: "ukwn", color: "gray", known: false };
}

function ItemGrid({ slots, items, filter }: { slots: Slot[]; items: ItemLookup | null; filter: string }) {
  const rows = slots
    .map((s, i) => ({ ...s, key: i, item: resolve(items, s.id) }))
    .filter((r) => !filter || r.item.name.toLowerCase().includes(filter));

  if (rows.length === 0) {
    return <p className={styles["inventory__empty"]}>{filter ? "No matching items." : "Empty."}</p>;
  }

  return (
    <ul className={styles["inventory__grid"]}>
      {rows.map(({ key, qty, item }) => (
        <li
          key={key}
          className={`${styles["inventory__item"]}${item.known ? "" : ` ${styles["inventory__item--unknown"]}`}`}
          title={`${item.name} (ID ${item.id})`}
        >
          <Icon type={item.type} color={item.color} />
          <span className={styles["inventory__name"]}>{item.name}</span>
          <span className={styles["inventory__qty"]}>{formatQty(qty)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function HunterInventory({ pouch, box, boxOpen = true }: HunterInventoryProps) {
  const { items, error } = useItems();
  const [query, setQuery] = useState("");
  const filter = query.trim().toLowerCase();

  return (
    <div className={styles["inventory"]}>
      {error && (
        <p className={styles["inventory__empty"]}>Item names could not be loaded; showing raw item IDs.</p>
      )}

      {box.length + pouch.length > 0 && (
        <input
          type="search"
          className={styles["inventory__filter"]}
          placeholder="Filter items…"
          aria-label="Filter items"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      <details className={styles["inventory__section"]} open>
        <summary className={styles["inventory__summary"]}>
          Item Pouch <span>{pouch.length}/24</span>
        </summary>
        <ItemGrid slots={pouch} items={items} filter={filter} />
      </details>

      <details className={styles["inventory__section"]} open={boxOpen}>
        <summary className={styles["inventory__summary"]}>
          Item Box <span>{box.length}/1000</span>
        </summary>
        <ItemGrid slots={box} items={items} filter={filter} />
      </details>
    </div>
  );
}
