/**
 * The set builder's data as the site ships it: the generated /data bundles
 * (public/data, from scripts/generate-data.ts) run through the same builder
 * as the client. Generates the bundles first when they're missing or older
 * than the decorations' item IDs.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { DecorationBundle, EquipmentIds } from "../../src/lib/schema";
import type { SearchData } from "../../src/lib/set-search";
import { readSetSearchData } from "../../scripts/lib/set-data";

const outDir = path.join(process.cwd(), "public", "data");
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
  cached = readSetSearchData(outDir);
  return cached;
}
