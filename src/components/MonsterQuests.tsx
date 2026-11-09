import Link from "next/link";
import { cn } from "@/lib/cn";
import { QUEST_HUBS, questHref, type Quest } from "@/lib/quests";

/**
 * A monster's quests, one titled list per quest board, linking to each quest.
 * Quests in `cleared` (the loaded hunter's) get gold titles.
 */
export default function MonsterQuests({
  quests,
  cleared,
}: {
  quests: Quest[];
  cleared?: ReadonlySet<number> | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-[3.2rem] gap-y-[1.6rem] text-[1.6rem] mobile:grid-cols-1">
      {QUEST_HUBS.map((hub) => {
        const onHub = quests.filter((q) => q.hub === hub.slug);
        if (onHub.length === 0) return null;
        return (
          <section key={hub.slug} className="flex min-w-0 flex-col gap-[0.6rem]">
            <h3 className="m-0 text-[1.6rem] leading-[1.25] font-normal text-gold">{hub.label}</h3>
            <ul className="m-0 flex list-none flex-col gap-[0.4rem] p-0">
              {onHub.map((q) => (
                <li key={q.id} className="flex min-w-0 items-baseline gap-[0.8rem] leading-[1.25]">
                  <span className="w-cells-3 flex-none text-stat">{q.stars}★</span>
                  <Link
                    href={questHref(q)}
                    className={cn(
                      "min-w-0 truncate underline-offset-4 hover:underline mobile:whitespace-normal",
                      cleared?.has(q.id) ? "text-gold" : "text-white",
                    )}
                  >
                    {q.title}
                    {cleared?.has(q.id) && <span className="sr-only"> (cleared)</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
