"use client";

import Link from "next/link";
import { DetailBody, DetailCard, DetailRule, Stat, StatList } from "@/components/DetailPanel";
import { QuestRewards, QuestSupplies } from "@/components/QuestRewards";
import Tabs, { type Tab } from "@/components/Tabs";
import { useLocale } from "@/context/LanguageContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { useQuests } from "@/lib/client-data";
import {
  clearedQuestIds,
  questHref,
  questsOnHub,
  questStarLevel,
  type QuestHubSlug,
  type QuestMonster,
} from "@/lib/quests";
import Loading from "@/components/Loading";
import { cn } from "@/lib/cn";
import StarMarks from "@/components/StarMarks";

interface Props {
  hub: QuestHubSlug;
  id: number;
}

function MonsterLinks({ monsters }: { monsters: QuestMonster[] }) {
  const { game } = useLocale();
  return (
    <span className="whitespace-normal text-white">
      {monsters.map((m, i) => (
        <span key={m.name}>
          {i > 0 && ", "}
          {m.href ? (
            <Link href={m.href} className="text-white underline-offset-4 hover:underline">
              {game.name("monster", m.name)}
            </Link>
          ) : (
            game.name("monster", m.name)
          )}
        </span>
      ))}
    </span>
  );
}

export default function QuestDetailClient({ hub, id }: Props) {
  const { t, game, formatNumber } = useLocale();
  const { quests, error } = useQuests();
  const { save } = useSave();
  const { markCleared } = usePreferences().prefs;
  const onHub = quests ? questsOnHub(quests, hub) : [];
  const quest = onHub.find((q) => q.id === id);
  const cleared = markCleared && (clearedQuestIds(save)?.has(id) ?? false);
  const requires =
    quest?.requires == null ? undefined : quests?.find((q) => q.id === quest.requires);

  if (!quest) {
    return (
      <DetailCard>
        {error ? (
          <p>{t.quests.loadError}</p>
        ) : quests ? (
          <p>{t.quests.notFound}</p>
        ) : (
          <Loading>{t.common.loading}</Loading>
        )}
      </DetailCard>
    );
  }

  const d = t.quests.detail;
  const zenny = (n: number) => t.common.zenny(formatNumber(n));
  /** Board text in the site's language, falling back to the English. */
  const text = (field: "title" | "goal" | "fail" | "details" | "client", english: string) =>
    game.quest(quest.id, field, english);
  const title = text("title", quest.title);

  const tabs: Tab[] = [
    {
      id: "details",
      label: d.tabs.details,
      content: (
        <StatList>
          {quest.goal && (
            <Stat label={d.goal}>
              <span className="whitespace-pre-line text-white">{text("goal", quest.goal)}</span>
            </Stat>
          )}
          {quest.fail && (
            <Stat label={d.failure}>
              <span className="whitespace-pre-line text-white">{text("fail", quest.fail)}</span>
            </Stat>
          )}
          {quest.map && (
            <Stat label={d.location}>
              <span className="whitespace-normal text-white">{game.name("map", quest.map)}</span>
            </Stat>
          )}
          <Stat label={d.timeLimit}>
            <span className="text-white tabular-nums">
              {d.minutes(formatNumber(quest.timeLimit))}
            </span>
          </Stat>
          <Stat label={d.reward}>
            <span className="text-white tabular-nums">{zenny(quest.reward)}</span>
          </Stat>
          <Stat label={d.fee}>
            <span className="text-white tabular-nums">{zenny(quest.fee)}</span>
          </Stat>
          {requires && (
            <Stat label={d.requires}>
              <Link
                href={questHref(requires)}
                className="whitespace-normal text-white underline-offset-4 hover:underline"
              >
                {game.quest(requires.id, "title", requires.title)} ({t.quests.hubs[requires.hub]}{" "}
                <StarMarks {...questStarLevel(requires.hub, requires.stars)} />)
              </Link>
            </Stat>
          )}
          {quest.largeMonsters.length > 0 && (
            <Stat label={d.monsters}>
              <MonsterLinks monsters={quest.largeMonsters} />
            </Stat>
          )}
          {quest.smallMonsters.length > 0 && (
            <Stat label={d.smallMonsters}>
              <MonsterLinks monsters={quest.smallMonsters} />
            </Stat>
          )}
          {quest.client && (
            <Stat label={d.client}>
              <span className="whitespace-normal text-white">{text("client", quest.client)}</span>
            </Stat>
          )}
        </StatList>
      ),
    },
  ];
  if (quest.rewardTables.length > 0) {
    tabs.push({
      id: "rewards",
      label: d.tabs.rewards,
      content: <QuestRewards tables={quest.rewardTables} />,
    });
  }
  if (quest.supplies.length > 0) {
    tabs.push({
      id: "supplies",
      label: d.tabs.supplies,
      content: <QuestSupplies supplies={quest.supplies} />,
    });
  }

  return (
    <DetailCard>
      {/* Title, board and description, like the quest scroll: the title
          centred in white, the details in white with the game's roomy lines.
          CLEAR!! (a quest the loaded hunter has cleared) and URGENT!!! sit in
          the top corners, level with the title's first line, which keeps
          clear of them; on a phone they take their own line. */}
      <div className="relative flex flex-col gap-2 text-main text-white">
        {(cleared || quest.urgent) && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex text-small leading-[2.75rem] mobile:static mobile:leading-[1.25]">
            {cleared && <p className="text-stat">{t.quests.cleared}</p>}
            {quest.urgent && <p className="ml-auto text-negative">{d.urgent}</p>}
          </div>
        )}
        <p
          className={cn(
            "text-center leading-[1.25] whitespace-normal",
            (cleared || quest.urgent) && "px-[9.6rem] mobile:px-0",
          )}
        >
          {title}
        </p>
        <p className="text-center text-small leading-[1.25] whitespace-normal text-stat">
          {t.quests.hubs[hub]} · <StarMarks {...questStarLevel(hub, quest.stars)} />
        </p>
        {quest.details && (
          <p className="mt-2 text-small leading-[1.4] whitespace-normal">
            {text("details", quest.details)}
          </p>
        )}
      </div>

      <DetailBody>
        <DetailRule />
        {/* Keyed on the quest so the selected tab resets when navigating */}
        <Tabs key={id} label={d.tabsLabel(title)} tabs={tabs} />
      </DetailBody>
    </DetailCard>
  );
}
