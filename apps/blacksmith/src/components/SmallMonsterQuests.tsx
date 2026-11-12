import Link from "next/link";
import {
  QUEST_HUBS,
  questHref,
  questStarLevel,
  type Quest,
  type SmallMonsterStage,
} from "@/lib/quests";

/** Quests shown per star level before "+N more". */
const SHOWN = 3;

function QuestLink({ quest }: { quest: Quest }) {
  return (
    <Link
      href={questHref(quest)}
      className="min-w-0 truncate text-white underline-offset-4 hover:underline mobile:whitespace-normal"
    >
      {quest.title}
    </Link>
  );
}

/**
 * Where a small monster is most plentiful: per quest board, the quest with
 * the biggest total at each star level. Quests where it keeps spawning follow.
 */
export default function SmallMonsterQuests({ stages }: { stages: SmallMonsterStage[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-[3.2rem] gap-y-[1.6rem] text-small mobile:grid-cols-1 compact:grid-cols-1">
      {QUEST_HUBS.map((hub) => {
        const onHub = stages.filter((s) => s.hub === hub.slug);
        if (onHub.length === 0) return null;
        return (
          <section key={hub.slug} className="flex min-w-0 flex-col gap-[0.6rem]">
            <h3 className="m-0 text-small leading-[1.25] font-normal text-gold">{hub.label}</h3>
            <ul className="m-0 flex list-none flex-col gap-[0.6rem] p-0">
              {onHub.map((stage) => {
                const level = questStarLevel(stage.hub, stage.stars);
                const total = stage.best[0]?.total;
                const shown = stage.best.slice(0, SHOWN);
                return (
                  <li key={stage.stars} className="flex min-w-0 items-baseline gap-[0.8rem]">
                    <span className="w-cells-3 flex-none text-stat">
                      {level.g ? "G" : ""}
                      {level.stars}★
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-[0.2rem] leading-[1.25]">
                      {shown.map(({ quest }) => (
                        <div key={quest.id} className="flex min-w-0 items-baseline gap-[0.8rem]">
                          <QuestLink quest={quest} />
                          <span className="ml-auto flex-none text-stat">×{total}</span>
                        </div>
                      ))}
                      {stage.best.length > shown.length && (
                        <span className="text-muted">
                          +{stage.best.length - shown.length} more with ×{total}
                        </span>
                      )}
                      {stage.endless.map((quest) => (
                        <div key={quest.id} className="flex min-w-0 items-baseline gap-[0.8rem]">
                          <QuestLink quest={quest} />
                          <span className="ml-auto flex-none text-muted">keeps spawning</span>
                        </div>
                      ))}
                    </div>
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
