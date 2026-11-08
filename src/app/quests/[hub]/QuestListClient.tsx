import { DetailCard } from "@/components/DetailPanel";
import { questHubLabel, type QuestHubSlug } from "@/lib/quests";

/** /quests/<hub>/: the board's list is in the layout; this is the empty detail pane. */
export default function QuestListClient({ hub }: { hub: QuestHubSlug }) {
  return (
    <DetailCard>
      <p className="text-gold">{questHubLabel(hub)}</p>
      <p className="text-stat">Select a quest.</p>
    </DetailCard>
  );
}
