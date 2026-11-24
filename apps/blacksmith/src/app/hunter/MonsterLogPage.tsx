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
import { cardSize, crownFor } from "@/lib/crowns";
import { monsterLog, type MonsterLogGroup, type MonsterLogMonster } from "@/lib/monster-log";
import { monsterLogTable } from "@/styles/tables";
import { NoHunter } from "./HunterPages";

// Some monsters have no art; keep the layout and hide the broken-image glyph.
const hideBroken: React.ReactEventHandler<HTMLImageElement> = (e) => {
  e.currentTarget.style.visibility = "hidden";
};

/**
 * A Guild Card size record (percent) as the card shows it, with the crown it
 * earns, or a dash without one. The label is for screen readers, since the
 * table's last column stacks the largest over the smallest.
 */
function SizeRecord({
  size,
  monster,
  kind,
}: {
  size: number;
  monster: MonsterLogMonster;
  kind: "largest" | "smallest";
}) {
  const { t, formatNumber } = useLocale();
  const label = t.site.hunter.monsterLog[kind];
  if (size <= 0 || monster.baseSize === undefined) {
    return (
      <span className="text-unavailable">
        <span className="sr-only">{label} </span>—
      </span>
    );
  }
  const crown = monster.crowns ? crownFor(size, monster.crowns) : null;
  return (
    <span className="flex items-center justify-end gap-[0.4rem]">
      <span className="sr-only">{label}</span>
      <span>{formatNumber(Math.round(cardSize(size, monster.baseSize)))}</span>
      {crown && <CrownIcon crown={crown} />}
    </span>
  );
}

/** A logged monster's name, linking to its page, with its portrait where there's room. */
function MonsterName({ monster }: { monster: MonsterLogMonster }) {
  const game = useGameText();
  return (
    <Link
      href={`/monsters/${monster.category}/${monster.slug}/`}
      className="flex items-center gap-[0.8rem] text-white hover:text-stat"
    >
      <img
        src={`/images/monsters/${monster.slug}.png`}
        alt=""
        decoding="sync"
        onError={hideBroken}
        className="h-[32px] w-[32px] flex-none p-[2px] pixelated mobile:hidden compact:hidden"
      />
      <span>{game.name("monster", monster.name)}</span>
    </Link>
  );
}

/**
 * One group of the log as a table: the monster left, then its slain and
 * captured counts, and (large monsters) its largest and smallest above each
 * other. The small monsters' log has no captures or sizes to show.
 */
function LogTable({ group }: { group: MonsterLogGroup }) {
  const { t, formatNumber } = useLocale();
  const text = t.site.hunter.monsterLog;
  const large = !group.small;
  return (
    <table className={monsterLogTable}>
      <thead>
        <tr>
          <th scope="col">{text.monster}</th>
          <th scope="col">{text.slain}</th>
          {large && <th scope="col">{text.captured}</th>}
          {large && (
            <th scope="col">
              <span className="sr-only">{text.sizes}</span>
              <span aria-hidden="true" className="block leading-[1.2]">
                {text.largest}
              </span>
              <span aria-hidden="true" className="block leading-[1.2]">
                {text.smallest}
              </span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {group.rows.map((row) => (
          <tr key={row.monster.slug}>
            <th scope="row">
              <MonsterName monster={row.monster} />
            </th>
            <td>{formatNumber(row.kills)}</td>
            {large && <td>{formatNumber(row.captures)}</td>}
            {large && (
              <td>
                <span className="flex flex-col items-end gap-[0.2rem]">
                  <SizeRecord size={row.largest} monster={row.monster} kind="largest" />
                  <SizeRecord size={row.smallest} monster={row.monster} kind="smallest" />
                </span>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The Monster log: every monster the loaded hunter's save keeps a record for,
 * large monsters first, with their hunts, captures and size records.
 */
export default function MonsterLogPage({
  monsters,
}: {
  /** Every monster, from the server page's getMonsterLogMonsters. */
  monsters: readonly MonsterLogMonster[];
}) {
  const { t, formatNumber } = useLocale();
  const text = t.site.hunter;
  const log = text.monsterLog;
  const { save } = useSave();
  const groups = useMemo(() => monsterLog(monsters, save?.monsters), [monsters, save]);
  if (!save) return <NoHunter />;
  const shown = groups.filter((group) => group.rows.length > 0);
  const logged = shown.reduce((n, group) => n + group.rows.length, 0);
  return (
    <DetailCard>
      <DetailHeader>
        <DetailName>{text.pages.monsters}</DetailName>
        {logged ? (
          <span className="ml-auto text-white tabular-nums">
            {log.logged(logged, formatNumber(logged))}
          </span>
        ) : null}
      </DetailHeader>
      <DetailBody>
        <div className="text-small text-white/70">{log.note}</div>
        {save.monsters === undefined ? (
          <div className="text-small text-white/60">{log.untracked}</div>
        ) : shown.length === 0 ? (
          <div className="text-small text-white/60">
            {save.monsters.length === 0 ? log.empty : log.noListed}
          </div>
        ) : (
          shown.map((group) => (
            <section key={String(group.small)} className="flex flex-col gap-[0.8rem]">
              <DetailRule />
              <div className="flex flex-wrap items-baseline gap-x-[1.6rem] gap-y-[0.2rem]">
                <h3 className="m-0 flex-none font-normal whitespace-nowrap text-stat">
                  {group.small ? log.small : log.large}
                </h3>
                <span className="ml-auto text-small whitespace-nowrap text-white/70 tabular-nums">
                  {group.small
                    ? log.slainTotal(formatNumber(group.kills))
                    : log.totals(formatNumber(group.kills), formatNumber(group.captures))}
                </span>
              </div>
              <LogTable group={group} />
            </section>
          ))
        )}
      </DetailBody>
    </DetailCard>
  );
}
