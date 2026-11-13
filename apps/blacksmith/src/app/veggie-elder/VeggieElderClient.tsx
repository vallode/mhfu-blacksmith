"use client";

/**
 * The Veggie Elder page, laid out like the item lists: the Elder's list down
 * the left (the items he takes, in the game's order), a selector at the
 * bottom of the card that steps through the hunting grounds (each has its own
 * list), and the trade for the item you pick on the right.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import {
  DetailBody,
  DetailCard,
  DetailHeader,
  DetailName,
  NoDataCard,
  Stat,
  StatList,
  StatValue,
} from "@/components/DetailPanel";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";
import SelectorBar, { SELECTOR_BAR_HEIGHT } from "@/components/SelectorBar";
import TreeScroll from "@/components/TreeScroll";
import { cn } from "@/lib/cn";
import { useItems, useVeggieTrades, type ItemLookup } from "@/lib/client-data";
import { itemHref } from "@/lib/item-sources";
import { tradeMapsLabel } from "@/lib/veggie-trades";

const note = "whitespace-normal text-white leading-[1.25]";

/** An item's name as a link; a stat value, so no icon (it is a paragraph). */
function ItemLink({ id, items }: { id: number; items: ItemLookup }) {
  const item = items.get(id);
  return item.known ? (
    <Link href={itemHref(item.name)} className="text-white underline-offset-4 hover:underline">
      {item.name}
    </Link>
  ) : (
    <StatValue>{item.name}</StatValue>
  );
}

export default function VeggieElderClient() {
  const { bundle, error } = useVeggieTrades();
  const { items } = useItems();
  const [elder, setElder] = useState(0);
  // The item picked, by ID, so it stays picked as you step to another ground.
  const [picked, setPicked] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  if (error) return <p className="text-negative">{"The Veggie Elder's trades didn't load."}</p>;
  if (!bundle || !items) return <Loading>Loading trades…</Loading>;

  const count = bundle.elders.length;
  const { maps, rows } = bundle.elders[elder]!;
  const trade = rows.find(([, give]) => give === picked);

  const step = (by: 1 | -1) => {
    setElder((elder + by + count) % count);
    // The list's scroll container is the card's body around it.
    for (let el = listRef.current?.parentElement; el; el = el.parentElement) {
      if (getComputedStyle(el).overflowY === "auto") {
        el.scrollTo({ top: 0 });
        break;
      }
    }
  };

  return (
    <div className="split-page">
      <CardBox data-tree-panel className="mobile:h-[50vh] mobile:flex-none">
        <Card variant="weapon-tree">
          <TreeScroll treeKey={`veggie-elder-${elder}`}>
            <div ref={listRef} className="flex flex-col">
              {rows.map(([row, give]) => {
                const item = items.get(give);
                const active = give === picked;
                return (
                  <button
                    key={row}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPicked(give)}
                    className={cn(
                      "list-row w-full cursor-pointer border-0 text-left font-[inherit] text-white",
                      active ? "bg-(image:--gradient-hover-glow)" : "bg-transparent",
                    )}
                  >
                    <Icon type={item.type} color={item.color} />
                    <p className="truncate">{item.name}</p>
                  </button>
                );
              })}
            </div>
          </TreeScroll>
          {/* Room to scroll the last rows clear of the ground selector. */}
          <div className="flex-none" style={{ height: SELECTOR_BAR_HEIGHT }} aria-hidden="true" />
        </Card>
        <SelectorBar
          label={tradeMapsLabel(maps)}
          groupLabel="Hunting ground"
          previousLabel="Previous hunting ground"
          nextLabel="Next hunting ground"
          onStep={step}
          count={`${elder + 1}/${count}`}
          countLabel={`Hunting ground ${elder + 1} of ${count}`}
        />
      </CardBox>

      {trade ? (
        <DetailCard>
          <DetailHeader>
            <Icon
              type={items.get(trade[1]).type}
              color={items.get(trade[1]).color}
              size="large"
              alt=""
            />
            <DetailName>{items.get(trade[1]).name}</DetailName>
          </DetailHeader>
          <DetailBody>
            <StatList>
              <Stat label="List No.:">
                <StatValue>{trade[0]}</StatValue>
              </Stat>
              {trade[2] === trade[3] ? (
                <Stat label="Trade:">
                  <ItemLink id={trade[2]} items={items} />
                </Stat>
              ) : (
                <>
                  <Stat label={`Common ${100 - bundle.rareChance}%:`}>
                    <ItemLink id={trade[2]} items={items} />
                  </Stat>
                  <Stat label={`Rare ${bundle.rareChance}%:`}>
                    <ItemLink id={trade[3]} items={items} />
                  </Stat>
                </>
              )}
            </StatList>
            <p className={note}>
              He takes the first item on his list that you carry, so a higher one wins. The Felyne
              Negotiations kitchen skill makes every trade a rare one.
            </p>
          </DetailBody>
        </DetailCard>
      ) : (
        <NoDataCard>
          <p className={note}>
            Pick an item to see what the Veggie Elder gives for it. Each hunting ground has its own
            list.
          </p>
        </NoDataCard>
      )}
    </div>
  );
}
