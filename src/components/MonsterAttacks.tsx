import Link from "next/link";
import { cn } from "@/lib/cn";
import { attackTable } from "@/styles/tables";
import type { MonsterAttacks as Attacks } from "@/lib/types";

// Status names with an icon in /images; the rest ("snowman", "soiled",
// "defense down") are shown as text only.
const STATUS_ICONS = new Set(["poison", "paralysis", "sleep"]);
const ELEMENT_ICONS = new Set(["fire", "water", "thunder", "ice", "dragon"]);

function Effect({
  name,
  icons,
  className,
}: {
  name: string;
  icons: Set<string>;
  className: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-[0.4rem] whitespace-nowrap", className)}>
      {icons.has(name) && (
        <img className="h-[1.6rem] w-[1.6rem] pixelated" src={`/images/${name}.png`} alt="" />
      )}
      <span className="capitalize">{name}</span>
    </span>
  );
}

/**
 * A monster's attack records. The disc has no attack names and doesn't say
 * which monster of a code family uses which record, so the numbers are shared
 * by the family and the page lists the others.
 */
export default function MonsterAttacks({ attacks }: { attacks: Attacks }) {
  const { rows, sharedWith } = attacks;
  return (
    <div className="flex flex-col gap-[1.2rem]">
      <p className="m-0 text-small leading-[1.25] whitespace-normal text-white/60">
        Attack data from the game files has no names. Damage is before the quest&apos;s attack
        multiplier; identical attacks are grouped (×N).
        {sharedWith.length > 0 && (
          <>
            {" "}
            These numbers are shared by the whole family and the game does not say which monster
            uses which attack. Shared with{" "}
            {sharedWith.map((m, i) => (
              <span key={m.name}>
                {i > 0 && ", "}
                <Link className="text-gold" href={`/monsters/${m.category}/${m.slug}/`}>
                  {m.name}
                </Link>
              </span>
            ))}
            .
          </>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className={attackTable}>
          <thead>
            <tr>
              <th>Count</th>
              <th>Damage</th>
              <th>Guard</th>
              <th>Stun</th>
              <th>Effects</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className={cn(r.count === 1 && "text-unavailable")}>×{r.count}</td>
                <td className={cn(r.damage === 0 && "text-unavailable")}>{r.damage}</td>
                <td>{r.guard}</td>
                <td>{r.stun ?? "—"}</td>
                <td>
                  <div className="flex flex-wrap gap-x-[1.2rem]">
                    {r.elements?.map((el) => (
                      <Effect key={el} name={el} icons={ELEMENT_ICONS} className="text-element" />
                    ))}
                    {r.statuses && (
                      <span className="whitespace-nowrap text-warm">
                        {r.statuses.map((s, j) => (
                          <span key={s}>
                            {j > 0 && " / "}
                            <Effect name={s} icons={STATUS_ICONS} className="" />
                          </span>
                        ))}{" "}
                        {r.statusValue}
                      </span>
                    )}
                    {!r.elements && !r.statuses && <span className="text-unavailable">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
