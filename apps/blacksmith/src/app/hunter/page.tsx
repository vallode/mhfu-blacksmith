import type { Metadata } from "next";
import { getSmallMonsterIds } from "@/lib/monsters";
import { pageMetadata } from "@/lib/seo";
import { HunterHome } from "./HunterPages";

export const metadata: Metadata = pageMetadata({
  title: "Hunter Profile",
  description:
    "Load a Monster Hunter Freedom Unite save file and pick a hunter to see their Guild Card and quest progress, and their items and equipment next to the recipes.",
  path: "/hunter/",
});

export default function HunterPage() {
  return <HunterHome smallMonsterIds={getSmallMonsterIds()} />;
}
