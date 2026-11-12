"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readLastQuestHub } from "@/lib/last-quest-hub";

/** `/quests/` has no page of its own: it sends you to the quest board you last viewed. */
export default function QuestHubRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/quests/${readLastQuestHub()}/`);
  }, [router]);
  return null;
}
