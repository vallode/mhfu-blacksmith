import { notFound } from "next/navigation";
import { QUEST_HUB_SLUGS, type QuestHubSlug } from "@/lib/quests";
import QuestHubShell from "./QuestHubShell";

export default async function QuestHubLayout({
  params,
  children,
}: {
  params: Promise<{ hub: string }>;
  children: React.ReactNode;
}) {
  const { hub } = await params;
  if (!QUEST_HUB_SLUGS.includes(hub as QuestHubSlug)) notFound();
  return <QuestHubShell hub={hub as QuestHubSlug}>{children}</QuestHubShell>;
}
