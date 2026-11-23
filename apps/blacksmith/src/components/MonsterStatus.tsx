"use client";

import { useLocale } from "@/context/LanguageContext";
import { statusDuration, STATUS_ORDER, ticksToSeconds } from "@/lib/monster-status";
import type { MonsterTolerances } from "@/lib/types";
import { statusTable } from "@/styles/tables";

/**
 * A monster's status tolerances, one row per status: the buildup that first
 * triggers it, how much more each time after, how long it lasts, and how
 * fast the buildup wears off; then a key to the columns. "Immune" stands
 * in the first column of figures, right-aligned like them.
 */
export default function MonsterStatus({ tolerances }: { tolerances: MonsterTolerances }) {
  const { t, formatNumber } = useLocale();
  const s = t.monsters.status;
  const seconds = (ticks: number) => formatNumber(ticksToSeconds(ticks));
  return (
    <div className="flex flex-col gap-4">
      <table className={statusTable}>
        <thead>
          <tr>
            <th>{s.columns.status}</th>
            <th>{s.columns.initial}</th>
            <th>{s.columns.increase}</th>
            <th>{s.columns.duration}</th>
            <th>{s.columns.recovery}</th>
          </tr>
        </thead>
        <tbody className="text-white">
          {STATUS_ORDER.map((status) => {
            const tol = tolerances[status];
            return (
              <tr key={status}>
                <td>
                  <span className="flex items-center gap-[0.6rem]">
                    <img
                      src={`/images/${status}.png`}
                      alt=""
                      title={s.names[status]}
                      className="size-[1.6rem] flex-none pixelated"
                    />
                    {/* A phone has room for the icon only. */}
                    <span className="mobile:sr-only">{s.names[status]}</span>
                  </span>
                </td>
                {tol ? (
                  <>
                    <td>{formatNumber(tol.initial)}</td>
                    <td>{s.increase(formatNumber(tol.increase))}</td>
                    <td>{s.seconds(seconds(statusDuration(tol)))}</td>
                    <td>{s.recovery(formatNumber(tol.recovery), seconds(tol.recovery_time))}</td>
                  </>
                ) : (
                  <>
                    <td className="text-unavailable">{s.immune}</td>
                    <td />
                    <td />
                    <td />
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-fine leading-[1.4] whitespace-normal text-muted">{s.note}</p>
    </div>
  );
}
