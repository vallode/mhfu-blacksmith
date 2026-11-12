"use client";

import Link from "next/link";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import Icon from "@/components/Icon";
import BorderRule from "@/components/BorderRule";
import QuestNav from "@/components/QuestNav";
import { useT } from "@/context/LanguageContext";
import { QUEST_HUBS } from "@/lib/quests";

/** /quests/: one row per quest board. */
export default function QuestBoardsContent() {
  const t = useT().quests;
  return (
    <>
      <QuestNav back="/" />
      <BorderRule />

      <div className="flex h-full w-full flex-wrap justify-center gap-[1.3rem] overflow-auto">
        <CardBox>
          <Card scroll bodyClassName="card-py-7">
            {QUEST_HUBS.map((hub) => (
              <Link key={hub.slug} href={`/quests/${hub.slug}/`} className="list-row">
                <Icon type="ticket" alt="" />
                <p>{t.hubs[hub.slug]}</p>
              </Link>
            ))}
          </Card>
        </CardBox>
      </div>
    </>
  );
}
