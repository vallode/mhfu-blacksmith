import type { Metadata } from "next";
import QuestBoardsContent from "./QuestBoardsContent";

export const metadata: Metadata = {
  title: "Quests — MHFU Blacksmith",
};

export default function QuestsPage() {
  return <QuestBoardsContent />;
}
