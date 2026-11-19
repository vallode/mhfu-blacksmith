"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import MapIcon from "@/components/MapIcon";
import { dropQuantity } from "@/components/MonsterDrops";
import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";

const sourceName = "min-w-0 flex-1 truncate text-white underline-offset-4 mobile:whitespace-normal";

export interface LinkedName {
  name: string;
  /** Its page, when it has one */
  href?: string;
}

export function NameLink({ name, href }: LinkedName) {
  return href ? (
    <Link href={href} title={name} className="text-white underline-offset-4 hover:underline">
      {name}
    </Link>
  ) : (
    <span className="text-white">{name}</span>
  );
}

export interface SourceRow {
  /** One name, or several joined by "+" (a combination's ingredients), which wrap rather than cut */
  name: string | LinkedName[];
  /** The row's page, when it has one */
  href?: string;
  /** Before the name: a quest's star level */
  prefix?: string;
  /** Before the name: the map's icon (gathering points) */
  map?: string;
  /** Before the name: an item's icon */
  icon?: { type: string; color?: string; rarity?: number };
  /** How it's obtained, on the line below */
  detail: ReactNode;
  /** The loaded hunter has cleared this quest */
  cleared?: boolean;
  /** How many each success gives ("×3", "×1-3"), when it can be more than one */
  amount?: string;
  /** Right-hand column: a chance or a price */
  value: string;
  /** Highlight the value (a sure drop) */
  strong?: boolean;
}

/**
 * A titled list of sources: the monster, quest, map or shop (linked where it
 * has a page), how many each success gives, and the chance or price, with
 * how it's obtained on a line below.
 */
export function SourceList({ title, rows }: { title: string; rows: SourceRow[] }) {
  const cleared = useT().quests.cleared;
  // Only lists with amounts get the amount column, so chances stay next to the names.
  const showAmount = rows.some((r) => r.amount);
  // "×3" fits three cells; a range ("×1-3") takes five.
  const wideAmount = rows.some((r) => (r.amount?.length ?? 0) > 3);
  // Chances fit four cells ("100%"); prices can take more ("12000z").
  const wide = rows.some((r) => r.value.length > 4);
  return (
    <section className="flex min-w-0 flex-col gap-[0.6rem]">
      <h3 className="m-0 text-small leading-[1.25] font-normal text-gold">{title}</h3>
      <ul className="m-0 flex list-none flex-col gap-[0.8rem] p-0">
        {rows.map((r, i) => (
          <li key={i} className="flex min-w-0 gap-[0.8rem] leading-[1.25]">
            {r.prefix && <span className="w-cells-4 flex-none text-stat">{r.prefix}</span>}
            {r.map && <MapIcon map={r.map} />}
            {r.icon && <Icon type={r.icon.type} color={r.icon.color} rarity={r.icon.rarity} />}
            <div className="flex min-w-0 flex-1 flex-col gap-[0.2rem]">
              <div className="flex min-w-0 items-baseline gap-[0.8rem]">
                {typeof r.name !== "string" ? (
                  <span className="min-w-0 flex-1 whitespace-normal">
                    {r.name.map((n, j) => (
                      <Fragment key={j}>
                        {j > 0 && <span className="text-muted"> + </span>}
                        <NameLink {...n} />
                      </Fragment>
                    ))}
                  </span>
                ) : r.href ? (
                  <Link href={r.href} title={r.name} className={cn(sourceName, "hover:underline")}>
                    {r.name}
                  </Link>
                ) : (
                  <span title={r.name} className={sourceName}>
                    {r.name}
                  </span>
                )}
                {showAmount && (
                  <span className={wideAmount ? "w-cells-5 flex-none text-muted" : dropQuantity}>
                    {r.amount}
                  </span>
                )}
                <span
                  className={cn(
                    "flex-none text-right text-white tabular-nums",
                    wide ? "w-cells-7" : "w-cells-4",
                    r.strong && "text-positive",
                  )}
                >
                  {r.value}
                </span>
              </div>
              <p className="flex min-w-0 gap-[0.8rem] text-fine whitespace-normal text-white/60">
                <span className="min-w-0 flex-1">{r.detail}</span>
                {r.cleared && <span className="flex-none text-stat">{cleared}</span>}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
