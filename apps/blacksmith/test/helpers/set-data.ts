/**
 * The set builder's data as the site ships it: the generated /data bundles
 * (public/data, from scripts/generate-data.ts) run through the same builder
 * as the client. Generates the bundles first when they're missing or older
 * than the decorations' item IDs.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type {
  ArmorBundle,
  DecorationBundle,
  Dictionaries,
  EquipmentIds,
} from "../../src/lib/schema";
import { ARMOR_RANKS, ARMOR_SLOTS } from "../../src/lib/constants";
import { setSearchDataFromBundles } from "../../src/lib/set-data";
import type { SearchData, SkillTreeData } from "../../src/lib/set-search";

const outDir = path.join(process.cwd(), "public", "data");
const read = <T>(file: string): T =>
  JSON.parse(fs.readFileSync(path.join(outDir, file), "utf-8")) as T;

function ensureBundles() {
  const decos = path.join(outDir, "decorations.json");
  const fresh =
    fs.existsSync(path.join(outDir, "equipment-ids.json")) &&
    fs.existsSync(decos) &&
    (JSON.parse(fs.readFileSync(decos, "utf-8")) as DecorationBundle).items.every(
      (d) => d.i !== undefined,
    );
  if (!fresh) {
    execFileSync(process.execPath, ["--import", "tsx", path.join("scripts", "generate-data.ts")], {
      stdio: "ignore",
    });
  }
}

let cached: { data: SearchData; ids: EquipmentIds } | null = null;

export function loadShippedSetData(): { data: SearchData; ids: EquipmentIds } {
  if (cached) return cached;
  ensureBundles();
  const armor = ARMOR_SLOTS.flatMap((slot) =>
    ARMOR_RANKS.filter((rank) =>
      fs.existsSync(path.join(outDir, `armor-${slot}-${rank}.json`)),
    ).map((rank) => read<ArmorBundle>(`armor-${slot}-${rank}.json`)),
  );
  const data = setSearchDataFromBundles(
    read<Dictionaries>("dictionaries.json"),
    read<{ skills: SkillTreeData[] }>("skills.json").skills,
    read<DecorationBundle>("decorations.json"),
    armor,
  );
  cached = { data, ids: read<EquipmentIds>("equipment-ids.json") };
  return cached;
}
