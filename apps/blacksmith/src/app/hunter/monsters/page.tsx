import type { Metadata } from "next";
import { getMonsterLogMonsters } from "@/lib/monsters";
import { pageMetadata } from "@/lib/seo";
import MonsterLogPage from "../MonsterLogPage";

export const metadata: Metadata = pageMetadata({
  title: "Monster log",
  description:
    "Every monster your Monster Hunter Freedom Unite save has a record for, with your hunts, captures and largest and smallest, read from your save file.",
  path: "/hunter/monsters/",
});

export default function HunterMonstersPage() {
  return <MonsterLogPage monsters={getMonsterLogMonsters()} />;
}
