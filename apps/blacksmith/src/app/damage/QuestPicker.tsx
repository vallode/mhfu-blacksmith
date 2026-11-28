"use client";

/**
 * The damage calculator's quest picker, in a sheet: a quest board, a search
 * by name or monster, and the board's quests with large monsters, by stars.
 * A quest's defense multiplier for its monster scales the damage it takes.
 */
import { useMemo, useState } from "react";
import Loading from "@/components/Loading";
import { SelectorRow } from "@/components/SettingRows";
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { useQuests } from "@/lib/client-data";
import { cn } from "@/lib/cn";
import { QUEST_HUB_SLUGS, type Quest, type QuestHubSlug } from "@/lib/quests";
import * as ui from "@/styles/settings";

const row =
  "grid w-full cursor-pointer grid-cols-[3.2rem_minmax(0,1fr)] items-center gap-x-[0.8rem] border-0 border-b border-white/15 bg-transparent px-[0.4rem] py-[0.6rem] text-left font-[inherit] text-small text-white hover:hover-glow focus-visible:hover-glow focus-visible:outline-none";

/** A quest's large monsters, each once, in its order. */
export const questMonsters = (q: Quest) => [...new Set(q.monsterStats.map((s) => s.monster.name))];

export default function QuestPicker({
  current,
  onPick,
}: {
  current: Quest | null;
  onPick: (quest: Quest) => void;
}) {
  const t = useT();
  const text = t.motionValues.page;
  const game = useGameText();
  const { formatNumber } = useLocale();
  const { quests, error } = useQuests();
  const [hub, setHub] = useState<QuestHubSlug>(current?.hub ?? "village");
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (s: string) => s.toLowerCase().includes(q);
    return (quests ?? [])
      .filter((x) => x.hub === hub && x.monsterStats.length > 0)
      .filter(
        (x) =>
          !q ||
          matches(x.title) ||
          matches(game.quest(x.id, "title", x.title)) ||
          questMonsters(x).some((m) => matches(m) || matches(game.name("monster", m))),
      )
      .sort((a, b) => a.stars - b.stars || a.id - b.id);
  }, [quests, hub, query, game]);

  return (
    <>
      <SelectorRow
        label={text.questBoard}
        choices={QUEST_HUB_SLUGS.map((h) => ({ value: h, label: t.quests.hubs[h] }))}
        value={hub}
        onChange={setHub}
      />
      <input
        className={ui.searchInput}
        type="search"
        aria-label={text.searchQuests}
        placeholder={text.searchQuestsPlaceholder}
        value={query}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error ? (
        <p className={ui.note}>{t.quests.loadError}</p>
      ) : !quests ? (
        <Loading>{t.common.loading}</Loading>
      ) : list.length === 0 ? (
        <p className={ui.note}>{text.noQuests}</p>
      ) : (
        <div className="flex flex-col">
          {list.map((q) => (
            <button
              key={q.id}
              type="button"
              aria-pressed={current?.id === q.id}
              className={cn(row, current?.id === q.id && "bg-accent")}
              onClick={() => onPick(q)}
            >
              <span className="text-gold tabular-nums">{text.stars(formatNumber(q.stars))}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{game.quest(q.id, "title", q.title)}</span>
                <span className="truncate text-fine text-parchment">
                  {questMonsters(q)
                    .map((m) => game.name("monster", m))
                    .join(", ")}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
