import type { Metadata } from "next";
import { getMonsterLogMonsters } from "@/lib/monsters";
import { pageMetadata } from "@/lib/seo";
import CrownsPage from "../CrownsPage";

export const metadata: Metadata = pageMetadata({
  title: "Crowns",
  description:
    "Track your Monster Hunter Freedom Unite Guild Card crown sizes from your save file: the largest and smallest of every monster, and its gold, silver and mini crowns.",
  path: "/hunter/crowns/",
});

export default function HunterCrownsPage() {
  return <CrownsPage monsters={getMonsterLogMonsters()} />;
}
