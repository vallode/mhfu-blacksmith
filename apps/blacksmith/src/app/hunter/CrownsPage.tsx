"use client";

import { useMemo } from "react";
import Link from "next/link";
import CrownIcon from "@/components/CrownIcon";
import {
  DetailBody,
  DetailCard,
  DetailHeader,
  DetailName,
  DetailRule,
} from "@/components/DetailPanel";
import { useGameText, useLocale } from "@/context/LanguageContext";
import { useSave } from "@/context/SaveContext";
import { cn } from "@/lib/cn";
import {
  crownProgress,
  type CrownGroupMonster,
  type CrownGroupProgress,
} from "@/lib/hunter-crowns";
import { NoHunter } from "./HunterPages";

/** A crown group's monsters, each linking to its page. */
function GroupNames({ group }: { group: CrownGroupProgress }) {
  const game = useGameText();
  return (
    <div className="min-w-0 text-small leading-[1.35]">
      {group.names.map((name, i) => {
        const monster = group.monsters.find((m) => m.name === name);
        const label = game.name("monster", name);
        return (
          <span key={name}>
            {i > 0 && <span className="text-white/40">, </span>}
            {monster ? (
              <Link
                href={`/monsters/${monster.category}/${monster.slug}/`}
                className="text-white hover:text-stat"
              >
                {label}
              </Link>
            ) : (
              <span className="text-white">{label}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** A group's count of hunts, or that it hasn't been hunted. */
function GroupHunts({ group }: { group: CrownGroupProgress }) {
  const { t, formatNumber } = useLocale();
  const c = t.site.hunter.crowns;
  return (
    <span className="flex-none text-fine text-white/50">
      {group.hunts > 0 ? c.hunted(formatNumber(group.hunts)) : c.notHunted}
    </span>
  );
}

/**
 * The crowns a group is still missing, as the Awards page shows what's left:
 * a short label, then the missing crowns' sprites dimmed beside it. A complete
 * group just says so.
 */
function CrownStatus({ group }: { group: CrownGroupProgress }) {
  const { t } = useLocale();
  const c = t.site.hunter.crowns;
  const missingGold = group.largestCrown !== "gold";
  const missingMini = group.smallestCrown !== "mini";
  if (!missingGold && !missingMini) {
    return <span className="text-positive">{c.complete}</span>;
  }
  const label =
    missingGold && missingMini ? c.missingBoth : missingGold ? c.missingGold : c.missingMini;
  return (
    <span className="flex items-center gap-[0.4rem]">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="flex items-center gap-[0.4rem]">
        <span className="text-stat">{c.missing}</span>
        {missingGold && (
          <span className="opacity-30">
            <CrownIcon crown="gold" />
          </span>
        )}
        {missingMini && (
          <span className="opacity-30">
            <CrownIcon crown="mini" />
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * One size record, inline in the group's detail row: its name, the size as the
 * Guild Card shows it, the crown it earns, then the size that would (gold or
 * mini).
 */
function SizeRecord({
  label,
  size,
  crown,
  cutoff,
}: {
  label: string;
  size: number | null;
  crown: CrownGroupProgress["largestCrown"];
  /** The cutoff as the card shows it, already labelled (gold or mini). */
  cutoff: string | null;
}) {
  const { formatNumber } = useLocale();
  return (
    <span className="flex flex-wrap items-baseline gap-x-[0.6rem]">
      <span className="text-stat">{label}</span>
      <span className={cn("text-white tabular-nums", size === null && "text-unavailable")}>
        {size === null ? "—" : formatNumber(Math.round(size))}
      </span>
      {crown && <CrownIcon crown={crown} />}
      {cutoff && <span className="text-fine text-white/50">{cutoff}</span>}
    </span>
  );
}

/** One crown group: its monsters and status, then the size records and cutoffs. */
function CrownGroupRow({ group }: { group: CrownGroupProgress }) {
  const { t, formatTenths } = useLocale();
  const c = t.site.hunter.crowns;
  return (
    <li className="flex flex-col gap-[0.4rem]">
      <div className="flex items-baseline gap-x-[1.6rem]">
        <div className="min-w-0 flex-1">
          <GroupNames group={group} />
        </div>
        <span className="flex-none text-small">
          <CrownStatus group={group} />
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-[2.4rem] gap-y-[0.4rem] text-small mobile:text-fine compact:text-fine">
        <GroupHunts group={group} />
        <SizeRecord
          label={c.largest}
          size={group.largestSize}
          crown={group.largestCrown}
          cutoff={group.cutoffs ? c.goldCutoff(formatTenths(group.cutoffs.gold)) : null}
        />
        <SizeRecord
          label={c.smallest}
          size={group.smallestSize}
          crown={group.smallestCrown}
          cutoff={group.cutoffs ? c.miniCutoff(formatTenths(group.cutoffs.mini)) : null}
        />
      </div>
    </li>
  );
}

/**
 * The Crowns page: the loaded hunter's Guild Card records for every monster
 * entry, with the gold and mini crowns they earn.
 */
export default function CrownsPage({ monsters }: { monsters: readonly CrownGroupMonster[] }) {
  const { t, formatNumber } = useLocale();
  const text = t.site.hunter;
  const c = text.crowns;
  const { save } = useSave();
  const progress = useMemo(
    () => (save?.monsters ? crownProgress(save.monsters, monsters) : null),
    [save, monsters],
  );
  if (!save) return <NoHunter />;
  return (
    <DetailCard>
      <DetailHeader>
        <DetailName>{text.pages.crowns}</DetailName>
        {progress && (
          <span className="ml-auto flex flex-none items-center gap-[1.2rem] text-white tabular-nums">
            <span className="flex items-center gap-[0.4rem]">
              <span className="sr-only">
                {c.goldCount(formatNumber(progress.gold), formatNumber(progress.groups.length))}
              </span>
              <span aria-hidden="true" className="flex items-center gap-[0.4rem]">
                <CrownIcon crown="gold" />
                {formatNumber(progress.gold)}/{formatNumber(progress.groups.length)}
              </span>
            </span>
            <span className="flex items-center gap-[0.4rem]">
              <span className="sr-only">
                {c.miniCount(formatNumber(progress.mini), formatNumber(progress.groups.length))}
              </span>
              <span aria-hidden="true" className="flex items-center gap-[0.4rem]">
                <CrownIcon crown="mini" />
                {formatNumber(progress.mini)}/{formatNumber(progress.groups.length)}
              </span>
            </span>
          </span>
        )}
      </DetailHeader>
      <DetailBody>
        <div className="text-small text-white/70">{c.note}</div>
        {progress ? (
          <>
            <DetailRule />
            <ul className="m-0 flex list-none flex-col gap-[1.6rem] p-0">
              {progress.groups.map((group) => (
                <CrownGroupRow key={group.names[0]} group={group} />
              ))}
            </ul>
          </>
        ) : (
          <div className="text-small text-white/60">{c.noRecords}</div>
        )}
      </DetailBody>
    </DetailCard>
  );
}
