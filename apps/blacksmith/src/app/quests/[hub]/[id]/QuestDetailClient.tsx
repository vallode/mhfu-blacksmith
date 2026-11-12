"use client";

import Link from "next/link";
import { DetailBody, DetailCard, DetailRule, Stat, StatList } from "@/components/DetailPanel";
import { QuestRewards, QuestSupplies } from "@/components/QuestRewards";
import Tabs, { type Tab } from "@/components/Tabs";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { useQuests } from "@/lib/client-data";
import {
  clearedQuestIds,
  questHref,
  questHubLabel,
  questsOnHub,
  questStarLevel,
  questTypeLabel,
  type QuestHubSlug,
  type QuestMonster,
  type QuestMonsterStats,
} from "@/lib/quests";
import QuestAreaMap from "@/components/AreaMap";
import Loading from "@/components/Loading";
import MapIcon from "@/components/MapIcon";
import { cn } from "@/lib/cn";
import StarMarks from "@/components/StarMarks";

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

const times = (n: number) => `×${n}`;

/** Each large monster's HP and multipliers in this quest. */
function MonsterStats({ stats }: { stats: QuestMonsterStats[] }) {
  return (
    <div className="flex flex-col gap-6">
      {stats.map((s, i) => (
        <section key={i} className="flex flex-col gap-3">
          <h3 className="m-0 leading-none font-normal text-warm">
            {s.monster.href ? (
              <Link href={s.monster.href} className="underline-offset-4 hover:underline">
                {s.monster.name}
              </Link>
            ) : (
              s.monster.name
            )}
          </h3>
          <StatList>
            {s.hp !== null && (
              <Stat label="HP:">
                <span className="text-white tabular-nums">{s.hp.toLocaleString("en-US")}</span>
              </Stat>
            )}
            <Stat label="Attack:">
              <span className="text-white tabular-nums">{times(s.attack)}</span>
            </Stat>
            <Stat label="Defense:">
              <span className="text-white tabular-nums">{times(s.defense)}</span>
            </Stat>
            <Stat label="Stagger:">
              <span className="text-white tabular-nums">{times(s.stagger)}</span>
            </Stat>
          </StatList>
        </section>
      ))}
      <p className="text-fine leading-[1.4] whitespace-normal text-white/60">
        Attack and defense multiply the damage the monster deals and takes, so a lower defense means
        it takes less. Stagger multiplies how much damage a part takes before it flinches.
        {stats.some((s) => s.monster.name === "Furious Rajang") &&
          " Furious Rajang's attack and defense change again during the hunt."}
      </p>
    </div>
  );
}

export default function QuestDetailClient({ hub, id }: Props) {
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
          <p>Couldn&apos;t load quests.</p>
        ) : quests ? (
          <p>Not found.</p>
        ) : (
          <Loading>Loading…</Loading>
        )}
      </DetailCard>
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
          {requires && (
            <Stat label="Requires:">
              <Link
                href={questHref(requires)}
                className="whitespace-normal text-white underline-offset-4 hover:underline"
              >
                {requires.title} ({questHubLabel(requires.hub)}{" "}
                <StarMarks {...questStarLevel(requires.hub, requires.stars)} />)
              </Link>
            </Stat>
          )}
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
  if (quest.monsterStats.length > 0) {
    tabs.push({
      id: "monsters",
      label: "Monsters",
      content: <MonsterStats stats={quest.monsterStats} />,
    });
  }
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

  if (quest.hasAreaMap) {
    tabs.push({ id: "map", label: "Map", content: <QuestAreaMap questId={id} /> });
  }

  return (
    <DetailCard>
      {/* The map's icon, faded behind the card's bottom-right corner, as on
          the game's quest card; brightened, as the art is dark on this card.
          Behind the text (-z-1 inside the card's own stacking context) and
          out of the way of clicks. */}
      {quest.map && (
        <MapIcon
          map={quest.map}
          className="pointer-events-none absolute right-[3.2rem] bottom-[3.2rem] -z-1 size-[22rem] opacity-30 brightness-200 mobile:size-[14rem]"
        />
      )}

      {/* Type, title, board and description, like the quest scroll: the
          type and title centred in white, the details in white with the
          game's roomy lines. CLEAR!! (a quest the loaded hunter has cleared)
          and URGENT!!! sit in the top corners, level with the type, which
          keeps clear of them; on a phone they take their own line. */}
      <div className="relative flex flex-col gap-2 text-main text-white">
        {(cleared || quest.urgent) && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex text-small leading-[2.75rem] mobile:static mobile:leading-[1.25]">
            {cleared && <p className="text-stat">CLEAR!!</p>}
            {quest.urgent && <p className="ml-auto text-negative">URGENT!!!</p>}
          </div>
        )}
        <p
          className={cn(
            "text-center leading-[1.25] whitespace-normal",
            (cleared || quest.urgent) && "px-[9.6rem] mobile:px-0",
          )}
        >
          {questTypeLabel(quest.type)}
        </p>
        <p className="text-center leading-[1.25] whitespace-normal">{quest.title}</p>
        <p className="text-center text-small leading-[1.25] whitespace-normal text-stat">
          <StarMarks {...questStarLevel(hub, quest.stars)} />
        </p>
        {quest.details && (
          <p className="mt-2 text-small leading-[1.4] whitespace-normal">{quest.details}</p>
        )}
      </div>

      <DetailBody>
        <DetailRule />
        {/* Keyed on the quest so the selected tab resets when navigating */}
        <Tabs key={id} label={`${quest.title} data`} tabs={tabs} />
      </DetailBody>
    </DetailCard>
  );
}
