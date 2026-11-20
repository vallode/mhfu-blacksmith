import { cn } from "@/lib/cn";
import { attackTable } from "@/styles/tables";
import { useLocale } from "@/context/LanguageContext";
import type { MonsterAttack } from "@/lib/models";
import { attackRows } from "@/lib/monster-attacks";

/** Elements and statuses with an icon in /images. */
const ICONS = new Set([
  "fire",
  "water",
  "thunder",
  "ice",
  "dragon",
  "poison",
  "paralysis",
  "sleep",
]);

function Effect({ name, label, className }: { name: string; label: string; className: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[0.4rem] whitespace-nowrap", className)}>
      {ICONS.has(name) && (
        <img className="h-[1.6rem] w-[1.6rem] pixelated" src={`/images/${name}.png`} alt="" />
      )}
      {label}
    </span>
  );
}

/**
 * A monster's attacks, one row per motion and set of numbers (lib/monster-attacks).
 * Guard and effects columns show only when the attack file has them.
 */
export default function MonsterAttacks({ attacks }: { attacks: readonly MonsterAttack[] }) {
  const { t, formatNumber } = useLocale();
  const a = t.monsters.attacks;
  const rows = attackRows(attacks);
  const hasGuard = rows.some((r) => r.guard !== undefined);
  const hasEffects = rows.some((r) => r.elements || r.statuses);
  const effectLabel = (name: string) =>
    t.common.elements[name.charAt(0).toUpperCase() + name.slice(1)] ?? a.statuses[name] ?? name;

  return (
    <div className="flex flex-col gap-[1.2rem]">
      <p className="m-0 text-small leading-[1.25] whitespace-normal text-white/60">{a.note}</p>
      <div className="overflow-x-auto">
        <table className={attackTable}>
          <thead>
            <tr>
              <th>{a.columns.motion}</th>
              <th title={a.titles.hits}>{a.columns.hits}</th>
              <th>{a.columns.damage}</th>
              <th title={a.titles.stun}>{a.columns.stun}</th>
              {hasGuard && <th title={a.titles.guard}>{a.columns.guard}</th>}
              {hasEffects && <th>{a.columns.effects}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{rows[i - 1]?.slot === r.slot ? "" : r.slot}</td>
                <td className={cn(r.hits === 1 && "text-unavailable")}>
                  {a.hits(formatNumber(r.hits))}
                </td>
                <td className={cn(r.damage === 0 && "text-unavailable")}>
                  {formatNumber(r.damage)}
                </td>
                <td className={cn(r.stun === 0 && "text-unavailable")}>{formatNumber(r.stun)}</td>
                {hasGuard && <td>{r.guard === undefined ? "—" : formatNumber(r.guard)}</td>}
                {hasEffects && (
                  <td>
                    <div className="flex flex-wrap gap-x-[1.2rem]">
                      {r.elements?.map((el) => (
                        <Effect
                          key={el}
                          name={el}
                          label={effectLabel(el)}
                          className="text-element"
                        />
                      ))}
                      {r.statuses?.map((s) => (
                        <Effect
                          key={s}
                          name={s}
                          label={a.status(effectLabel(s), formatNumber(r.statusValue ?? 0))}
                          className="text-warm"
                        />
                      ))}
                      {!r.elements && !r.statuses && <span className="text-unavailable">—</span>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
