import CrownIcon from "@/components/CrownIcon";
import { CROWN_LABELS, CROWN_ORDER, formatChance, type Crown } from "@/lib/crowns";

/** How the Guild Card compares a record with each cutoff. */
const SIGNS: Record<Crown, string> = { gold: "≥", silver: "≥", mini: "≤" };

/** Sizes are stored to two decimals; whole centimetres are enough here. */
const formatCm = (cm: number) => `${Math.round(cm).toLocaleString("en-US")} cm`;

/**
 * A monster's crown cutoffs in centimetres, one row per crown, gold first,
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
  return (
    <table className="border-collapse text-small leading-[1.25] tabular-nums">
      <tbody>
        {CROWN_ORDER.map((crown) => (
          <tr key={crown}>
            <td className="w-[21px] p-0 pr-[0.8rem] align-middle">
              <CrownIcon crown={crown} className="mx-auto block" />
            </td>
            <td className="p-0 pr-[1.6rem] text-stat">{CROWN_LABELS[crown]}</td>
            <td className="p-0 pr-[1.6rem] text-right whitespace-nowrap text-white">
              {SIGNS[crown]}
              {formatCm(cutoffs[crown])}
            </td>
            {best && (
              <td className="p-0 whitespace-nowrap text-white/60">
                {best[crown] === undefined ? "No quest" : `Best ${formatChance(best[crown])}`}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
