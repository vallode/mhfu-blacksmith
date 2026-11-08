import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { QUEST_HUB_SLUGS, questHubLabel, type QuestHubSlug } from "@/lib/quests";
import QuestListClient from "./QuestListClient";

interface Props {
  params: Promise<{ hub: string }>;
}

export function generateStaticParams() {
  return QUEST_HUB_SLUGS.map((hub) => ({ hub }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hub } = await params;
  return { title: `${questHubLabel(hub)} quests — MHFU Blacksmith` };
}

export default async function QuestHubPage({ params }: Props) {
  const { hub } = await params;
  if (!QUEST_HUB_SLUGS.includes(hub as QuestHubSlug)) notFound();
  return <QuestListClient hub={hub as QuestHubSlug} />;
}
