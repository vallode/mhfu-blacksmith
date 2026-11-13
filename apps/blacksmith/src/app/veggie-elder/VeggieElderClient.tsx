"use client";

/**
 * The Veggie Elder page: one tab per hunting ground, each with that Elder's
 * list in the game's order (he takes the first item on it that you carry).
 */
import Link from "next/link";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";
import Tabs from "@/components/Tabs";
import { useItems, useVeggieTrades, type ItemLookup } from "@/lib/client-data";
import { itemHref } from "@/lib/item-sources";
import { tradeMapsLabel, type TradeRow } from "@/lib/veggie-trades";
import * as ui from "@/styles/settings";

function ItemName({ id, items }: { id: number; items: ItemLookup }) {
  const item = items.get(id);
  return (
    <span className="flex min-w-0 items-center">
      <Icon type={item.type} color={item.color} />
      {item.known ? (
        <Link href={itemHref(item.name)} className="underline-offset-4 hover:underline">
          {item.name}
        </Link>
      ) : (
        item.name
      )}
    </span>
  );
}

function TradeList({ rows, items }: { rows: readonly TradeRow[]; items: ItemLookup }) {
  return (
    <div className="flex flex-col">
      {rows.map(([row, give, common, rare]) => (
        <div
          key={row}
          className="flex items-center gap-[0.8rem] border-b border-line py-[0.2rem] mobile:flex-wrap"
        >
          <span className="w-cells-3 flex-none text-right text-fine text-muted">{row}</span>
          <div className="flex min-w-0 flex-1 basis-[22rem] items-center gap-[0.8rem] mobile:basis-0">
            <ItemName id={give} items={items} />
          </div>
          <span className="flex-none text-hr mobile:hidden">→</span>
          <div className="flex min-w-0 flex-[1.4] basis-[28rem] flex-wrap items-center gap-x-[1.2rem] mobile:basis-full mobile:pl-[4rem]">
            <ItemName id={common} items={items} />
            {common !== rare && (
              <span className="flex items-center text-warm">
                <ItemName id={rare} items={items} />
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function VeggieElderClient() {
  const { bundle, error } = useVeggieTrades();
  const { items } = useItems();

  if (error) return <p className="text-negative">{"The Veggie Elder's trades didn't load."}</p>;
  if (!bundle || !items) return <Loading>Loading trades…</Loading>;

  return (
    <div className="flex w-full max-w-[72rem] flex-col gap-[1.3rem]">
      <Card className={ui.section} bodyClassName={ui.sectionBody}>
        <p className={ui.note}>
          The Veggie Elder takes the first item on his list that you carry. Each hunting ground has
          its own list. He gives the first item for it, or the{" "}
          <span className="text-warm">orange one</span> {bundle.rareChance}% of the time, and always
          with Felyne Negotiations.
        </p>
        <Tabs
          label="Hunting ground"
          tabs={bundle.elders.map((e) => ({
            id: tradeMapsLabel(e.maps),
            label: tradeMapsLabel(e.maps),
            content: <TradeList rows={e.rows} items={items} />,
          }))}
        />
      </Card>
    </div>
  );
}
