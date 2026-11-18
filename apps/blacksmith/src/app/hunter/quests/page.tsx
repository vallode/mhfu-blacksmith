import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { QuestProgressPage } from "../HunterPages";

export const metadata: Metadata = pageMetadata({
  title: "Quest Progress",
  description:
    "The Monster Hunter Freedom Unite quests your hunter has cleared on each board, by star level.",
  path: "/hunter/quests/",
});

export default function HunterQuestsPage() {
  return <QuestProgressPage />;
}
