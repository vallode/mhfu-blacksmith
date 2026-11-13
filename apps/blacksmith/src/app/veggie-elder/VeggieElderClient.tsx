"use client";

/**
 * The Veggie Elder page: pick a hunting ground, tick what the hunter carries
 * and see the trade he makes. He takes the first item on his list that the
 * hunter carries (pickTrade), so the winning row is marked and the carried
 * items under it are marked as passed over. Each ground has its own list.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";
import { useItems, useVeggieTrades, type ResolvedItem } from "@/lib/client-data";
import { cn } from "@/lib/cn";
import { itemHref } from "@/lib/item-sources";
import { pickTrade, tradeMapsLabel, type TradeRow } from "@/lib/veggie-trades";
import * as ui from "@/styles/settings";

const rowBase =
  "flex w-full cursor-pointer items-center gap-[0.8rem] border-0 border-b border-line bg-transparent px-[0.6rem] py-[0.2rem] text-left mobile:flex-wrap font-[inherit] text-main text-white hover:hover-glow focus-visible:hover-glow mobile:text-small";

function ItemName({ item, link }: { item: ResolvedItem; link?: boolean }) {
  return (
    <>
      <Icon type={item.type} color={item.color} />
      {link && item.known ? (
        <Link href={itemHref(item.name)} className="min-w-0 underline-offset-4 hover:underline">
          {item.name}
        </Link>
      ) : (
        <span className="min-w-0 truncate">{item.name}</span>
      )}
    </>
  );
}

export default function VeggieElderClient() {
  const { bundle, error } = useVeggieTrades();
  const { items } = useItems();
  const [elder, setElder] = useState(0);
  const [carried, setCarried] = useState<ReadonlySet<number>>(new Set());
  const [felyne, setFelyne] = useState(false);
  const [query, setQuery] = useState("");

  const rows = useMemo<readonly TradeRow[]>(
    () => bundle?.elders[elder]?.rows ?? [],
    [bundle, elder],
  );
  const winner = pickTrade(rows, carried);

  if (error) return <p className="text-negative">{"The Veggie Elder's trades didn't load."}</p>;
  if (!bundle || !items) return <Loading>Loading trades…</Loading>;

  const rare = bundle.rareChance;
  const toggle = (id: number) =>
    setCarried((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const q = query.trim().toLowerCase();
  const matches = (id: number) => !q || items.get(id).name.toLowerCase().includes(q);
  const shown = rows.filter(
    ([, give, common, rareItem]) => matches(give) || matches(common) || matches(rareItem),
  );
  // What the hunter carries that this ground's list ignores.
  const ignored = [...carried].filter((id) => !rows.some(([, give]) => give === id));

  const outcome = () => {
    if (!winner) return null;
    const [row, give, common, rareItem] = winner;
    const sure = common === rareItem;
    const passed = [...carried].filter((id) => id !== give && rows.some(([, g]) => g === id));
    return (
      <div className="flex flex-col gap-[0.6rem]">
        <p className="m-0 text-main whitespace-normal">
          He takes {items.get(give).name} (No. {row}).
        </p>
        {sure ? (
          <Reward id={common} items={items} note="always" />
        ) : felyne ? (
          <Reward id={rareItem} items={items} note="rare, with Felyne Negotiations" rare />
        ) : (
          <>
            <Reward id={common} items={items} note={`${100 - rare}%`} />
            <Reward id={rareItem} items={items} note={`${rare}%`} rare />
          </>
        )}
        {passed.length > 0 && (
          <p className={ui.note}>
            Passed over: {passed.map((id) => items.get(id).name).join(", ")}. They sit lower on his
            list.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="flex w-full max-w-[72rem] flex-col gap-[1.3rem]">
      <Card className={ui.section} bodyClassName={ui.sectionBody}>
        <p className={ui.note}>
          The Veggie Elder takes the first item on his list that you carry. Each hunting ground has
          its own list, so pick yours, then tap the items in your pouch.
        </p>
        <div className={ui.actions} role="group" aria-label="Hunting ground">
          {bundle.elders.map((e, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={i === elder}
              onClick={() => setElder(i)}
              className={cn(ui.button, i === elder && "border-gold text-gold")}
            >
              {tradeMapsLabel(e.maps)}
            </button>
          ))}
        </div>
      </Card>

      <Card className={ui.section} bodyClassName={ui.sectionBody}>
        <h2 className="m-0 text-main font-medium text-parchment">Your pouch</h2>
        {carried.size === 0 ? (
          <p className={ui.note}>Nothing yet. Tap items on his list below.</p>
        ) : (
          <div className={ui.actions}>
            {[...carried].map((id) => (
              <button
                key={id}
                type="button"
                className={ui.buttonSecondary}
                onClick={() => toggle(id)}
                aria-label={`Remove ${items.get(id).name}`}
              >
                {items.get(id).name} ×
              </button>
            ))}
            <button
              type="button"
              className={ui.buttonSecondary}
              onClick={() => setCarried(new Set())}
            >
              Clear
            </button>
          </div>
        )}
        <label className="flex cursor-pointer items-center gap-[0.8rem] text-small">
          <input type="checkbox" checked={felyne} onChange={(e) => setFelyne(e.target.checked)} />
          Felyne Negotiations is on
        </label>
        {carried.size > 0 && (
          <div className="border border-positive p-[1rem]" aria-live="polite">
            {outcome() ?? (
              <p className="m-0 text-small whitespace-normal">
                He takes none of these on this ground.
              </p>
            )}
          </div>
        )}
        {ignored.length > 0 && winner && (
          <p className={ui.note}>
            {"Not on this ground's list:"} {ignored.map((id) => items.get(id).name).join(", ")}.
          </p>
        )}
      </Card>

      <Card className={ui.section} bodyClassName="gap-[0.8rem]">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter his list"
          aria-label="Filter his list"
          className="border border-hr bg-black px-[1rem] py-[0.6rem] font-[inherit] text-small text-white"
        />
        <div>
          {shown.map((r) => {
            const [row, give, common, rareItem] = r;
            const held = carried.has(give);
            const won = winner === r;
            return (
              <button
                key={row}
                type="button"
                aria-pressed={held}
                onClick={() => toggle(give)}
                className={cn(
                  rowBase,
                  won && "bg-positive/15 outline outline-positive",
                  held && !won && "text-unavailable",
                )}
              >
                <span className="w-cells-3 flex-none text-right text-fine text-muted">{row}</span>
                <span className="flex min-w-0 flex-1 items-center">
                  <ItemName item={items.get(give)} />
                </span>
                <span className="flex-none text-hr mobile:hidden">→</span>
                <span className="flex min-w-0 flex-[1.4] flex-wrap items-center mobile:order-last mobile:basis-full mobile:pl-[4rem]">
                  <ItemName item={items.get(common)} />
                  {common !== rareItem && (
                    <span className="flex min-w-0 items-center text-warm">
                      <span className="px-[0.4rem]">/</span>
                      <ItemName item={items.get(rareItem)} />
                    </span>
                  )}
                </span>
                <span className="w-cells-6 flex-none text-right text-fine mobile:w-auto">
                  {held ? (won ? "taken" : "later") : ""}
                </span>
              </button>
            );
          })}
          {shown.length === 0 && <p className={ui.note}>{`No trade matches "${query}".`}</p>}
        </div>
      </Card>
    </div>
  );
}

function Reward({
  id,
  items,
  note,
  rare,
}: {
  id: number;
  items: { get(id: number): ResolvedItem };
  note: string;
  rare?: boolean;
}) {
  return (
    <div className={cn("flex items-center text-main whitespace-normal", rare && "text-warm")}>
      <ItemName item={items.get(id)} link />
      <span className="ml-[0.8rem] text-small text-white/60">{note}</span>
    </div>
  );
}
