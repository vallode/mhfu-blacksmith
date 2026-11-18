"use client";

import Link from "next/link";
import CrownIcon, { useFormatChance } from "@/components/CrownIcon";
import { useGameText, useT } from "@/context/LanguageContext";
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
  const { quests: t, monsters } = useT();
  const tc = monsters.crowns;
  const game = useGameText();
  const formatChance = useFormatChance();
  return (
    <div className="grid grid-cols-2 gap-x-[3.2rem] gap-y-[1.6rem] text-small mobile:grid-cols-1 compact:grid-cols-1">
      {legend && <div className="col-span-full">{legend}</div>}
      {QUEST_HUBS.map((hub) => {
        const onHub = quests.filter((q) => q.hub === hub.slug);
        if (onHub.length === 0) return null;
        return (
          <section key={hub.slug} className="flex min-w-0 flex-col gap-[0.6rem]">
            <h3 className="m-0 text-small leading-[1.25] font-normal text-gold">
              {t.hubs[hub.slug]}
            </h3>
            <ul className="m-0 flex list-none flex-col gap-[0.4rem] p-0">
              {onHub.map((q) => {
                const best = bestCrowns?.get(q.id);
                return (
                  <li
                    key={q.id}
                    className="flex min-w-0 items-baseline gap-[0.8rem] leading-[1.25]"
                  >
                    <span className="w-cells-3 flex-none text-stat">{q.stars}★</span>
                    <Link
                      href={questHref(q)}
                      className="min-w-0 truncate text-white underline-offset-4 hover:underline mobile:whitespace-normal"
                    >
                      {game.quest(q.id, "title", q.title)}
                    </Link>
                    {best && (
                      // The 22px crowns overhang the 20px row by a pixel each
                      // way instead of growing it, and sit a pixel high: their
                      // weight is low (a jewel on top, the band at the
                      // bottom), so centred on the text they look low.
                      <span className="-my-px flex flex-none -translate-y-px items-center gap-[0.2rem] self-center">
                        {best.map(({ crown, chance }) => (
                          <CrownIcon
                            key={crown}
                            crown={crown}
                            title={tc.bestChance(tc.crown[crown], formatChance(chance))}
                          />
                        ))}
                      </span>
                    )}
                    {cleared?.has(q.id) && (
                      <span className="ml-auto flex-none text-stat">{t.cleared}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
