/**
 * Builds public/data/locale-<code>.json from data/<game>/locales/<code>.json: the
 * game's names, quest text and award text in other languages (see
 * src/lib/i18n/game-text.ts). Entries whose English key the site doesn't have
 * are dropped with a warning, since nothing would ever look them up (a
 * renamed weapon, a typo, a name the extractor spells differently).
 */
import fs from "fs";
import path from "path";
import { gameDataDir, readData } from "game-data";
import { GAME_TEXT_KINDS, type GameLocale, type GameTextKind } from "../../src/lib/i18n/game-text";

type Json = unknown;

/**
 * A file under `dataDir`, read through game-data: game records come back in
 * their named view (names from data/mhfu/strings), anything else as it is.
 */
const readJson = (dataDir: string, game: string, p: string): Json =>
  readData(dataDir, game, path.relative(gameDataDir(dataDir, game), p));

const jsonFilesIn = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => path.join(dir, f))
    : [];

/** Every string under one of `keys`, anywhere in `node`. */
function collect(node: Json, keys: readonly string[], out: Set<string>): Set<string> {
  if (Array.isArray(node)) for (const v of node) collect(v, keys, out);
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (keys.includes(k) && typeof v === "string") out.add(v);
      else collect(v, keys, out);
    }
  }
  return out;
}

const listOf = (dataDir: string, game: string, file: string, key: string): Json[] =>
  ((readJson(dataDir, game, file) as Record<string, Json[]>)[key] ?? []) as Json[];

/** The English names each kind of locale entry can translate. */
export function englishNames(dataDir: string, game: string): Record<GameTextKind, Set<string>> {
  const names = (files: string[], key: string) =>
    new Set(
      files.flatMap((f) => listOf(dataDir, game, f, key)).map((x) => (x as { name: string }).name),
    );
  const weaponFiles = jsonFilesIn(path.join(gameDataDir(dataDir, game), "weapons"));
  const armorFiles = jsonFilesIn(path.join(gameDataDir(dataDir, game), "armor"));
  const monsterFiles = jsonFilesIn(path.join(gameDataDir(dataDir, game), "monsters"));
  const questFiles = jsonFilesIn(path.join(gameDataDir(dataDir, game), "quests"));
  const decorations = path.join(gameDataDir(dataDir, game), "decorations.json");
  const everything = [
    ...weaponFiles,
    ...armorFiles,
    ...monsterFiles,
    ...questFiles,
    decorations,
    path.join(gameDataDir(dataDir, game), "items.json"),
  ].map((f) => readJson(dataDir, game, f));

  const skills = readJson(dataDir, game, path.join(gameDataDir(dataDir, game), "skills.json")) as {
    skills: { tree: string; aliases?: string[]; skills: { name: string }[] }[];
  };
  const skillNames = new Set<string>();
  for (const tree of skills.skills) {
    skillNames.add(tree.tree);
    for (const alias of tree.aliases ?? []) skillNames.add(alias);
    for (const skill of tree.skills) skillNames.add(skill.name);
  }
  // Armor and decorations name skill trees in their own spellings.
  for (const file of [...armorFiles, decorations]) {
    for (const piece of listOf(
      dataDir,
      game,
      file,
      file === decorations ? "decorations" : "armor",
    )) {
      for (const s of (piece as { skills?: (string | { name: string })[] }).skills ?? []) {
        skillNames.add(typeof s === "string" ? s.replace(/ [+-]?\d+$/, "") : s.name);
        if (typeof s === "string") skillNames.add(s);
      }
    }
  }

  return {
    weapon: names(weaponFiles, "weapons"),
    armor: names(armorFiles, "armor"),
    decoration: names([decorations], "decorations"),
    monster: names(monsterFiles, "monsters"),
    // Materials, drops, supplies and rewards: any item-like name in the data.
    item: everything.reduce<Set<string>>((set, d) => collect(d, ["name", "item"], set), new Set()),
    skill: skillNames,
    map: questFiles.reduce<Set<string>>(
      (set, f) => collect(readJson(dataDir, game, f), ["map"], set),
      new Set(),
    ),
  };
}

export interface LocaleBundle {
  code: string;
  json: string;
  entries: number;
  warnings: string[];
}

export function buildLocaleBundles(dataDir: string, game: string): LocaleBundle[] {
  const files = jsonFilesIn(path.join(gameDataDir(dataDir, game), "locales"));
  if (files.length === 0) return [];
  const english = englishNames(dataDir, game);
  const questIds = new Set(
    jsonFilesIn(path.join(gameDataDir(dataDir, game), "quests"))
      .flatMap((f) => listOf(dataDir, game, f, "quests"))
      .map((q) => String((q as { id: number }).id)),
  );
  const awardIds = new Set(
    listOf(dataDir, game, path.join(gameDataDir(dataDir, game), "awards.json"), "awards").map((a) =>
      String((a as { id: number }).id),
    ),
  );

  return files.map((file) => {
    const code = path.basename(file, ".json");
    const source = readJson(dataDir, game, file) as GameLocale;
    const out: GameLocale = {};
    const warnings: string[] = [];
    let entries = 0;
    if (source.source) out.source = source.source;

    for (const kind of GAME_TEXT_KINDS) {
      const section = source[kind];
      if (!section) continue;
      const kept: Record<string, string> = {};
      const unknown: string[] = [];
      for (const [en, translated] of Object.entries(section)) {
        if (english[kind].has(en)) kept[en] = translated;
        else unknown.push(en);
      }
      if (unknown.length > 0) {
        warnings.push(
          `${code}: ${unknown.length} ${kind} name(s) not in data/, dropped: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? ", …" : ""}`,
        );
      }
      if (Object.keys(kept).length > 0) out[kind] = kept;
      entries += Object.keys(kept).length;
    }

    if (source.quest) {
      const kept: NonNullable<GameLocale["quest"]> = {};
      const unknown = Object.keys(source.quest).filter((id) => !questIds.has(id));
      for (const [id, text] of Object.entries(source.quest)) {
        if (questIds.has(id)) kept[id] = text;
      }
      if (unknown.length > 0) {
        warnings.push(`${code}: ${unknown.length} quest ID(s) not in data/mhfu/quests, dropped`);
      }
      if (Object.keys(kept).length > 0) out.quest = kept;
      entries += Object.keys(kept).length;
    }

    if (source.award) {
      const kept: NonNullable<GameLocale["award"]> = {};
      const unknown = Object.keys(source.award).filter((id) => !awardIds.has(id));
      for (const [id, text] of Object.entries(source.award)) {
        if (awardIds.has(id)) kept[id] = text;
      }
      if (unknown.length > 0) {
        warnings.push(
          `${code}: ${unknown.length} award ID(s) not in data/mhfu/awards.json, dropped`,
        );
      }
      if (Object.keys(kept).length > 0) out.award = kept;
      entries += Object.keys(kept).length;
    }

    return { code, json: JSON.stringify(out), entries, warnings };
  });
}
