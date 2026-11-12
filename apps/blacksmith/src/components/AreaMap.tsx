"use client";

import Link from "next/link";
import { useState } from "react";
import { Stat, StatList } from "@/components/DetailPanel";
import Loading from "@/components/Loading";
import { useLocale, useT } from "@/context/LanguageContext";
import { AREA_MAP_SIZE, areaMapSrc, nextSelection, type AreaMap as Data } from "@/lib/area-maps";
import { useAreaMap } from "@/lib/client-data";
import { cn } from "@/lib/cn";
import type { GatherKind } from "@/lib/item-places";
import { itemHref } from "@/lib/item-sources";

/** Each kind of point's marker colour; its name is `t.quests.areaMap.kinds[kind]`. */
const KINDS: { kind: GatherKind; marker: string }[] = [
  { kind: "gather", marker: "bg-gem-green" },
  { kind: "mine", marker: "bg-gem-orange" },
  { kind: "bug", marker: "bg-gem-yellow" },
];

const diamond = "block size-[1.1rem] rotate-45 border border-black";

const percent = (pixels: number) => `${(pixels / AREA_MAP_SIZE) * 100}%`;

/** A quest's Map tab; its data loads when the tab opens. */
export default function QuestAreaMap({ questId }: { questId: number }) {
  const t = useT().quests.areaMap;
  const { map, loading } = useAreaMap(questId);
  if (map) return <AreaMap map={map} />;
  if (loading) return <Loading>{t.loading}</Loading>;
  return <p className="text-negative">{t.loadError}</p>;
}

/** The game's map of a quest, with its gathering points on it. */
function AreaMap({ map }: { map: Data }) {
  const { t: messages, game, formatNumber } = useLocale();
  const t = messages.quests.areaMap;
  const [hidden, setHidden] = useState<ReadonlySet<GatherKind>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const point = selected === null ? undefined : map.points[selected];
  const shown = point && !hidden.has(point.kind) ? point : undefined;
  const label = (kind: GatherKind) => t.kinds[kind];
  const gatherCount = (fewest: number | null, most: number | null) => {
    if (fewest === null || most === null) return t.neverRunsOut;
    return fewest === most
      ? formatNumber(fewest)
      : t.gatherRange(formatNumber(fewest), formatNumber(most));
  };

  const toggle = (kind: GatherKind) => {
    const next = new Set(hidden);
    if (!next.delete(kind)) next.add(kind);
    setHidden(next);
  };

  const pick = (event: React.MouseEvent<HTMLButtonElement>, i: number) => {
    // A key press (detail 0) has no position, and means its own marker.
    if (event.detail === 0) {
      setSelected(selected === i ? null : i);
      return;
    }
    const button = event.currentTarget.getBoundingClientRect();
    const art = event.currentTarget.parentElement!.getBoundingClientRect();
    const scale = AREA_MAP_SIZE / art.width;
    const visible = map.points.flatMap(({ kind, x, y }, index) =>
      hidden.has(kind) ? [] : [{ x, y, index }],
    );
    setSelected(
      nextSelection(
        visible,
        (event.clientX - art.left) * scale,
        (event.clientY - art.top) * scale,
        (button.width / 2) * scale,
        selected,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto aspect-square w-full max-w-[48rem]">
        <img src={areaMapSrc(map.texture)} alt="" className="size-full pixelated" />
        {map.points.map((p, i) =>
          hidden.has(p.kind) ? null : (
            <button
              key={i}
              type="button"
              aria-label={t.pointLabel(t.area(p.area), label(p.kind))}
              aria-pressed={selected === i}
              onClick={(event) => pick(event, i)}
              style={{ left: percent(p.x), top: percent(p.y) }}
              className={cn(
                "absolute grid size-[2rem] -translate-1/2 cursor-pointer place-items-center border-0 bg-transparent p-0",
                selected === i && "z-10",
              )}
            >
              <span
                className={cn(
                  diamond,
                  KINDS.find((k) => k.kind === p.kind)!.marker,
                  selected === i && "outline-2 outline-white",
                )}
              />
            </button>
          ),
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        {KINDS.filter(({ kind }) => map.points.some((p) => p.kind === kind)).map(
          ({ kind, marker }) => (
            <button
              key={kind}
              type="button"
              aria-pressed={!hidden.has(kind)}
              onClick={() => toggle(kind)}
              className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 font-[inherit] text-small tracking-game text-white aria-[pressed=false]:opacity-40"
            >
              <span className={cn(diamond, marker)} />
              {label(kind)}
            </button>
          ),
        )}
      </div>

      {shown ? (
        <StatList>
          <Stat label={t.areaHeading(t.area(shown.area))}>
            <span className="whitespace-normal text-white">{label(shown.kind)}</span>
          </Stat>
          <Stat label={t.gathers}>
            <span className="text-white tabular-nums">
              {gatherCount(shown.gathers, shown.mostGathers)}
            </span>
          </Stat>
          {shown.items.map(({ item, chance }) => (
            <Stat
              key={item}
              label={
                <Link href={itemHref(item)} className="underline-offset-4 hover:underline">
                  {game.name("item", item)}
                </Link>
              }
            >
              <span className="text-white tabular-nums">{t.chance(formatNumber(chance))}</span>
            </Stat>
          ))}
        </StatList>
      ) : (
        <p className="text-center text-fine text-white/60">{t.hint}</p>
      )}
    </div>
  );
}
