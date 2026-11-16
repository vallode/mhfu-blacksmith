"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  DetailBody,
  DetailCard,
  DetailHeader,
  DetailName,
  DetailRule,
} from "@/components/DetailPanel";
import SaveUpload from "@/components/SaveUpload";
import { useGameText, useLocale } from "@/context/LanguageContext";
import { useSave } from "@/context/SaveContext";
import { cn } from "@/lib/cn";
import { useAwardText, useQuests } from "@/lib/client-data";
import {
  AWARDS,
  AWARD_GROUPS,
  awardProgress,
  awardTotals,
  type AwardProgress,
  type AwardTodo,
} from "@/lib/awards";
import { formatPlayTime, questProgress } from "@/lib/hunter-pages";
import type { AwardText } from "@/lib/i18n/game-text";
import { questHref, questStarLevel } from "@/lib/quests";
import { useAwardContext } from "./useAwardContext";
import { progressBar } from "@/styles/progress";

/** Label and value rows, the label in the panel's yellow and the value white. */
function Rows({ children }: { children: React.ReactNode }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-[2.4rem] gap-y-[1.1rem] leading-none">
      {children}
    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-stat">{label}</dt>
      <dd className="m-0 text-right text-white tabular-nums">{children}</dd>
    </>
  );
}

/** The detail card's prompt with no hunter loaded: load a save file. */
function NoHunter() {
  const text = useLocale().t.site.hunter;
  return (
    <DetailCard>
      <DetailHeader>
        <DetailName>{text.noHunter}</DetailName>
      </DetailHeader>
      <DetailBody>
        <div className="text-small text-white/70">{text.noHunterNote}</div>
        <Link href="/hunter/save/" className="text-white underline hover:text-stat">
          {text.pages.save}
        </Link>
      </DetailBody>
    </DetailCard>
  );
}

/** The Guild Card: who the hunter is and the totals of their records. */
export function GuildCardPage({ className }: { className?: string }) {
  const { t, formatNumber } = useLocale();
  const text = t.site.hunter;
  const { save } = useSave();
  const { quests } = useQuests();
  const progress = useMemo(
    () => (quests && save?.clearedQuests ? questProgress(quests, save) : null),
    [quests, save],
  );
  if (!save) return <NoHunter />;
  const monsters = save.monsters ?? [];
  const sum = (key: "kills" | "captures") => monsters.reduce((n, m) => n + m[key], 0);
  const of = (done: number, total: number) =>
    text.guildCard.of(formatNumber(done), formatNumber(total));
  return (
    <DetailCard className={className}>
      <DetailHeader>
        <DetailName>{save.name}</DetailName>
      </DetailHeader>
      <DetailBody>
        <Rows>
          {save.hunterRank !== undefined && <Row label={text.rank}>{save.hunterRank}</Row>}
          {save.sex && <Row label={text.guildCard.sex}>{text.sex[save.sex] ?? save.sex}</Row>}
          {save.playTime !== undefined && (
            <Row label={text.guildCard.playTime}>{formatPlayTime(save.playTime)}</Row>
          )}
          {save.zenny !== undefined && (
            <Row label={text.guildCard.zenny}>{formatNumber(save.zenny)}z</Row>
          )}
        </Rows>
        <DetailRule />
        <Rows>
          {progress && (
            <Row label={text.guildCard.questsCleared}>{of(progress.done, progress.total)}</Row>
          )}
          {save.monsters && (
            <>
              <Row label={text.guildCard.hunted}>{formatNumber(sum("kills"))}</Row>
              <Row label={text.guildCard.captured}>{formatNumber(sum("captures"))}</Row>
            </>
          )}
          <Row label={text.guildCard.items}>{formatNumber(save.items.length)}</Row>
          {save.equipment && (
            <Row label={text.guildCard.equipment}>{formatNumber(save.equipment.length)}</Row>
          )}
        </Rows>
      </DetailBody>
    </DetailCard>
  );
}

/** Quests cleared on each board, by star level, each level linking to the board. */
export function QuestProgressPage() {
  const { t, formatNumber } = useLocale();
  const text = t.site.hunter;
  const { save } = useSave();
  const { quests } = useQuests();
  const progress = useMemo(
    () => (quests && save?.clearedQuests ? questProgress(quests, save) : null),
    [quests, save],
  );
  if (!save) return <NoHunter />;
  const of = (done: number, total: number) =>
    text.guildCard.of(formatNumber(done), formatNumber(total));
  return (
    <DetailCard>
      <DetailHeader>
        <DetailName>{text.pages.quests}</DetailName>
        {progress && (
          <span className="ml-auto text-white tabular-nums">
            {of(progress.done, progress.total)}
          </span>
        )}
      </DetailHeader>
      <DetailBody>
        <div className="text-small text-white/70">{text.questProgress.note}</div>
        {progress?.boards.map((board) => (
          <section key={board.hub} className="flex flex-col gap-[0.8rem]">
            <DetailRule />
            <Link
              href={`/quests/${board.hub}/`}
              className="flex items-baseline text-white hover:text-stat"
            >
              <h3 className="m-0 font-normal">{t.quests.hubs[board.hub]}</h3>
              <span className="ml-auto tabular-nums">{of(board.done, board.total)}</span>
            </Link>
            <ul className="m-0 flex list-none flex-col gap-[0.6rem] p-0 text-small">
              {board.levels.map((level) => {
                const { stars, g } = questStarLevel(board.hub, level.stars);
                const name = t.quests.board.starLevel(stars, g);
                const done = level.done === level.total;
                return (
                  <li
                    key={level.stars}
                    className="grid grid-cols-[calc(9*var(--cell))_minmax(0,1fr)_calc(6*var(--cell))] items-center gap-x-[1.2rem]"
                  >
                    <span className={cn(done ? "text-positive" : "text-stat")}>{name}</span>
                    <progress
                      className={progressBar}
                      value={level.done}
                      max={level.total}
                      aria-label={text.questProgress.level(name, level.done, level.total)}
                    />
                    <span
                      className={cn(
                        "text-right tabular-nums",
                        done ? "text-positive" : "text-white",
                      )}
                    >
                      {of(level.done, level.total)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </DetailBody>
    </DetailCard>
  );
}

/** One thing left for an award, linking to its quest or monster page. */
function TodoLink({ todo }: { todo: AwardTodo }) {
  const { t } = useLocale();
  const game = useGameText();
  if (todo.kind === "quest") {
    const { quest } = todo;
    const { stars, g } = questStarLevel(quest.hub, quest.stars);
    return (
      <Link href={questHref(quest)} className="flex gap-[1.2rem] text-white hover:text-stat">
        <span className="w-cells-4 flex-none text-stat">
          {g && "G"}
          {stars}★
        </span>
        <span className="min-w-0 truncate">
          {game.quest(quest.id, "title", quest.title)}
          <span className="sr-only"> ({t.quests.hubs[quest.hub]})</span>
        </span>
      </Link>
    );
  }
  const { monster } = todo;
  const name = game.name("monster", monster.name);
  return "slug" in monster ? (
    <Link
      href={`/monsters/${monster.category}/${monster.slug}/`}
      className="text-white hover:text-stat"
    >
      {name}
    </Link>
  ) : (
    <span className="text-white">{name}</span>
  );
}

/** An award's status at the right of its row: earned, a count, or why there's none. */
function AwardStatus({ progress }: { progress: AwardProgress }) {
  const { t, formatNumber } = useLocale();
  const text = t.site.hunter;
  switch (progress.status) {
    case "earned":
      return <span className="text-positive">{text.awards.done}</span>;
    case "untracked":
      return <span className="text-unavailable">{text.awards.notTracked}</span>;
    case "loading":
      return <span className="text-white/50">…</span>;
    case "progress":
      return progress.total === 1 ? (
        <span className="text-stat">{text.awards.notHunted}</span>
      ) : (
        <span className="text-white tabular-nums">
          {text.guildCard.of(formatNumber(progress.done), formatNumber(progress.total))}
        </span>
      );
  }
}

/** One award: its name and the game's description of it, its status, and what's left of it. */
function AwardRow({
  index,
  english,
  progress,
}: {
  /** The award's index in `AWARDS`: its ID in the award text. */
  index: number;
  english: AwardText;
  progress: AwardProgress;
}) {
  const text = useLocale().t.site.hunter;
  const game = useGameText();
  const counted = progress.status === "progress" && progress.total > 1;
  return (
    <li className="flex flex-col gap-[0.6rem]">
      <div className="flex items-baseline gap-x-[1.6rem]">
        <h4
          className={cn(
            "m-0 min-w-0 font-normal",
            progress.status === "earned"
              ? "text-positive"
              : progress.status === "untracked"
                ? "text-white/60"
                : "text-white",
          )}
        >
          {game.award(index, "name", english.name)}
        </h4>
        <span className="ml-auto flex-none text-small">
          <AwardStatus progress={progress} />
        </span>
      </div>
      <div className="text-small text-white/60">
        {game.award(index, "description", english.description)}
      </div>
      {counted && (
        <>
          <progress
            className={progressBar}
            value={progress.done}
            max={progress.total}
            aria-label={text.awards.earnedLabel(progress.done, progress.total)}
          />
          <details className="text-small">
            <summary className="cursor-pointer text-stat hover:text-white">
              {text.awards.showLeft(progress.todo.length)}
            </summary>
            <ul className="m-0 mt-[0.6rem] flex list-none flex-col gap-[0.4rem] p-0">
              {progress.todo.map((todo) => (
                <li key={todo.kind === "quest" ? todo.quest.id : todo.monster.name}>
                  <TodoLink todo={todo} />
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </li>
  );
}

/**
 * The Guild Card's awards, by kind: earned, how far along, or not readable
 * from a save yet, each with what's left to do.
 */
export function AwardsPage() {
  const { t } = useLocale();
  const text = t.site.hunter;
  const ctx = useAwardContext();
  const { awards: english } = useAwardText();
  const rows = useMemo(
    () => AWARDS.map((award, index) => ({ award, index, progress: awardProgress(award, ctx) })),
    [ctx],
  );
  if (!ctx.save) return <NoHunter />;
  const { earned, tracked } = awardTotals(ctx);
  return (
    <DetailCard>
      <DetailHeader>
        <DetailName>{text.pages.awards}</DetailName>
        <span
          className="ml-auto text-white tabular-nums"
          aria-label={text.awards.earnedLabel(earned, tracked)}
        >
          {text.awards.earned(earned, tracked)}
        </span>
      </DetailHeader>
      <DetailBody>
        <div className="text-small text-white/70">{text.awards.note}</div>
        {AWARD_GROUPS.map((group) => (
          <section key={group} className="flex flex-col gap-[1.2rem]">
            <DetailRule />
            <h3 className="m-0 font-normal text-stat">{text.awards.groups[group]}</h3>
            <ul className="m-0 flex list-none flex-col gap-[1.6rem] p-0">
              {english &&
                rows
                  .filter((r) => r.award.group === group)
                  .map((r) => (
                    <AwardRow
                      key={r.award.id}
                      index={r.index}
                      english={english[r.index]!}
                      progress={r.progress}
                    />
                  ))}
            </ul>
          </section>
        ))}
      </DetailBody>
    </DetailCard>
  );
}

/** The save file: load one, pick its hunter. */
export function SaveFilePage() {
  return <SaveUpload />;
}

/**
 * /hunter/: beside the list on wider screens, the Guild Card, or the save
 * file without a hunter. Phones show the list alone, or with the save file
 * under it when there is no hunter to show.
 */
export function HunterHome() {
  const { save } = useSave();
  return save ? <GuildCardPage className="mobile:hidden" /> : <SaveUpload />;
}
