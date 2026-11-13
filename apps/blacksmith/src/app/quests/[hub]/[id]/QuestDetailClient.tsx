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
  type QuestCrownChances,
  type QuestMonster,
  type QuestMonsterSize,
  type QuestMonsterStats,
} from "@/lib/quests";
import QuestAreaMap from "@/components/AreaMap";
import Loading from "@/components/Loading";
import MapIcon from "@/components/MapIcon";
import { cn } from "@/lib/cn";
import { formatChance, possibleCrowns } from "@/lib/crowns";
import CrownIcon from "@/components/CrownIcon";
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

/** A monster's crown chances, gold first, leaving out crowns it can't get. */
function CrownChances({ chances }: { chances: QuestCrownChances }) {
  const crowns = possibleCrowns([chances]);
  if (crowns.length === 0) return <span className="text-white">None</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-[1.2rem] gap-y-[0.4rem] text-white tabular-nums">
      {crowns.map((crown) => (
        <span key={crown} className="inline-flex items-center gap-[0.4rem] whitespace-nowrap">
          <CrownIcon crown={crown} />
          {formatChance(chances[crown])}
        </span>
      ))}
    </span>
  );
}

/** Each large monster's HP and multipliers in this quest, and its size and crown chances. */
function MonsterStats({
  stats,
  size,
}: {
  stats: QuestMonsterStats[];
  size: QuestMonsterSize | null;
}) {
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
            {size && <MonsterSizeStats size={size} monster={s.monster.name} />}
          </StatList>
        </section>
      ))}
      <p className="text-fine leading-[1.4] whitespace-normal text-white/60">
        Attack and defense multiply the damage the monster deals and takes, so a lower defense means
        it takes less. Stagger multiplies how much damage a part takes before it flinches.
        {stats.some((s) => s.monster.name === "Furious Rajang") &&
          " Furious Rajang's attack and defense change again during the hunt."}
        {size && size.crowns.length > 0 && (
          <>
            {" "}
            Size is a percent of the monster&apos;s normal size, rolled for each monster; crown
            chances are per monster.
            {size.fixedFirst &&
              " Until a story flag is set (likely the quest's first clear), every monster here is its normal size."}
          </>
        )}
      </p>
    </div>
  );
}

/** A crowned monster's size range and crown chances; nothing for a monster without crowns. */
function MonsterSizeStats({ size, monster }: { size: QuestMonsterSize; monster: string }) {
  const chances = size.crowns.find((c) => c.monster.name === monster);
  if (!chances) return null;
  return (
    <>
      <Stat label="Size:">
        <span className="text-white tabular-nums">
          {size.min === size.max ? `${size.min}%` : `${size.min}–${size.max}%`}
        </span>
      </Stat>
      <Stat label="Crowns:">
        <CrownChances chances={chances} />
      </Stat>
    </>
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

  // The crowns any of the quest's monsters can roll here.
  const crowns = possibleCrowns(quest.monsterSize?.crowns ?? []);

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
          {crowns.length > 0 && (
            <Stat label="Crowns:">
              <span className="inline-flex flex-wrap items-center gap-[0.6rem] whitespace-normal text-white">
                {crowns.map((c) => (
                  <CrownIcon key={c} crown={c} />
                ))}
                {quest.monsterSize?.fixedFirst && <span>(likely after the first clear)</span>}
              </span>
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
      content: <MonsterStats stats={quest.monsterStats} size={quest.monsterSize} />,
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
          sits in the top corner, level with the type, which keeps clear of
          it; on a phone it takes its own line. */}
      <div className="relative flex flex-col gap-2 text-main text-white">
        {cleared && (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex text-small leading-[2.75rem] mobile:static mobile:leading-[1.25]">
            <p className="text-stat">CLEAR!!</p>
          </div>
        )}
        <p
          className={cn(
            "text-center leading-[1.25] whitespace-normal",
            cleared && "px-[9.6rem] mobile:px-0",
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
