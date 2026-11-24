"use client";

/**
 * The Maps page, laid out like the Veggie Elder: the maps down the left, a
 * selector over the map for its layouts (its item sets, which differ by rank
 * and board).
 */
import { useRef, useState } from "react";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import { LoadedAreaMap } from "@/components/AreaMap";
import { DetailBody, DetailCard, DetailName } from "@/components/DetailPanel";
import MapIcon from "@/components/MapIcon";
import SelectorBar, { SELECTOR_BAR_HEIGHT } from "@/components/SelectorBar";
import TreeScroll from "@/components/TreeScroll";
import { useLocale } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { useQuests } from "@/lib/client-data";
import type { MapEntry } from "@/lib/maps-data";

export default function MapsClient({ maps }: { maps: MapEntry[] }) {
  const { t: messages, game } = useLocale();
  const t = messages.quests.areaMap;
  const { quests } = useQuests();
  const [choice, setChoice] = useState({ map: 0, layout: 0 });
  const listRef = useRef<HTMLDivElement>(null);
  const entry = maps[Math.min(choice.map, maps.length - 1)];
  if (!entry) return null;
  const layoutCount = entry.layouts.length;
  const layoutIndex = Math.min(choice.layout, layoutCount - 1);
  const layout = entry.layouts[layoutIndex]!;
  const questTitle = (id: number) => {
    const quest = quests?.find((q) => q.id === id);
    return quest
      ? game.quest(quest.id, "title", quest.title)
      : messages.items.detail.unknownQuest(id);
  };
  // A layout of one quest is named for it; a shared one for the boards its
  // quests are on, with its first quest where two layouts have the same boards.
  const boardsOf = (l: MapEntry["layouts"][number]) =>
    l.hubs.map((hub) => messages.quests.hubs[hub]).join(" · ");
  const layoutLabel = (l: MapEntry["layouts"][number]) => {
    const boards = boardsOf(l);
    if (l.quests === 1 || !boards) return questTitle(l.questId);
    const twins = entry.layouts.filter((other) => other.quests > 1 && boardsOf(other) === boards);
    return twins.length > 1 ? `${boards} (${questTitle(l.questId)})` : boards;
  };

  return (
    <div className="split-page">
      <CardBox data-tree-panel className="mobile:h-[50vh] mobile:flex-none">
        <Card variant="weapon-tree">
          <TreeScroll treeKey="maps">
            <div ref={listRef} className="flex flex-col">
              {maps.map((m, i) => {
                const active = m === entry;
                return (
                  <button
                    key={m.map}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setChoice({ map: i, layout: 0 })}
                    className={cn(
                      "list-row w-full cursor-pointer border-0 text-left font-[inherit] text-white",
                      active ? "bg-(image:--gradient-hover-glow)" : "bg-transparent",
                    )}
                  >
                    <MapIcon map={m.map} className="mx-2 size-[3rem]" />
                    <p className="min-w-0 flex-1 truncate">{game.name("map", m.map)}</p>
                  </button>
                );
              })}
            </div>
          </TreeScroll>
        </Card>
      </CardBox>

      <DetailCard
        bar={
          layoutCount > 1 && (
            <SelectorBar
              edge="top"
              label={layoutLabel(layout)}
              groupLabel={t.layout}
              previousLabel={t.previousLayout}
              nextLabel={t.nextLayout}
              onStep={(by) =>
                setChoice({
                  map: choice.map,
                  layout: (layoutIndex + by + layoutCount) % layoutCount,
                })
              }
              count={`${layoutIndex + 1}/${layoutCount}`}
              countLabel={t.position(layoutIndex + 1, layoutCount)}
            />
          )
        }
      >
        {/* Room under the selector. */}
        {layoutCount > 1 && (
          <div className="flex-none" style={{ height: SELECTOR_BAR_HEIGHT }} aria-hidden="true" />
        )}
        <div className="flex items-center justify-center">
          <MapIcon map={entry.map} className="size-[3.6rem]" />
          <DetailName>{game.name("map", entry.map)}</DetailName>
        </div>
        <DetailBody>
          <LoadedAreaMap questId={layout.questId} />
        </DetailBody>
      </DetailCard>
    </div>
  );
}
