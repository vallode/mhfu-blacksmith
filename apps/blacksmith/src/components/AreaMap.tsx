"use client";

import Link from "next/link";
import { useState } from "react";
import { Stat, StatList } from "@/components/DetailPanel";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";
import MapIcon from "@/components/MapIcon";
import StepSelector from "@/components/StepSelector";
import { useLocale, useT } from "@/context/LanguageContext";
import { AREA_MAP_SIZE, areaMapSrc, nextSelection, type AreaMap as Data } from "@/lib/area-maps";
import { useAreaMap, useItems } from "@/lib/client-data";
import { cn } from "@/lib/cn";
import type { GatherKind, GatherPlace } from "@/lib/item-places";
import { gatherPointsLabel, groupLabel } from "@/lib/i18n/place-labels";
import type { GameText } from "@/lib/i18n/game-text";
import type { Messages } from "@/lib/i18n/messages";
import { groupBy, itemHref } from "@/lib/item-sources";
import { type Quest, type QuestSpawn, questHref } from "@/lib/quests";
import { leadSpawn, spawnAreas, type SpawnArea } from "@/lib/quest-spawns";

/** The mining and bug nodes' sprites (public/images/map-points); gathering points use an item icon. */
const NODE_SPRITES: Partial<Record<GatherKind, string>> = {
  mine: "/images/map-points/pickaxe.png",
  bug: "/images/map-points/net.png",
};

const percent = (pixels: number) => `${(pixels / AREA_MAP_SIZE) * 100}%`;

/** A monster's 36px sprite, from the slug of its monster page. */
function monsterSprite(href: string | null): string | null {
  const slug = href?.split("/").filter(Boolean).at(-1);
  return slug ? `/images/monsters/${slug}.png` : null;
}

/** An area's monsters as one marker: its lead monster's sprite. */
function MonsterAreaMarker({ area, selected }: { area: SpawnArea; selected: boolean }) {
  const spawn = leadSpawn(area.spawns);
  const src = monsterSprite(spawn.monster.href);
  const large = spawn.kind === "large";
  return (
    <span className="relative grid size-full place-items-center">
      {src ? (
        <img
          src={src}
          alt=""
          decoding="sync"
          className={cn(
            "object-contain drop-shadow-[0_0_2px_rgba(0,0,0,0.9)] pixelated",
            large ? "size-[3.2rem]" : "size-[2.6rem]",
            selected && "outline-2 outline-white",
          )}
        />
      ) : (
        <span
          className={cn(
            "block size-[1.1rem] rotate-45 border border-black",
            large ? "bg-gem-red" : "bg-gem-gray",
            selected && "outline-2 outline-white",
          )}
        />
      )}
      {area.monsters.length > 1 && (
        <span className="absolute -top-[0.4rem] -right-[0.4rem] grid h-[1.6rem] min-w-[1.8rem] place-items-center bg-black/80 px-[0.2rem] text-fine leading-none text-gem-yellow">
          ×{area.monsters.length}
        </span>
      )}
    </span>
  );
}

/** A quest's Map tab; its data loads when the tab opens. */
export default function QuestAreaMap({
  questId,
  spawns,
}: {
  questId: number;
  spawns?: QuestSpawn[];
}) {
  return <LoadedAreaMap questId={questId} spawns={spawns} />;
}

export function LoadedAreaMap({
  questId,
  gives,
  spawns,
}: {
  questId: number;
  gives?: (item: string) => boolean;
  spawns?: QuestSpawn[];
}) {
  const t = useT().quests.areaMap;
  const { map, loading } = useAreaMap(questId);
  if (map) return <AreaMap key={questId} map={map} gives={gives} spawns={spawns} />;
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

/** A gathering point or an area's monsters, as one selectable marker. */
interface Marker {
  key: string;
  area: number;
  x: number;
  y: number;
  point?: Data["points"][number];
  monsterArea?: SpawnArea;
}

/**
 * The game's map of a quest, with its gathering points and monster spawns on
 * it. With `gives`, the points that give that item are lit and the rest dimmed.
 */
function AreaMap({
  map,
  gives,
  spawns,
}: {
  map: Data;
  gives?: (item: string) => boolean;
  /** The quest's monster spawn markers; none on an item's map. */
  spawns?: QuestSpawn[];
}) {
  const { t: messages, game, formatNumber } = useLocale();
  const t = messages.quests.areaMap;
  const { items } = useItems();
  const [selected, setSelected] = useState<number | null>(null);
  const markers: Marker[] = [
    ...map.points.map((point, i) => ({
      key: `point-${i}`,
      area: point.area,
      x: point.x,
      y: point.y,
      point,
    })),
    ...spawnAreas(spawns ?? []).map((area, i) => ({
      key: `monsters-${i}`,
      area: area.area,
      x: area.x,
      y: area.y,
      monsterArea: area,
    })),
  ];
  // The item icon for a name, or the herb's before the items load.
  const iconOf = (name: string) => {
    const id = items?.idOf(name);
    const item = id === undefined ? undefined : items?.get(id);
    return item?.known ? { type: item.type, color: item.color } : { type: "herb", color: "green" };
  };
  /** A gathering point shows its likeliest item. */
  const nodeItem = (p: Data["points"][number]) =>
    p.items.reduce((best, it) => (it.chance > best.chance ? it : best), p.items[0]!).item;
  const lit = (m: Marker) =>
    !m.point || !gives || m.point.items.some(({ item, chance }) => chance > 0 && gives(item));
  const marker = selected === null ? undefined : markers[selected];
  const shown = marker;
  const label = (kind: GatherKind) => t.kinds[kind];
  const markerLabel = (m: Marker) =>
    m.monsterArea
      ? t.monsterAreaLabel(t.area(m.area), t.species(formatNumber(m.monsterArea.monsters.length)))
      : t.pointLabel(t.area(m.area), label(m.point!.kind));
  const gatherCount = (fewest: number | null, most: number | null) => {
    if (fewest === null || most === null) return t.neverRunsOut;
    return fewest === most
      ? formatNumber(fewest)
      : t.gatherRange(formatNumber(fewest), formatNumber(most));
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
    const visible = markers.map(({ x, y }, index) => ({ x, y, index }));
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
        {markers.map((m, i) => (
          <button
            key={m.key}
            type="button"
            aria-label={markerLabel(m)}
            aria-pressed={selected === i}
            onClick={(event) => pick(event, i)}
            style={{ left: percent(m.x), top: percent(m.y) }}
            className={cn(
              "absolute grid size-[3.2rem] -translate-1/2 cursor-pointer place-items-center border-0 bg-transparent p-0",
              m.point && gives && lit(m) && "z-1",
              selected === i && "z-10",
            )}
          >
            {m.monsterArea ? (
              <MonsterAreaMarker area={m.monsterArea} selected={selected === i} />
            ) : (
              <span
                className={cn(
                  "flex size-[3.2rem] items-center justify-center",
                  !lit(m) && "opacity-35",
                  selected === i && "opacity-100 outline-2 outline-white",
                )}
              >
                {NODE_SPRITES[m.point!.kind] || m.point!.items.length === 0 ? (
                  <img
                    src={NODE_SPRITES[m.point!.kind] ?? NODE_SPRITES.mine}
                    alt=""
                    className="size-[3.2rem] pixelated"
                  />
                ) : (
                  <Icon {...iconOf(nodeItem(m.point!))} className="mr-0" />
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {shown?.monsterArea ? (
        <StatList>
          <Stat label={t.areaHeading(t.area(shown.area))}>
            <span className="text-white">
              {t.species(formatNumber(shown.monsterArea.monsters.length))}
            </span>
          </Stat>
          {shown.monsterArea.monsters.map(({ spawn, quantity, endless }) => (
            <Stat
              key={`${spawn.kind}:${spawn.monster.name}`}
              label={
                spawn.monster.href ? (
                  <Link
                    href={spawn.monster.href}
                    className="whitespace-normal text-white underline-offset-4 hover:underline"
                  >
                    {game.name("monster", spawn.monster.name)}
                  </Link>
                ) : (
                  <span className="whitespace-normal text-white">
                    {game.name("monster", spawn.monster.name)}
                  </span>
                )
              }
            >
              <span className="text-white tabular-nums">
                {endless ? t.keepsSpawning : `×${formatNumber(quantity)}`}
              </span>
            </Stat>
          ))}
        </StatList>
      ) : shown?.point ? (
        <>
          <StatList>
            <Stat label={t.areaHeading(t.area(shown.area))}>
              <span className="whitespace-normal text-white">{label(shown.point.kind)}</span>
            </Stat>
            <Stat label={t.gathers}>
              <span className="text-white tabular-nums">
                {gatherCount(shown.point.gathers, shown.point.mostGathers)}
              </span>
            </Stat>
          </StatList>
          <div className="flex flex-col gap-y-[13px]">
            {shown.point.items.map(({ item, chance }) => {
              // The item whose page this is, in the item list's selected green.
              const own = gives?.(item);
              const icon = iconOf(item);
              return (
                <div key={item} className="flex items-center">
                  <Icon {...icon} />
                  <Link
                    href={itemHref(item)}
                    className={cn(
                      "w-cells-16 min-w-0 wrap-anywhere whitespace-normal underline-offset-4 hover:underline mobile:leading-[1.25]",
                      own ? "text-positive" : "text-white",
                    )}
                  >
                    {game.name("item", item)}
                  </Link>
                  <span
                    className={cn(
                      "flex-none whitespace-pre text-white tabular-nums mobile:ml-auto",
                      own && "text-positive",
                    )}
                  >
                    {`:${t.chance(formatNumber(chance)).padStart(5, " ")}`}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : markers.length === 0 ? (
        <p className="text-center text-fine whitespace-normal text-white/60">{t.empty}</p>
      ) : (
        <p className="text-center text-fine whitespace-normal text-white/60">
          {gives && `${t.litHint} `}
          {t.hint}
        </p>
      )}
    </div>
  );
}
