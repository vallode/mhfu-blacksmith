import type { Metadata } from "next";
import { QuestBoardsShell } from "./[hub]/QuestHubShell";
import QuestListClient from "./[hub]/QuestListClient";

export const metadata: Metadata = {
  title: "Quests — MHFU Blacksmith",
};

export default function QuestsPage() {
  return (
    <QuestBoardsShell>
      <QuestListClient boards />
    </QuestBoardsShell>
  );
}
