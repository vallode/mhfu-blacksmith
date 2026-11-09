"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Card from "@/components/Card";
import BorderRule from "@/components/BorderRule";
import QuestNav from "@/components/QuestNav";
import SelectorBar, { SELECTOR_BAR_HEIGHT } from "@/components/SelectorBar";
import StarMarks from "@/components/StarMarks";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { cn } from "@/lib/cn";
import { useQuests } from "@/lib/client-data";
import {
  clearedQuestIds,
  questHref,
  questsOnHub,
  questStarLevel,
  questStarLevels,
  type QuestHubSlug,
} from "@/lib/quests";

/** The quest ID in /quests/<hub>/<id>/, if the path has one. */
function activeQuestId(pathname: string, hub: string): number | null {
  const rest = pathname.split("/").filter(Boolean);
  if (rest[0] !== "quests" || rest[1] !== hub || !rest[2]) return null;
  const id = Number(rest[2]);
  return Number.isInteger(id) ? id : null;
}

/**
 * A quest board: one star level's quests down the left, with a selector at
 * the bottom of the card (like the weapon tree's filter bar) that steps
 * through the board's star levels, and the selected quest (or a prompt to
 * pick one) on the right. With a hunter loaded, the quests they have
 * cleared are marked CLEAR!!, like the game's quest sheet. Lives in the hub's layout so the list stays
 * mounted, keeping its scroll position, when a quest is selected.
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
  const activeStars = onHub.find((q) => q.id === id)?.stars;
  const listRef = useRef<HTMLDivElement>(null);
  const { save } = useSave();
  const { markCleared } = usePreferences().prefs;
  const cleared = useMemo(() => (markCleared ? clearedQuestIds(save) : null), [markCleared, save]);
  const revealed = useRef(false);

  // The star level shown. Opening a quest switches to its level; the
  // selector changes it without leaving the quest.
  const [stars, setStars] = useState<number | null>(null);
  const [syncedTo, setSyncedTo] = useState<number | null>(null);
  if (activeStars !== undefined && id !== syncedTo) {
    setSyncedTo(id);
    setStars(activeStars);
  }
  const current = stars !== null && levels.includes(stars) ? stars : levels[0];
  const shown = onHub.filter((q) => q.stars === current);

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

  const step = (by: 1 | -1) => {
    const i = levels.indexOf(current ?? levels[0]);
    setStars(levels[(i + by + levels.length) % levels.length]);
    // The list's scroll container is the card around it.
    listRef.current?.parentElement?.scrollTo({ top: 0 });
  };

  const index = current === undefined ? -1 : levels.indexOf(current);

  return (
    <>
      <QuestNav back="/quests/" />
      <BorderRule />

      <div className="split-page">
        {/* Above the card (z-1) so the bar and its arrows draw over the frame. */}
        <div data-tree-panel className="relative z-2 flex min-h-0 min-w-0 flex-1 flex-col">
          <Card variant="weapon-tree">
            <div ref={listRef} className="flex flex-col">
              {error && <p className="px-[16px] text-negative">Couldn&apos;t load quests.</p>}
              {shown.map((q) => (
                <Link
                  key={q.id}
                  data-quest={q.id}
                  href={questHref(q)}
                  aria-current={q.id === id ? "page" : undefined}
                  className={cn("list-row", q.id === id && "bg-white/10")}
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
            {index >= 0 && (
              <div
                className="flex-none"
                style={{ height: SELECTOR_BAR_HEIGHT }}
                aria-hidden="true"
              />
            )}
          </Card>
          {index >= 0 && (
            <SelectorBar
              label={
                <StarMarks {...questStarLevel(hub, current ?? 0)} scale={2} className="flex" />
              }
              groupLabel="Quest star level"
              previousLabel="Previous star level"
              nextLabel="Next star level"
              onStep={step}
              count={`${index + 1}/${levels.length}`}
              countLabel={`Star level ${index + 1} of ${levels.length}`}
            />
          )}
        </div>
        {children}
      </div>
    </>
  );
}
