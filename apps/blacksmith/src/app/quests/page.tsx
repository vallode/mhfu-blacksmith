import type { Metadata } from "next";
import QuestHubRedirect from "./QuestHubRedirect";

export const metadata: Metadata = {
  title: "Quests — MHFU Blacksmith",
};

export default function QuestsPage() {
  return <QuestHubRedirect />;
}
