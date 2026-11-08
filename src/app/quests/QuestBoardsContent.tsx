import Link from "next/link";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import BorderRule from "@/components/BorderRule";
import QuestNav from "@/components/QuestNav";
import { QUEST_HUBS } from "@/lib/quests";

/** /quests/: one row per quest board. */
export default function QuestBoardsContent() {
  return (
    <>
      <QuestNav back="/" />
      <BorderRule />

      <div className="flex h-full w-full flex-wrap justify-center gap-[1.3rem] overflow-auto">
        <Card className="overflow-auto py-7">
          {QUEST_HUBS.map((hub) => (
            <Link key={hub.slug} href={`/quests/${hub.slug}/`} className="list-row">
              <Icon type="ticket" alt="" />
              <p>{hub.label}</p>
            </Link>
          ))}
        </Card>
      </div>
    </>
  );
}
