"use client";

import { useMemo } from "react";
import { useSave } from "@/context/SaveContext";
import { useAllMonsters, useQuests } from "@/lib/client-data";
import type { AwardContext } from "@/lib/awards";

/** What the awards' progress is worked out from: the loaded hunter, the quests and the monsters. */
export function useAwardContext(): AwardContext {
  const { save } = useSave();
  const { quests } = useQuests();
  const monsters = useAllMonsters();
  return useMemo(() => ({ save, quests, monsters }), [save, quests, monsters]);
}
