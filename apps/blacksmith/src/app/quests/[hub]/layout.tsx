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
  // Keyed by board, so switching boards starts the new one on its first star
  // level instead of carrying over the last board's level and filter.
  return (
    <QuestHubShell key={hub} hub={hub as QuestHubSlug}>
      {children}
    </QuestHubShell>
  );
}
