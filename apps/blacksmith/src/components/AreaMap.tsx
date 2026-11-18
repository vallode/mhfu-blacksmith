"use client";

import Link from "next/link";
import { useState } from "react";
import { Stat, StatList } from "@/components/DetailPanel";
import Loading from "@/components/Loading";
import MapIcon from "@/components/MapIcon";
import StepSelector from "@/components/StepSelector";
import { useLocale, useT } from "@/context/LanguageContext";
import { AREA_MAP_SIZE, areaMapSrc, nextSelection, type AreaMap as Data } from "@/lib/area-maps";
import { useAreaMap } from "@/lib/client-data";
import { cn } from "@/lib/cn";
import type { GatherKind, GatherPlace } from "@/lib/item-places";
import { gatherPointsLabel, groupLabel } from "@/lib/i18n/place-labels";
import type { GameText } from "@/lib/i18n/game-text";
import type { Messages } from "@/lib/i18n/messages";
import { groupBy, itemHref } from "@/lib/item-sources";
import { type Quest, questHref } from "@/lib/quests";

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
  return <LoadedAreaMap questId={questId} />;
}

function LoadedAreaMap({ questId, gives }: { questId: number; gives?: (item: string) => boolean }) {
  const t = useT().quests.areaMap;
  const { map, loading } = useAreaMap(questId);
  if (map) return <AreaMap key={questId} map={map} gives={gives} />;
  if (loading) return <Loading>{t.loading}</Loading>;
  return <p className="text-negative">{t.loadError}</p>;
}

/** A quest's title in the site's language, or "Quest 123" for one the list doesn't have. */
function questTitle(t: Messages, game: GameText, quests: ReadonlyMap<number, Quest>, id: number) {
  const quest = quests.get(id);
  return quest ? game.quest(id, "title", quest.title) : t.items.detail.unknownQuest(id);
}

/** "Snowy Mountains (Day)", or the quest whose own points these are ("Pokke Farm Tour +2"). */
function placeName(
  t: Messages,
  game: GameText,
  place: GatherPlace,
  quests: ReadonlyMap<number, Quest>,
): string {
  if (!place.quests) return game.name("map", place.map);
  const [first, ...rest] = place.quests.map((id) => questTitle(t, game, quests, id));
  return rest.length > 0 ? t.quests.areaMap.andMore(first!, rest.length) : first!;
}

/**
 * An item's Map tab: a rank (or quest board) and a map where its points are,
 * then that map with the points that give it lit. The rank's usual points
 * come first; a quest with its own points has its own entry. Changing the
 * rank keeps the map when the new rank has it.
 */
export function ItemAreaMap({
  places,
  quests,
  gives,
}: {
  /** The item's gathering places; those without a `mapQuest` are left out. */
  places: GatherPlace[];
  quests: ReadonlyMap<number, Quest>;
  /** Whether an item name on a point is this item. */
  gives: (item: string) => boolean;
}) {
  const { t: messages, game, formatNumber } = useLocale();
  const t = messages.quests.areaMap;
  const groups = groupBy(
    places.filter((p) => p.mapQuest !== undefined),
    (p) => p.group,
  );
  const [choice, setChoice] = useState({ group: 0, place: 0 });
  const groupIndex = Math.min(choice.group, groups.length - 1);
  const [group, rows] = groups[groupIndex] ?? [];
  if (!group || !rows) return null;
  const placeIndex = Math.min(choice.place, rows.length - 1);
  const place = rows[placeIndex]!;

  const pickGroup = (next: number) => {
    const nextRows = groups[next]![1];
    const same = nextRows.findIndex((p) => p.map === place.map && !p.quests);
    setChoice({ group: next, place: Math.max(0, same) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto flex w-full max-w-[48rem] flex-col gap-2">
        <StepSelector
          groupLabel={t.rank}
          previousLabel={t.previousRank}
          nextLabel={t.nextRank}
          label={<span className="truncate">{groupLabel(messages, group)}</span>}
          index={groupIndex}
          count={groups.length}
          countLabel={t.position(groupIndex + 1, groups.length)}
          onChange={pickGroup}
        />
        <StepSelector
          groupLabel={t.map}
          previousLabel={t.previousMap}
          nextLabel={t.nextMap}
          label={
            <>
              <MapIcon map={place.map} className="size-[2.4rem]" />
              <span className="truncate">{placeName(messages, game, place, quests)}</span>
            </>
          }
          index={placeIndex}
          count={rows.length}
          countLabel={t.position(placeIndex + 1, rows.length)}
          onChange={(next) => setChoice({ group: groupIndex, place: next })}
        />
        <p className="m-0 text-fine whitespace-normal text-white/60">
          {place.quests && (
            <>
              {t.onlyIn(
                game.name("map", place.map),
                place.quests.map((id, i) => {
                  const quest = quests.get(id);
                  const title = questTitle(messages, game, quests, id);
                  return (
                    <span key={id}>
                      {i > 0 && ", "}
                      {quest ? (
                        <Link
                          href={questHref(quest)}
                          className="underline-offset-4 hover:underline"
                        >
                          {title}
                        </Link>
                      ) : (
                        title
                      )}
                    </span>
                  );
                }),
              )}{" "}
              ·{" "}
            </>
          )}
          {gatherPointsLabel(messages.items.gathering, place.points)} ·{" "}
          {t.upTo(formatNumber(place.chance))}
        </p>
      </div>
      <LoadedAreaMap questId={place.mapQuest!} gives={gives} />
    </div>
  );
}

/**
 * The game's map of a quest, with its gathering points on it. With `gives`,
 * the points that give that item are lit and the rest dimmed.
 */
function AreaMap({ map, gives }: { map: Data; gives?: (item: string) => boolean }) {
  const { t: messages, game, formatNumber } = useLocale();
  const t = messages.quests.areaMap;
  const [hidden, setHidden] = useState<ReadonlySet<GatherKind>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const lit = (p: Data["points"][number]) =>
    !gives || p.items.some(({ item, chance }) => chance > 0 && gives(item));
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
                gives && lit(p) && "z-1",
                selected === i && "z-10",
              )}
            >
              <span
                className={cn(
                  diamond,
                  KINDS.find((k) => k.kind === p.kind)!.marker,
                  !lit(p) && "opacity-35",
                  selected === i && "opacity-100 outline-2 outline-white",
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
          {shown.items.map(({ item, chance }) => {
            // The item whose page this is, in the item list's selected green.
            const own = gives?.(item);
            return (
              <Stat
                key={item}
                label={
                  <Link
                    href={itemHref(item)}
                    className={cn("underline-offset-4 hover:underline", own && "text-positive")}
                  >
                    {game.name("item", item)}
                  </Link>
                }
              >
                <span className={cn("text-white tabular-nums", own && "text-positive")}>
                  {t.chance(formatNumber(chance))}
                </span>
              </Stat>
            );
          })}
        </StatList>
      ) : (
        <p className="text-center text-fine whitespace-normal text-white/60">
          {gives && `${t.litHint} `}
          {t.hint}
        </p>
      )}
    </div>
  );
}
