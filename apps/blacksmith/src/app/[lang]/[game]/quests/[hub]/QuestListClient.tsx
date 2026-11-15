import { DetailCard } from "@/components/DetailPanel";

/**
 * The empty detail pane beside a list in the quest frame: on /quests/ (the
 * boards) and on /quests/<hub>/ (a board's quests).
 */
export default function QuestListClient({ boards = false }: { boards?: boolean }) {
  return (
    <DetailCard>
      <p className="text-stat">{boards ? "Select a quest board." : "Select a quest."}</p>
    </DetailCard>
  );
}
