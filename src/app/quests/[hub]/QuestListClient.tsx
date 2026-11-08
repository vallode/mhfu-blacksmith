"use client";

import Link from "next/link";
import Card from "@/components/Card";
import BorderRule from "@/components/BorderRule";
import QuestNav from "@/components/QuestNav";
import { useQuests } from "@/lib/client-data";
import { questHref, questHubLabel, questsOnHub, type QuestHubSlug } from "@/lib/quests";

/** One quest board: its quests, grouped by stars. */
export default function QuestListClient({ hub }: { hub: QuestHubSlug }) {
  const { quests, error } = useQuests();
  const onHub = quests ? questsOnHub(quests, hub) : [];
  const stars = [...new Set(onHub.map((q) => q.stars))];

  return (
    <>
      <QuestNav back="/quests/" />
      <BorderRule />

      <div className="flex h-full w-full flex-wrap justify-center gap-[1.3rem] overflow-auto">
        <Card className="overflow-auto py-7">
          <p>{questHubLabel(hub)}</p>
          {error && <p className="text-negative">Couldn&apos;t load quests.</p>}
          {stars.map((n) => (
            <section key={n} aria-label={`${n} star quests`} className="flex flex-col">
              <h2 className="m-0 px-[16px] pt-[1.2rem] font-normal text-stat">{n}★</h2>
              {onHub
                .filter((q) => q.stars === n)
                .map((q) => (
                  <Link key={q.id} href={questHref(q)} className="list-row">
                    <p className="truncate">{q.title}</p>
                  </Link>
                ))}
            </section>
          ))}
        </Card>
      </div>
    </>
  );
}
