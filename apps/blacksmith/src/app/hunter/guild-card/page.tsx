import type { Metadata } from "next";
import { getSmallMonsterIds } from "@/lib/monsters";
import { pageMetadata } from "@/lib/seo";
import { GuildCardPage } from "../HunterPages";

export const metadata: Metadata = pageMetadata({
  title: "Guild Card",
  description: "Your Monster Hunter Freedom Unite hunter's Guild Card, read from your save file.",
  path: "/hunter/guild-card/",
});

export default function HunterGuildCardPage() {
  return <GuildCardPage smallMonsterIds={getSmallMonsterIds()} />;
}
