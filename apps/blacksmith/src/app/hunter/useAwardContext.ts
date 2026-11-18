"use client";

import { useMemo } from "react";
import { useSave } from "@/context/SaveContext";
import type { AwardContext } from "@/lib/awards";
import { useAllMonsters, useQuests } from "@/lib/client-data";
import { useEquipmentIds } from "@/lib/equipment";

/**
 * What the awards' progress is worked out from: the loaded hunter, the
 * quests, the monsters, and the equipment IDs (for armor rarity).
 */
export function useAwardContext(): AwardContext {
  const { save } = useSave();
  const { quests } = useQuests();
  const monsters = useAllMonsters();
  const { ids: equipmentIds, error: equipmentIdsFailed } = useEquipmentIds(save !== null);
  return useMemo(
    () => ({ save, quests, monsters, equipmentIds, equipmentIdsFailed }),
    [save, quests, monsters, equipmentIds, equipmentIdsFailed],
  );
}
