/**
 * The set builder's search data and equipment IDs, read from the generated
 * /data bundles (public/data, from scripts/generate-data.ts) and run through
 * the same builder as the client (src/lib/client-data.ts). For build scripts
 * and tests.
 */
import fs from "node:fs";
import path from "node:path";
import { ARMOR_RANKS, ARMOR_SLOTS } from "../../src/lib/constants";
import type {
  ArmorBundle,
  DecorationBundle,
  Dictionaries,
  EquipmentIds,
} from "../../src/lib/schema";
import { setSearchDataFromBundles } from "../../src/lib/set-data";
import type { SearchData, SkillTreeData } from "../../src/lib/set-search";

export function readSetSearchData(dataDir: string): { data: SearchData; ids: EquipmentIds } {
  const read = <T>(file: string): T =>
    JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf-8")) as T;
  const armor = ARMOR_SLOTS.flatMap((slot) =>
    ARMOR_RANKS.filter((rank) =>
      fs.existsSync(path.join(dataDir, `armor-${slot}-${rank}.json`)),
    ).map((rank) => read<ArmorBundle>(`armor-${slot}-${rank}.json`)),
  );
  const data = setSearchDataFromBundles(
    read<Dictionaries>("dictionaries.json"),
    read<{ skills: SkillTreeData[] }>("skills.json").skills,
    read<DecorationBundle>("decorations.json"),
    armor,
  );
  return { data, ids: read<EquipmentIds>("equipment-ids.json") };
}
