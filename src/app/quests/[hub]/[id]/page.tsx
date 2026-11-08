import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { QUEST_HUB_SLUGS, type QuestHubSlug } from "@/lib/quests";
import { getQuestSummaries, getQuestSummary } from "@/lib/quests-data";
import QuestDetailClient from "./QuestDetailClient";

interface Props {
  params: Promise<{ hub: string; id: string }>;
}

export function generateStaticParams() {
  return getQuestSummaries().map((q) => ({ hub: q.hub, id: String(q.id) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hub, id } = await params;
  const quest = getQuestSummary(hub, Number(id));
  return {
    title: quest ? `${quest.title} — MHFU Blacksmith` : "Quest",
    description: quest?.goal?.replace(/\s+/g, " ") ?? undefined,
  };
}

export default async function QuestDetailPage({ params }: Props) {
  const { hub, id } = await params;
  if (!QUEST_HUB_SLUGS.includes(hub as QuestHubSlug)) notFound();
  return <QuestDetailClient hub={hub as QuestHubSlug} id={Number(id)} />;
}
