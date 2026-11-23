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
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { useItems, useVeggieTrades, type ItemLookup } from "@/lib/client-data";
import { itemHref } from "@/lib/item-sources";
import { tradeMapsLabel } from "@/lib/veggie-trades";
import { groundName } from "../items/source-labels";

const note = "whitespace-normal text-white leading-[1.25]";

// Sticks to the top of the card while its section scrolls by. Opaque, and
// run out to the card's edges (TreeScroll indents the list by 13px).
const header = cn(
  "sticky top-0 z-1 -ml-[13px] flex h-[34px] w-[calc(100%+13px)] items-center border-b-2 border-black/40 px-5 text-sub tracking-[0.12em] text-parchment uppercase",
  "[background:linear-gradient(var(--color-selector),var(--color-selector)),var(--color-sheet)]",
);

/** One reward, laid out like a recipe material: icon, name and its chance. */
function RewardRow({
  id,
  items,
  chance,
  rare,
}: {
  id: number;
  items: ItemLookup;
  chance: number;
  rare?: boolean;
}) {
  const t = useT();
  const game = useGameText();
  const { formatNumber } = useLocale();
  const item = items.get(id);
  const name = item.known ? game.name("item", item.name) : t.quests.rewards.unknownItem(id);
  return (
    <div className="flex items-center">
      <Icon type={item.type} color={item.color} />
      {item.known ? (
        <Link
          href={itemHref(item.name)}
          className={cn(
            "w-cells-16 min-w-0 wrap-anywhere whitespace-normal underline-offset-4 hover:underline mobile:leading-[1.25]",
            rare && "text-warm",
          )}
        >
          {name}
        </Link>
      ) : (
        <p className="w-cells-16 min-w-0">{name}</p>
      )}
      <p className={cn("flex-none text-right whitespace-pre", rare && "text-warm")}>
        {formatNumber(chance)}%
      </p>
    </div>
  );
}

export default function VeggieElderClient() {
  const { bundle, error } = useVeggieTrades();
  const { items } = useItems();
  const t = useT();
  const tv = t.items.veggieElder;
  const game = useGameText();
  const [elder, setElder] = useState(0);
  // The item picked, by ID, so it stays picked as you step to another ground.
  const [picked, setPicked] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  if (error) return <p className="text-negative">{tv.loadError}</p>;
  if (!bundle || !items) return <Loading>{tv.loading}</Loading>;

  const count = bundle.elders.length;
  const { maps, rows } = bundle.elders[elder]!;
  const trade = rows.find(([, give]) => give === picked);
  // Items every ground's list takes, then the ones only this ground does,
  // each in the game's order (the No. on the row is the place on the list).
  const shared = rows.filter(([, give]) =>
    bundle.elders.every((e) => e.rows.some(([, other]) => other === give)),
  );
  const sections = [
    { key: "every", label: tv.everyGround, rows: shared },
    { key: "here", label: tv.onlyHere, rows: rows.filter((row) => !shared.includes(row)) },
  ].filter((section) => section.rows.length > 0);
  const itemName = (id: number) => {
    const item = items.get(id);
    return item.known ? game.name("item", item.name) : t.quests.rewards.unknownItem(id);
  };

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
              {sections.map((section) => (
                <section key={section.key}>
                  <h2 className={header}>{section.label}</h2>
                  {section.rows.map(([row, give]) => {
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
                        <p className="min-w-0 flex-1 truncate">{itemName(give)}</p>
                        <p className="flex-none pr-3 text-fine text-muted">{row}</p>
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>
          </TreeScroll>
          {/* Room to scroll the last rows clear of the ground selector. */}
          <div className="flex-none" style={{ height: SELECTOR_BAR_HEIGHT }} aria-hidden="true" />
        </Card>
        <SelectorBar
          label={tradeMapsLabel(maps, (m) => groundName(game, m))}
          groupLabel={tv.groundGroup}
          previousLabel={tv.previousGround}
          nextLabel={tv.nextGround}
          onStep={step}
          count={`${elder + 1}/${count}`}
          countLabel={tv.groundOf(elder + 1, count)}
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
            <DetailName>{itemName(trade[1])}</DetailName>
          </DetailHeader>
          <DetailBody>
            <StatList>
              <Stat label={tv.listNumber}>
                <StatValue>{trade[0]}</StatValue>
              </Stat>
            </StatList>
            <div className="flex flex-col gap-y-[13px] text-white">
              <p className="whitespace-normal text-stat">{tv.heGives}</p>
              {trade[2] === trade[3] ? (
                <RewardRow id={trade[2]} items={items} chance={100} />
              ) : (
                <>
                  <RewardRow id={trade[2]} items={items} chance={100 - bundle.rareChance} />
                  <RewardRow id={trade[3]} items={items} chance={bundle.rareChance} rare />
                </>
              )}
            </div>
            <p className={note}>{tv.pageNote}</p>
          </DetailBody>
        </DetailCard>
      ) : (
        <NoDataCard>
          <p className={note}>{tv.pickItem}</p>
        </NoDataCard>
      )}
    </div>
  );
}
