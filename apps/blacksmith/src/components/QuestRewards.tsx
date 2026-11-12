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
import { useGameText, useT } from "@/context/LanguageContext";
import { useItems, type ItemLookup } from "@/lib/client-data";
import type { GameText } from "@/lib/i18n/game-text";
import type { Messages } from "@/lib/i18n/messages";
import { rewardTableHeading, type Quest, type QuestRewardTable } from "@/lib/quests";
import { cn } from "@/lib/cn";
import { itemHref } from "@/lib/item-sources";

/** An item's name in the site's language, or its ID when the item list doesn't have it. */
function itemName(
  itemId: number,
  items: ItemLookup | null,
  t: Messages["quests"],
  game: GameText,
): string {
  const item = items?.get(itemId);
  return item ? game.name("item", item.name) : t.rewards.unknownItem(itemId);
}

/** A quest's reward tables in disc order, each titled by its kind and draw count. */
export function QuestRewards({ tables }: { tables: QuestRewardTable[] }) {
  const { items } = useItems();
  const t = useT().quests;
  const game = useGameText();

  const rewardDrops = (table: QuestRewardTable): LinkedDrop[] =>
    table.items.map((r) => {
      const item = items?.get(r.itemId);
      const drop: LinkedDrop = {
        name: itemName(r.itemId, items, t, game),
        chance: `${r.chance}%`,
      };
      if (r.amount > 1) drop.quantity = r.amount;
      // The page is found by the English name; the row shows the translation.
      if (item?.known) drop.href = itemHref(item.name);
      if (item) {
        drop.type = item.type;
        drop.color = item.color;
      }
      return drop;
    });

  return (
    <DropGrid>
      {tables.map((table, i) => (
        <DropList
          key={i}
          title={t.rewards.kinds[table.kind]}
          count={rewardTableHeading(table).count}
          note={
            table.kind === "conditional" && table.condition !== null
              ? t.rewards.condition(table.condition)
              : undefined
          }
          items={rewardDrops(table)}
        />
      ))}
    </DropGrid>
  );
}

/** The supply box: one row per distinct item and amount; repeated rows show their count. */
export function QuestSupplies({ supplies }: { supplies: Quest["supplies"] }) {
  const { items } = useItems();
  const t = useT().quests;
  const game = useGameText();
  return (
    <ul className="m-0 flex max-w-[48rem] list-none flex-col gap-[0.2rem] p-0 text-small">
      {supplies.map((s, i) => {
        const item = items?.get(s.itemId);
        const name = itemName(s.itemId, items, t, game);
        return (
          <li key={i} className="flex items-center gap-[0.8rem] leading-none text-white">
            <Icon type={item?.type ?? "ukwn"} color={item?.color} />
            {item?.known ? (
              <Link href={itemHref(item.name)} className={cn(dropName, itemLink)}>
                {name}
              </Link>
            ) : (
              <span className={dropName}>{name}</span>
            )}
            <span className={dropQuantity}>×{s.amount}</span>
            <span className="w-cells-9 flex-none text-right text-fine text-white/60">
              {s.stacks > 1 ? t.rewards.stacks(s.stacks) : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
