"use client";

import Icon from "@/components/Icon";
import { DropGrid, DropList } from "@/components/MonsterDrops";
import { useItems, type ItemLookup } from "@/lib/client-data";
import { rewardTableHeading, type Quest, type QuestRewardTable } from "@/lib/quests";
import type { MonsterDrop } from "@/lib/types";

function rewardDrops(table: QuestRewardTable, items: ItemLookup | null): MonsterDrop[] {
  return table.items.map((r) => {
    const item = items?.get(r.itemId);
    const drop: MonsterDrop = { name: item?.name ?? `Item #${r.itemId}`, chance: `${r.chance}%` };
    if (r.amount > 1) drop.quantity = r.amount;
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
    <ul className="m-0 flex max-w-[48rem] list-none flex-col gap-[0.2rem] p-0 text-[1.6rem]">
      {supplies.map((s, i) => {
        const item = items?.get(s.itemId);
        return (
          <li key={i} className="flex items-center gap-[0.8rem] leading-none text-white">
            <Icon type={item?.type ?? "ukwn"} color={item?.color} />
            <span className="min-w-0 flex-auto truncate">{item?.name ?? `Item #${s.itemId}`}</span>
            <span className="flex-none text-muted">×{s.amount}</span>
            <span className="w-cells-9 flex-none text-right text-[1.3rem] text-white/60">
              {s.stacks > 1 ? `${s.stacks} stacks` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
