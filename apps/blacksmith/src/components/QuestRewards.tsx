"use client";

import Icon from "@/components/Icon";
import Link from "next/link";
import {
  DropGrid,
  DropList,
  dropName,
  dropQuantity,
  itemLink,
  type LinkedDrop,
} from "@/components/MonsterDrops";
import { useItems, type ItemLookup } from "@/lib/client-data";
import { rewardTableHeading, type Quest, type QuestRewardTable } from "@/lib/quests";
import { cn } from "@/lib/cn";
import { itemHref } from "@/lib/item-sources";

function rewardDrops(table: QuestRewardTable, items: ItemLookup | null): LinkedDrop[] {
  return table.items.map((r) => {
    const item = items?.get(r.itemId);
    const drop: LinkedDrop = { name: item?.name ?? `Item #${r.itemId}`, chance: `${r.chance}%` };
    if (r.amount > 1) drop.quantity = r.amount;
    if (item?.known) drop.href = itemHref(item.name);
    if (item) {
      drop.type = item.type;
      drop.color = item.color;
    }
    return drop;
  });
}

/** A quest's reward tables in disc order, each titled by its kind and draw count. */
export function QuestRewards({ tables }: { tables: QuestRewardTable[] }) {
  const { items } = useItems();
  return (
    <DropGrid>
      {tables.map((table, i) => (
        <DropList key={i} {...rewardTableHeading(table)} items={rewardDrops(table, items)} />
      ))}
    </DropGrid>
  );
}

/** The supply box: one row per distinct item and amount; repeated rows show their count. */
export function QuestSupplies({ supplies }: { supplies: Quest["supplies"] }) {
  const { items } = useItems();
  return (
    <ul className="m-0 flex max-w-[48rem] list-none flex-col gap-[0.2rem] p-0 text-small">
      {supplies.map((s, i) => {
        const item = items?.get(s.itemId);
        return (
          <li key={i} className="flex items-center gap-[0.8rem] leading-none text-white">
            <Icon type={item?.type ?? "ukwn"} color={item?.color} />
            {item?.known ? (
              <Link href={itemHref(item.name)} className={cn(dropName, itemLink)}>
                {item.name}
              </Link>
            ) : (
              <span className={dropName}>{item?.name ?? `Item #${s.itemId}`}</span>
            )}
            <span className={dropQuantity}>×{s.amount}</span>
            <span className="w-cells-9 flex-none text-right text-fine text-white/60">
              {s.stacks > 1 ? `${s.stacks} stacks` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
