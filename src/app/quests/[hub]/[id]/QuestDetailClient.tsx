"use client";

import Link from "next/link";
import Card from "@/components/Card";
import BorderRule from "@/components/BorderRule";
import { DetailBody, DetailCard, DetailRule, Stat, StatList } from "@/components/DetailPanel";
import QuestNav from "@/components/QuestNav";
import { QuestRewards, QuestSupplies } from "@/components/QuestRewards";
import Tabs, { type Tab } from "@/components/Tabs";
import TreeScroll from "@/components/TreeScroll";
import { cn } from "@/lib/cn";
import { useQuests } from "@/lib/client-data";
import {
  questHref,
  questHubLabel,
  questsOnHub,
  type QuestHubSlug,
  type QuestMonster,
} from "@/lib/quests";

interface Props {
  hub: QuestHubSlug;
  id: number;
}

const zenny = (n: number) => `${n.toLocaleString("en-US")}z`;

function MonsterLinks({ monsters }: { monsters: QuestMonster[] }) {
  return (
    <span className="whitespace-normal text-white">
      {monsters.map((m, i) => (
        <span key={m.name}>
          {i > 0 && ", "}
          {m.href ? (
            <Link href={m.href} className="text-white underline-offset-4 hover:underline">
              {m.name}
            </Link>
          ) : (
            m.name
          )}
        </span>
      ))}
    </span>
  );
}

export default function QuestDetailClient({ hub, id }: Props) {
  const { quests, error } = useQuests();
  const onHub = quests ? questsOnHub(quests, hub) : [];
  const quest = onHub.find((q) => q.id === id);

  if (!quest) {
    return (
      <>
        <QuestNav back={`/quests/${hub}/`} />
        <BorderRule />
        <p style={{ padding: "2rem" }}>
          {error ? "Couldn't load quests." : quests ? "Not found." : "Loading…"}
        </p>
      </>
    );
  }

  const tabs: Tab[] = [
    {
      id: "details",
      label: "Details",
      content: (
        <StatList>
          {quest.goal && (
            <Stat label="Goal:">
              <span className="whitespace-pre-line text-white">{quest.goal}</span>
            </Stat>
          )}
          {quest.fail && (
            <Stat label="Failure:">
              <span className="whitespace-pre-line text-white">{quest.fail}</span>
            </Stat>
          )}
          {quest.map && (
            <Stat label="Location:">
              <span className="whitespace-normal text-white">{quest.map}</span>
            </Stat>
          )}
          <Stat label="Time limit:">
            <span className="text-white tabular-nums">{quest.timeLimit} min</span>
          </Stat>
          <Stat label="Reward:">
            <span className="text-white tabular-nums">{zenny(quest.reward)}</span>
          </Stat>
          <Stat label="Contract fee:">
            <span className="text-white tabular-nums">{zenny(quest.fee)}</span>
          </Stat>
          {quest.largeMonsters.length > 0 && (
            <Stat label="Monsters:">
              <MonsterLinks monsters={quest.largeMonsters} />
            </Stat>
          )}
          {quest.smallMonsters.length > 0 && (
            <Stat label="Small monsters:">
              <MonsterLinks monsters={quest.smallMonsters} />
            </Stat>
          )}
          {quest.client && (
            <Stat label="Client:">
              <span className="whitespace-normal text-white">{quest.client}</span>
            </Stat>
          )}
        </StatList>
      ),
    },
  ];
  if (quest.rewardTables.length > 0) {
    tabs.push({
      id: "rewards",
      label: "Rewards",
      content: <QuestRewards tables={quest.rewardTables} />,
    });
  }
  if (quest.supplies.length > 0) {
    tabs.push({
      id: "supplies",
      label: "Supplies",
      content: <QuestSupplies supplies={quest.supplies} />,
    });
  }

  return (
    <>
      <QuestNav back={`/quests/${hub}/`} />
      <BorderRule />

      <div className="split-page">
        {/* The board's other quests, as navigation */}
        <Card variant="weapon-tree">
          <TreeScroll treeKey={`quests-${hub}`} activeSlug={String(id)}>
            {onHub.map((q) => (
              <Link
                key={q.id}
                id={String(q.id)}
                href={questHref(q)}
                aria-current={q.id === id ? "page" : undefined}
                className={cn("list-row", q.id === id && "bg-white/10")}
              >
                <span className="w-cells-3 flex-none text-stat">{q.stars}★</span>
                <p className="truncate">{q.title}</p>
              </Link>
            ))}
          </TreeScroll>
        </Card>

        <DetailCard>
          {/* Title, board and description, like the quest sheet */}
          <div className="flex flex-col gap-2 text-[2.2rem] text-gold">
            <p className="leading-[1.25] whitespace-normal">{quest.title}</p>
            <p className="text-[1.6rem] leading-[1.25] text-stat">
              {questHubLabel(hub)} · {quest.stars}★
            </p>
            {quest.details && (
              <p className="text-[1.6rem] whitespace-normal text-white">{quest.details}</p>
            )}
          </div>

          <DetailBody>
            <DetailRule />
            {/* Keyed on the quest so the selected tab resets when navigating */}
            <Tabs key={id} label={`${quest.title} data`} tabs={tabs} />
          </DetailBody>
        </DetailCard>
      </div>
    </>
  );
}
