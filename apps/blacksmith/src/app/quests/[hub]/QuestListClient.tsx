"use client";

import { DetailCard } from "@/components/DetailPanel";
import { useT } from "@/context/LanguageContext";
import type { QuestHubSlug } from "@/lib/quests";

/** /quests/<hub>/: the board's list is in the layout; this is the empty detail pane. */
export default function QuestListClient({ hub }: { hub: QuestHubSlug }) {
  const t = useT().quests;
  return (
    <DetailCard>
      <p className="text-gold">{t.hubs[hub]}</p>
      <p className="text-stat">{t.board.selectQuest}</p>
    </DetailCard>
  );
}
