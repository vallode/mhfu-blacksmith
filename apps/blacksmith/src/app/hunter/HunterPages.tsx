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
import { useLocale } from "@/context/LanguageContext";
import { useSave } from "@/context/SaveContext";
import { cn } from "@/lib/cn";
import { useQuests } from "@/lib/client-data";
import { formatPlayTime, questProgress } from "@/lib/hunter-pages";
import { questStarLevel } from "@/lib/quests";
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
