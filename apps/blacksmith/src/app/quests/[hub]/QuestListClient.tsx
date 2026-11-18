"use client";

import { DetailCard } from "@/components/DetailPanel";
import { useT } from "@/context/LanguageContext";

/**
 * The empty detail pane beside a list in the quest frame: on /quests/ (the
 * boards) and on /quests/<hub>/ (a board's quests).
 */
export default function QuestListClient({ boards = false }: { boards?: boolean }) {
  const t = useT().quests;
  return (
    <DetailCard>
      <p className="text-stat">{boards ? t.board.selectBoard : t.board.selectQuest}</p>
    </DetailCard>
  );
}
