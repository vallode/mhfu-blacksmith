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
import type { Crown } from "@/lib/crowns";
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
    <div className="min-w-0 flex-1">
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

/**
 * A crown sprite in a slot as wide as the big crown, so the columns after it
 * line up whichever crown (or none) a row shows.
 */
function CrownSlot({ crown, dim }: { crown: Crown | null; dim?: boolean }) {
  return (
    <span className={cn("flex w-[21px] flex-none justify-center", dim && "opacity-30")}>
      {crown && <CrownIcon crown={crown} />}
    </span>
  );
}

/**
 * Whether a group has both of its crowns, or which it is still missing: a
 * short label, then the missing crowns' sprites dimmed beside it, as the
 * Awards page shows what's left.
 */
function CrownStatus({ group }: { group: CrownGroupProgress }) {
  const { t } = useLocale();
  const c = t.site.hunter.crowns;
  const missingGold = group.largestCrown !== "gold";
  const missingMini = group.smallestCrown !== "mini";
  if (!missingGold && !missingMini) {
    return <span className="flex-none text-positive">{c.complete}</span>;
  }
  const label =
    missingGold && missingMini ? c.missingBoth : missingGold ? c.missingGold : c.missingMini;
  return (
    <span className="flex flex-none items-center gap-[0.4rem]">
      <span className="sr-only">{label}</span>
      <span className="text-stat" aria-hidden="true">
        {c.missing}
      </span>
      {missingGold && (
        <span aria-hidden="true" className="opacity-30">
          <CrownIcon crown="gold" />
        </span>
      )}
      {missingMini && (
        <span aria-hidden="true" className="opacity-30">
          <CrownIcon crown="mini" />
        </span>
      )}
    </span>
  );
}

/**
 * One line of a group's records, on the list's shared columns: the label, the
 * value right-aligned, the crown it earns, then the size that would earn the
 * gold or mini crown.
 */
function RecordLine({
  label,
  value,
  crown = null,
  cutoff,
}: {
  label: string;
  /** The value as shown, or null for none yet. */
  value: string | null;
  crown?: Crown | null;
  /** The cutoff as the card shows it, already labelled (gold or mini). */
  cutoff?: string | null;
}) {
  return (
    <div className="col-span-full grid grid-cols-subgrid items-center">
      <span className="text-white/60">{label}</span>
      <span
        className={cn(
          "text-right tabular-nums",
          value === null ? "text-unavailable" : "text-white",
        )}
      >
        {value ?? "—"}
      </span>
      <CrownSlot crown={crown} />
      <span className="text-white/50 tabular-nums">{cutoff}</span>
    </div>
  );
}

/** One crown group: its monsters and status, then its hunts and size records. */
function CrownGroupRow({ group }: { group: CrownGroupProgress }) {
  const { t, formatNumber, formatTenths } = useLocale();
  const c = t.site.hunter.crowns;
  const size = (value: number | null) => (value === null ? null : formatNumber(Math.round(value)));
  return (
    <li className="col-span-full grid grid-cols-subgrid gap-y-[0.2rem]">
      <div className="col-span-full mb-[0.2rem] flex items-baseline gap-x-[1.6rem] text-sub mobile:text-small compact:text-small">
        <GroupNames group={group} />
        <span className="text-small">
          <CrownStatus group={group} />
        </span>
      </div>
      <RecordLine label={c.hunted} value={group.hunts > 0 ? formatNumber(group.hunts) : null} />
      <RecordLine
        label={c.largest}
        value={size(group.largestSize)}
        crown={group.largestCrown}
        cutoff={group.cutoffs ? c.goldCutoff(formatTenths(group.cutoffs.gold)) : null}
      />
      <RecordLine
        label={c.smallest}
        value={size(group.smallestSize)}
        crown={group.smallestCrown}
        cutoff={group.cutoffs ? c.miniCutoff(formatTenths(group.cutoffs.mini)) : null}
      />
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
            <ul className="m-0 grid list-none grid-cols-[auto_auto_auto_1fr] gap-x-[1.2rem] gap-y-[2rem] p-0 text-small mobile:text-fine compact:text-fine">
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
