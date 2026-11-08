"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { cn } from "@/lib/cn";
import { formatRank, parseDropSource } from "@/lib/monster-drops";
import type { MonsterDrop } from "@/lib/types";

interface MonsterDropsProps {
  /** rank -> source -> items, as on the Monster type */
  drops: Record<string, Record<string, MonsterDrop[]>>;
}

const tab = [
  "cursor-pointer border-0 border-b-[3px] border-transparent bg-transparent px-[1.2rem] py-[0.4rem]",
  "font-[inherit] text-[1.6rem] tracking-game text-parchment",
  "hover:text-white focus-visible:text-white focus-visible:outline-none",
  "aria-selected:border-stat aria-selected:bg-selector aria-selected:text-stat",
].join(" ");

/**
 * Drop tables: one page per rank, chosen with a tab row like the game's menu
 * headers, then one list per source (carves, breaks, shiny drops, capture)
 * laid out two across. Each row is icon, item, quantity and chance.
 */
export default function MonsterDrops({ drops }: MonsterDropsProps) {
  const ranks = Object.keys(drops);
  const [rank, setRank] = useState(ranks[0]);
  const current = drops[rank] ?? drops[ranks[0]];
  if (!current) return null;

  return (
    <div className="flex flex-col gap-[1.6rem] text-[1.6rem]">
      <div
        role="tablist"
        aria-label="Rank"
        className="flex flex-wrap gap-[0.4rem] border-b border-hr/50"
      >
        {ranks.map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={r === rank}
            className={tab}
            onClick={() => setRank(r)}
          >
            {formatRank(r)}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        className="grid grid-cols-2 gap-x-[3.2rem] gap-y-[1.6rem] mobile:grid-cols-1"
      >
        {Object.entries(current).map(([source, items]) => (
          <DropSource key={source} source={source} items={items} />
        ))}
      </div>
    </div>
  );
}

function DropSource({ source, items }: { source: string; items: MonsterDrop[] }) {
  const { title, count, note } = parseDropSource(source);
  return (
    <section className="flex min-w-0 flex-col gap-[0.6rem]">
      <h3 className="m-0 flex flex-wrap items-baseline gap-x-[0.8rem] text-[1.6rem] leading-[1.25] font-normal text-gold">
        {title}
        {count !== undefined && <span className="text-muted">×{count}</span>}
        {note && (
          <span className="text-[1.3rem] leading-[1.25] whitespace-normal text-white/60">
            {note}
          </span>
        )}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-[0.2rem] p-0">
        {items.map((drop, i) => (
          <DropRow key={i} drop={drop} />
        ))}
      </ul>
    </section>
  );
}

function DropRow({ drop }: { drop: MonsterDrop }) {
  return (
    <li className="flex items-center gap-[0.8rem] leading-none text-white">
      <Icon type={drop.type || "ukwn"} color={drop.color} />
      <span className="min-w-0 flex-auto truncate">{drop.name}</span>
      {drop.quantity !== undefined && (
        <span className="flex-none text-muted">×{drop.quantity}</span>
      )}
      <span
        className={cn(
          "w-cells-4 flex-none text-right tabular-nums",
          drop.chance === "100%" && "text-positive",
        )}
      >
        {drop.chance}
      </span>
    </li>
  );
}
