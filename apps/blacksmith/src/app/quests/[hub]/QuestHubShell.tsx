"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import PageBar, { PageTabs } from "@/components/PageBar";
import Icon from "@/components/Icon";
import SelectorBar, { SELECTOR_BAR_HEIGHT } from "@/components/SelectorBar";
import TypeBar, { TypeBarSpace, typeBarScrollPadding } from "@/components/TypeBar";
import { usePreferences } from "@/context/PreferencesContext";
import { useGameText, useT } from "@/context/LanguageContext";
import { useSave } from "@/context/SaveContext";
import { cn } from "@/lib/cn";
import { writeLastQuestHub } from "@/lib/last-quest-hub";
import { useQuests } from "@/lib/client-data";
import {
  clearedQuestIds,
  matchesQuestFilter,
  questFilters,
  questHref,
  QUEST_HUBS,
  questsOnHub,
  questStarLevel,
  questStarLevels,
  DOWNLOADED_QUEST_HUBS,
  sameQuestFilter,
  type QuestFilter,
  type QuestHubSlug,
} from "@/lib/quests";

/** The quest ID in /quests/<hub>/<id>/, if the path has one. */
function activeQuestId(pathname: string, hub: string): number | null {
  const rest = pathname.split("/").filter(Boolean);
  if (rest[0] !== "quests" || rest[1] !== hub || !rest[2]) return null;
  const id = Number(rest[2]);
  return Number.isInteger(id) ? id : null;
}

/** One star level's tab in the page bar: its stars' count and a star, green when shown. */
function StarTab({
  hub,
  stars,
  active,
  onSelect,
}: {
  hub: QuestHubSlug;
  stars: number;
  active: boolean;
  onSelect: () => void;
}) {
  const t = useT().quests;
  const level = questStarLevel(hub, stars);
  const label = t.board.starLevel(level.stars, level.g);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      title={label}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex h-[52px] flex-none cursor-pointer items-center gap-[0.4rem] border-none bg-transparent px-[1rem] text-main leading-none text-white/60 hover:text-white",
        active && "text-positive hover:text-positive",
      )}
    >
      <span aria-hidden="true">
        {level.g && "G"}
        {level.stars}
      </span>
      <img
        src="/images/star.png"
        alt=""
        className={cn(
          "aspect-[13/14] w-[26px] pixelated",
          !active && "opacity-60 grayscale group-hover:opacity-100 group-hover:grayscale-0",
        )}
      />
    </button>
  );
}

/** A quest's star level at the end of its row, on a board that lists every level together. */
function RowStars({ hub, stars }: { hub: QuestHubSlug; stars: number }) {
  const t = useT().quests;
  const level = questStarLevel(hub, stars);
  return (
    // Relative, so the screen-reader text stays inside the scrolling card
    // instead of stretching the page.
    <span className="relative ml-auto flex flex-none items-center gap-[0.4rem] pl-[0.8rem] text-white/60">
      <span aria-hidden="true">
        {level.g && "G"}
        {level.stars}
      </span>
      <img src="/images/star.png" alt="" className="aspect-[13/14] w-[20px] pixelated" />
      <span className="sr-only">{t.board.starLevel(level.stars, level.g)}</span>
    </span>
  );
}

/**
 * The top row of a board's quest list: a back arrow and the board's name,
 * leading to the list of boards (/quests/), the way into another board.
 */
function BoardBackRow({ hub }: { hub: QuestHubSlug }) {
  const t = useT().quests;
  return (
    <Link href="/quests/" className="list-row" aria-label={t.board.backToBoards(t.hubs[hub])}>
      <Icon type="arrow" alt="" />
      <p className="truncate text-stat">{t.hubs[hub]}</p>
    </Link>
  );
}

/**
 * /quests/: the same frame as a board's page (without its bar of star
 * levels), with the quest boards in the list card and a prompt on the right. The sidebar's Quests entry skips it,
 * opening the board last viewed; a board's back row leads here.
 */
export function QuestBoardsShell({ children }: { children: React.ReactNode }) {
  const t = useT().quests;
  return (
    <div className="split-page">
      <CardBox data-tree-panel>
        <Card variant="weapon-tree">
          {/* Inset 13px, like the lists in TreeScroll (items, decorations). */}
          <nav aria-label={t.board.boards} className="flex flex-col pl-[13px]">
            {QUEST_HUBS.map((h) => (
              <Link key={h.slug} href={`/quests/${h.slug}/`} className="list-row">
                <Icon type="ticket" alt="" />
                <p className="truncate">{t.hubs[h.slug]}</p>
              </Link>
            ))}
          </nav>
        </Card>
      </CardBox>
      {children}
    </div>
  );
}

/**
 * A quest board: the board's star levels as tabs in the page bar, the
 * selected level's quests down the left (under a row back to the boards), with a selector at the bottom of
 * the card (like the weapon tree's filter bar) that filters them by type,
 * and the selected quest (or a prompt to pick one) on the right. A board
 * On phones the star levels move from the page bar to a TypeBar over the
 * top of the list card. A board
 * of downloaded quests (`DOWNLOADED_QUEST_HUBS`), with few quests, has no tabs: it lists every
 * quest, each with its star level, and its selector filters by rank too. With a
 * hunter loaded, the quests they have cleared are marked CLEAR!!, like the
 * game's quest sheet. Lives in the hub's layout so the list stays mounted,
 * keeping its scroll position, when a quest is selected.
 */
export default function QuestHubShell({
  hub,
  children,
}: {
  hub: QuestHubSlug;
  children: React.ReactNode;
}) {
  const all = useT();
  const t = all.quests;
  const game = useGameText();
  const { quests, error } = useQuests();
  const single = DOWNLOADED_QUEST_HUBS.has(hub);
  const onHub = quests ? questsOnHub(quests, hub) : [];
  const levels = questStarLevels(onHub);
  const id = activeQuestId(usePathname(), hub);
  const active = onHub.find((q) => q.id === id);
  const listRef = useRef<HTMLDivElement>(null);
  const { save } = useSave();
  const { markCleared } = usePreferences().prefs;
  const cleared = useMemo(() => (markCleared ? clearedQuestIds(save) : null), [markCleared, save]);
  const revealed = useRef(false);

  // Remember the board so the main menu's "Quests" entry reopens it.
  useEffect(() => writeLastQuestHub(hub), [hub]);

  // The star level and filter shown (null: every quest). Opening a quest
  // switches to its level, and off a filter that would hide it; the tabs and
  // the selector change them without leaving the quest.
  const [stars, setStars] = useState<number | null>(null);
  const [chosen, setChosen] = useState<QuestFilter | null>(null);
  const [syncedTo, setSyncedTo] = useState<number | null>(null);
  if (active && id !== syncedTo) {
    setSyncedTo(id);
    setStars(active.stars);
    if (!matchesQuestFilter(active, chosen)) setChosen(null);
  }
  const current = stars !== null && levels.includes(stars) ? stars : levels[0];
  const atLevel = single ? onHub : onHub.filter((q) => q.stars === current);
  // Filtering only helps when there is more than one type (or rank) to pick.
  const filters: (QuestFilter | null)[] = [null, ...questFilters(atLevel, hub)];
  const index = Math.max(
    0,
    filters.findIndex((f) => sameQuestFilter(f, chosen)),
  );
  const filter = filters[index] ?? null;
  const shown = atLevel.filter((q) => matchesQuestFilter(q, filter));

  // On the first load of a quest page, bring its row into view.
  const ready = onHub.length > 0;
  useEffect(() => {
    if (!ready || revealed.current) return;
    revealed.current = true;
    if (id !== null) {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-quest="${id}"]`)
        ?.scrollIntoView({ block: "center" });
    }
  }, [ready, id]);

  // The list's scroll container is the card's body around it.
  const scrollToTop = () => listRef.current?.parentElement?.scrollTo({ top: 0 });

  const showLevel = (s: number) => {
    setStars(s);
    scrollToTop();
  };

  const step = (by: 1 | -1) => {
    setChosen(filters[(index + by + filters.length) % filters.length] ?? null);
    scrollToTop();
  };

  const filterLabel = !filter
    ? t.board.allQuests
    : "rank" in filter
      ? all.common.ranks[filter.rank]
      : t.types[filter.type];

  return (
    <>
      {/* Phones leave it off: a board's star levels are in the list card's
          TypeBar, and a board of downloaded quests has no tabs to show. */}
      <PageBar
        hideOnPhone
        title={t.board.title(t.hubs[hub])}
        tabs={
          !single &&
          levels.length > 0 && (
            <PageTabs label={t.board.starLevels}>
              {levels.map((s) => (
                <StarTab
                  key={s}
                  hub={hub}
                  stars={s}
                  active={s === current}
                  onSelect={() => showLevel(s)}
                />
              ))}
            </PageTabs>
          )
        }
      />

      <div className="split-page">
        {/* Above the card (z-1) so the bar and its arrows draw over the frame. */}
        <CardBox data-tree-panel>
          <Card variant="weapon-tree" bodyClassName={single ? undefined : typeBarScrollPadding}>
            {!single && <TypeBarSpace />}
            {/* Inset 13px, like the lists in TreeScroll (items, decorations). */}
            <div ref={listRef} className="flex flex-col pl-[13px]">
              <BoardBackRow hub={hub} />
              {error && <p className="px-[16px] text-negative">{t.loadError}</p>}
              {shown.map((q) => (
                <Link
                  key={q.id}
                  data-quest={q.id}
                  href={questHref(q)}
                  aria-current={q.id === id ? "page" : undefined}
                  className={cn("list-row", q.id === id && "bg-(image:--gradient-hover-glow)")}
                >
                  <p className={cn("truncate", q.urgent && "text-negative")}>
                    {game.quest(q.id, "title", q.title)}
                    {q.urgent && <span className="sr-only">{t.board.urgent}</span>}
                  </p>
                  {single && <RowStars hub={hub} stars={q.stars} />}
                  {cleared?.has(q.id) && (
                    <span className={cn("flex-none text-stat", !single && "ml-auto")}>
                      {t.cleared}
                    </span>
                  )}
                </Link>
              ))}
            </div>
            {/* Room to scroll the last rows clear of the star bar. */}
            {filters.length > 1 && (
              <div
                className="flex-none"
                style={{ height: SELECTOR_BAR_HEIGHT }}
                aria-hidden="true"
              />
            )}
          </Card>
          {!single && current !== undefined && (
            <TypeBar
              types={levels}
              current={current}
              onSelect={showLevel}
              name={(s) => {
                const level = questStarLevel(hub, s);
                return t.board.starLevel(level.stars, level.g);
              }}
              icon={(_, place) =>
                place === "bar" ? (
                  <img
                    src="/images/star.png"
                    alt=""
                    className="mr-[1rem] aspect-[13/14] w-[26px] flex-none pixelated"
                  />
                ) : (
                  // The grid's 52px icon slot, with the star at three times
                  // its pixels.
                  <span className="flex size-[52px] items-center justify-center">
                    <img
                      src="/images/star.png"
                      alt=""
                      className="aspect-[13/14] w-[39px] pixelated"
                    />
                  </span>
                )
              }
              labels={{
                group: t.board.starLevelGroup,
                previous: t.board.previousStarLevel,
                next: t.board.nextStarLevel,
                choose: t.board.chooseStarLevel,
                grid: t.board.starLevels,
              }}
            />
          )}
          {filters.length > 1 && (
            <SelectorBar
              label={filterLabel}
              groupLabel={t.board.filter}
              previousLabel={t.board.previousFilter}
              nextLabel={t.board.nextFilter}
              onStep={step}
              count={`${index + 1}/${filters.length}`}
              countLabel={t.board.filterOf(index + 1, filters.length)}
            />
          )}
        </CardBox>
        {children}
      </div>
    </>
  );
}
