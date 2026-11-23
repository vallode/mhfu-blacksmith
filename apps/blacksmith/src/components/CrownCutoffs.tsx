"use client";

import CrownIcon, { useFormatChance } from "@/components/CrownIcon";
import { useLocale } from "@/context/LanguageContext";
import { CROWN_ORDER, type Crown } from "@/lib/crowns";

// Phones close the gaps between columns, and set the best chances
// smaller, so a row fits a phone's width.
const narrowGap = "p-0 pr-[1.6rem] mobile:pr-[0.8rem]";

/** How the Guild Card compares a record with each cutoff. */
const SIGNS: Record<Crown, string> = { gold: "≥", silver: "≥", mini: "≤" };

/**
 * A monster's crown cutoffs in centimetres (crownCutoffCm: to a tenth,
 * rounded so every size past one earns its crown), one row per crown, gold first,
 * with the best chance any of its quests gives of each (absent: no quest
 * can).
 */
export default function CrownCutoffs({
  cutoffs,
  best,
}: {
  cutoffs: Record<Crown, number>;
  best?: Partial<Record<Crown, number>>;
}) {
  const { t, formatTenths } = useLocale();
  const formatChance = useFormatChance();
  const c = t.monsters.crowns;
  return (
    <table className="border-collapse text-small leading-[1.25] tabular-nums">
      <tbody>
        {CROWN_ORDER.map((crown) => (
          <tr key={crown}>
            <td className="w-[21px] p-0 pr-[0.8rem] align-middle mobile:pr-[0.6rem]">
              {/* max-w-none: the img's max-width: 100% would let a full row
                  squeeze it to nothing. */}
              <CrownIcon crown={crown} className="mx-auto block max-w-none" />
            </td>
            <td className={`${narrowGap} text-stat`}>{c.names[crown]}</td>
            <td className={`${narrowGap} text-right whitespace-nowrap text-white`}>
              {SIGNS[crown]}
              {t.monsters.detail.cm(formatTenths(cutoffs[crown]))}
            </td>
            {best && (
              <td className="p-0 whitespace-nowrap text-white/60 mobile:text-fine">
                {best[crown] === undefined ? c.noQuest : c.best(formatChance(best[crown]))}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
