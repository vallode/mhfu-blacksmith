"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import PageBar, { PageTabs } from "@/components/PageBar";
import SelectorArrow from "@/components/SelectorArrow";
import SelectorBar, { SELECTOR_BAR_HEIGHT } from "@/components/SelectorBar";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { cn } from "@/lib/cn";
import { writeLastQuestHub } from "@/lib/last-quest-hub";
import { useQuests } from "@/lib/client-data";
import {
  clearedQuestIds,
  questHref,
  QUEST_HUB_SLUGS,
  questHubLabel,
  questsOnHub,
  questStarLevel,
  questStarLevels,
  questTypeLabel,
  questTypesIn,
  type QuestHubSlug,
  type QuestType,
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
  const level = questStarLevel(hub, stars);
  const label = `${level.g ? "G " : ""}${level.stars} ${level.stars === 1 ? "star" : "stars"}`;
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

/**
 * The quest board selector at the start of the page bar, "◀ Village ▶" like
 * the game's selectors: the arrows step through the boards, wrapping around.
 * Where the star levels don't fit beside it (and always on phones) they
 * wrap onto a row of their own below it.
 */
function HubSelector({ hub }: { hub: QuestHubSlug }) {
  const n = QUEST_HUB_SLUGS.length;
  const i = QUEST_HUB_SLUGS.indexOf(hub);
  const previous = QUEST_HUB_SLUGS[(i - 1 + n) % n]!;
  const next = QUEST_HUB_SLUGS[(i + 1) % n]!;
  return (
    <nav
      aria-label="Quest board"
      className="flex h-[52px] flex-none items-center mobile:w-full mobile:justify-center"
    >
      <SelectorArrow
        className="z-1 -mr-[1.2rem] size-[44px] flex-none"
        label={`Previous board: ${questHubLabel(previous)}`}
        href={`/quests/${previous}/`}
      />
      {/* Wide enough for the longest label ("Treasure Hunting"), so the
          arrows stay put as the board changes. */}
      <span className="box-content flex h-[44px] w-cells-16 items-center justify-center bg-selector px-[2.8rem] text-main leading-none whitespace-nowrap text-stat text-shadow-[2px_2px_0_rgb(0_0_0/0.6)]">
        {questHubLabel(hub)}
      </span>
      <SelectorArrow
        next
        className="z-1 -ml-[1.2rem] size-[44px] flex-none"
        label={`Next board: ${questHubLabel(next)}`}
        href={`/quests/${next}/`}
      />
    </nav>
  );
}

/** The footer filter's label for a quest type, or for every type (null). */
const typeFilterLabel = (type: QuestType | null) =>
  type ? questTypeLabel(type).replace(/ Quest$/, "") : "All quests";

/**
 * A quest board: the board's star levels as tabs in the page bar, the
 * selected level's quests down the left, with a selector at the bottom of
 * the card (like the weapon tree's filter bar) that filters them by type,
 * and the selected quest (or a prompt to pick one) on the right. With a
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
  const { quests, error } = useQuests();
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

  // The star level and type shown (null: every type). Opening a quest
  // switches to its level, and off a type that would hide it; the tabs and
  // the selector change them without leaving the quest.
  const [stars, setStars] = useState<number | null>(null);
  const [type, setType] = useState<QuestType | null>(null);
  const [syncedTo, setSyncedTo] = useState<number | null>(null);
  if (active && id !== syncedTo) {
    setSyncedTo(id);
    setStars(active.stars);
    if (type !== null && type !== active.type) setType(null);
  }
  const current = stars !== null && levels.includes(stars) ? stars : levels[0];
  const atLevel = onHub.filter((q) => q.stars === current);
  // Filtering only helps when the level has more than one type.
  const types = questTypesIn(atLevel);
  const filters: (QuestType | null)[] = types.length > 1 ? [null, ...types] : [null];
  const filter = filters.includes(type) ? type : null;
  const shown = filter ? atLevel.filter((q) => q.type === filter) : atLevel;

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

  const step = (by: 1 | -1) => {
    const i = filters.indexOf(filter);
    setType(filters[(i + by + filters.length) % filters.length] ?? null);
    scrollToTop();
  };

  const index = filters.indexOf(filter);

  return (
    <>
      <PageBar
        title={`${questHubLabel(hub)} quests`}
        tabs={
          <>
            <HubSelector hub={hub} />
            {levels.length > 0 && (
              <PageTabs label="Star levels">
                {levels.map((s) => (
                  <StarTab
                    key={s}
                    hub={hub}
                    stars={s}
                    active={s === current}
                    onSelect={() => {
                      setStars(s);
                      scrollToTop();
                    }}
                  />
                ))}
              </PageTabs>
            )}
          </>
        }
      />

      <div className="split-page">
        {/* Above the card (z-1) so the bar and its arrows draw over the frame. */}
        <CardBox data-tree-panel>
          <Card variant="weapon-tree">
            <div ref={listRef} className="flex flex-col">
              {error && <p className="px-[16px] text-negative">Couldn&apos;t load quests.</p>}
              {shown.map((q) => (
                <Link
                  key={q.id}
                  data-quest={q.id}
                  href={questHref(q)}
                  aria-current={q.id === id ? "page" : undefined}
                  className={cn("list-row pl-[16px]", q.id === id && "bg-white/10")}
                >
                  <p className="truncate">{q.title}</p>
                  {(cleared?.has(q.id) || q.urgent) && (
                    <span className="ml-auto flex flex-none gap-[1rem]">
                      {cleared?.has(q.id) && <span className="text-stat">CLEAR!!</span>}
                      {q.urgent && <span className="text-negative">Urgent</span>}
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
          {filters.length > 1 && (
            <SelectorBar
              label={typeFilterLabel(filter)}
              groupLabel="Quest type"
              previousLabel="Previous quest type"
              nextLabel="Next quest type"
              onStep={step}
              count={`${index + 1}/${filters.length}`}
              countLabel={`Quest type ${index + 1} of ${filters.length}`}
            />
          )}
        </CardBox>
        {children}
      </div>
    </>
  );
}
