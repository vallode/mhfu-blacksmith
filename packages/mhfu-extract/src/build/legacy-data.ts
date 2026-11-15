/**
 * The game IDs `data/` didn't hold before records carried their own, from
 * the extractor's tables: skill trees (`SkillID`, through the site's
 * spelling aliases), monsters (`overlay/monsters.json`, then `emID`) and
 * maps (`MAP_NAMES`). game-data's `importLegacy` used them to move `data/`
 * to IDs; tests use them to write fixtures from named data.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  gameDataDir,
  importLegacy,
  serializeData,
  serializeStrings,
  stringsPath,
  type DataDoc,
  type LegacyIdSources,
} from "game-data";
import { canonicalSkillName } from "../overlay/skill-name-aliases.js";
import { loadEnums } from "../strings/enums.js";
import { GAME } from "../game.js";
import { MAP_NAMES } from "../tables/quest-maps.js";

const OVERLAY_MONSTERS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "overlay",
  "monsters.json",
);

export function legacyIdSources(): LegacyIdSources {
  const enums = loadEnums();
  const skills = (enums.get("SkillID") ?? []).map((s) => s.trim());
  const monsters = (enums.get("emID") ?? []).map((s) => s.trim());
  const overlay = new Map(
    (
      JSON.parse(readFileSync(OVERLAY_MONSTERS, "utf-8")) as {
        monsters: { id: number; name: string }[];
      }
    ).monsters.map((m) => [m.name, m.id]),
  );
  return {
    skillId(tree, aliases) {
      for (const name of [tree, ...aliases])
        for (const candidate of [name, canonicalSkillName(name)]) {
          const ids = skills.flatMap((s, i) => (s === candidate ? [i] : []));
          if (ids.length === 1) return ids[0]!;
        }
      throw new Error(`no SkillID for the skill tree "${tree}"`);
    },
    monsterId(name) {
      if (overlay.has(name)) return overlay.get(name);
      const id = monsters.indexOf(name);
      return id < 0 ? undefined : id;
    },
    maps: MAP_NAMES,
  };
}

/**
 * Writes named data files (path inside the game's data directory ->
 * content, in the layout before IDs, with `equipment-ids.json` for weapon
 * and armor IDs) into `dataDir` (a `data/` directory) as game-data writes
 * them: records with IDs under `<game>/`, plus `<game>/strings/en.json`
 * and `<game>/strings/ja.json`.
 */
export function writeNamedData(dataDir: string, files: Record<string, DataDoc>): void {
  const { files: raw, en, ja } = importLegacy(new Map(Object.entries(files)), legacyIdSources());
  const gameDir = gameDataDir(dataDir, GAME);
  for (const [rel, doc] of raw) {
    mkdirSync(path.dirname(path.join(gameDir, rel)), { recursive: true });
    writeFileSync(path.join(gameDir, rel), serializeData(doc));
  }
  mkdirSync(path.dirname(stringsPath(dataDir, GAME)), { recursive: true });
  writeFileSync(stringsPath(dataDir, GAME, "en"), serializeStrings(en));
  writeFileSync(stringsPath(dataDir, GAME, "ja"), serializeStrings(ja));
}
