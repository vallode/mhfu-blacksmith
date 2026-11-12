import Link from "next/link";
import CrownIcon from "@/components/CrownIcon";
import { CROWN_LABELS, formatChance } from "@/lib/crowns";
import { QUEST_HUBS, questHref, type BestCrown, type Quest } from "@/lib/quests";

/**
 * A monster's quests, one titled list per quest board, linking to each quest.
 * Quests in `cleared` (the loaded hunter's) are marked CLEAR!!, and the
 * quests in `bestCrowns` (`bestCrownQuests`) with the crowns they give the
 * monster the best chance of.
 */
export default function MonsterQuests({
  quests,
  cleared,
  bestCrowns,
  legend,
}: {
  quests: Quest[];
  cleared?: ReadonlySet<number> | null;
  bestCrowns?: ReadonlyMap<number, BestCrown[]>;
  /** Shown above the lists, across both columns (the crown cutoffs). */
  legend?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-[3.2rem] gap-y-[1.6rem] text-small mobile:grid-cols-1 compact:grid-cols-1">
      {legend && <div className="col-span-full">{legend}</div>}
      {QUEST_HUBS.map((hub) => {
        const onHub = quests.filter((q) => q.hub === hub.slug);
        if (onHub.length === 0) return null;
        return (
          <section key={hub.slug} className="flex min-w-0 flex-col gap-[0.6rem]">
            <h3 className="m-0 text-small leading-[1.25] font-normal text-gold">{hub.label}</h3>
            <ul className="m-0 flex list-none flex-col gap-[0.4rem] p-0">
              {onHub.map((q) => (
                <li key={q.id} className="flex min-w-0 items-baseline gap-[0.8rem] leading-[1.25]">
                  <span className="w-cells-3 flex-none text-stat">{q.stars}★</span>
                  <Link
                    href={questHref(q)}
                    className="min-w-0 truncate text-white underline-offset-4 hover:underline mobile:whitespace-normal"
                  >
                    {q.title}
                  </Link>
                  {bestCrowns?.has(q.id) && (
                    // The 22px crowns overhang the 20px row by a pixel each
                    // way instead of growing it.
                    <span className="-my-px flex flex-none items-center gap-[0.2rem] self-center">
                      {bestCrowns.get(q.id)!.map(({ crown, chance }) => (
                        <CrownIcon
                          key={crown}
                          crown={crown}
                          title={`Best chance of a ${CROWN_LABELS[crown].toLowerCase()} crown: ${formatChance(chance)}`}
                        />
                      ))}
                    </span>
                  )}
                  {cleared?.has(q.id) && (
                    <span className="ml-auto flex-none text-stat">CLEAR!!</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
