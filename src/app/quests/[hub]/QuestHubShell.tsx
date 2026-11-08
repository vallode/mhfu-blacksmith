"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Card from "@/components/Card";
import BorderRule from "@/components/BorderRule";
import QuestNav from "@/components/QuestNav";
import { cn } from "@/lib/cn";
import { useQuests } from "@/lib/client-data";
import { questHref, questsOnHub, type QuestHubSlug } from "@/lib/quests";

/** The quest ID in /quests/<hub>/<id>/, if the path has one. */
function activeQuestId(pathname: string, hub: string): number | null {
  const rest = pathname.split("/").filter(Boolean);
  if (rest[0] !== "quests" || rest[1] !== hub || !rest[2]) return null;
  const id = Number(rest[2]);
  return Number.isInteger(id) ? id : null;
}

/**
 * A quest board: the board's quests down the left, the selected quest (or a
 * prompt to pick one) on the right. Lives in the hub's layout so the list
 * stays mounted, keeping its scroll position, when a quest is selected.
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
  const id = activeQuestId(usePathname(), hub);
  const listRef = useRef<HTMLDivElement>(null);
  const revealed = useRef(false);

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

  return (
    <>
      <QuestNav back="/quests/" />
      <BorderRule />

      <div className="split-page">
        <Card variant="weapon-tree">
          <div ref={listRef} className="flex flex-col">
            {error && <p className="px-[16px] text-negative">Couldn&apos;t load quests.</p>}
            {onHub.map((q) => (
              <Link
                key={q.id}
                data-quest={q.id}
                href={questHref(q)}
                aria-current={q.id === id ? "page" : undefined}
                className={cn("list-row", q.id === id && "bg-white/10")}
              >
                <span className="w-cells-3 flex-none text-stat">{q.stars}★</span>
                <p className="truncate">{q.title}</p>
              </Link>
            ))}
          </div>
        </Card>
        {children}
      </div>
    </>
  );
}
