/**
 * `disc-text` subcommand: writes the game's item, equipment and skill names
 * and descriptions, one file per language, from an `unpack`ed EU disc (see
 * strings/disc-text.ts) to `data/text/<language>.json`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BinaryReader } from "../binary/reader.js";
import { loadFileList } from "../container/filelist.js";
import { MHP2G_EU_RESOLVER } from "../games/mhp2g.js";
import { readDescriptionIndexes } from "../tables/descriptions.js";
import { buildDiscText, EU_STR_TBL_FILES, type DiscLanguage } from "../strings/disc-text.js";
import { readMessageFile } from "../strings/messages.js";
import { assertCurrentFileNames, type UnpackManifest } from "./unpack.js";

export interface DiscTextOptions {
  unpacked: string;
  /** Directory for `<language>.json`. */
  out: string;
}

const COMMENT =
  "The game's own names and descriptions, from the EU disc's str_tbl (mhfu-extract disc-text). " +
  "Arrays are indexed by game ID: items by item ID (data/items.json), equipment as in data/equipment-ids.json, " +
  "skill_trees by SkillID and skills by skill ID. ID 0 is null. Names are the EU disc's, which can differ from the site's. " +
  "Descriptions keep the game's line breaks; color codes are removed.";

export async function runDiscText(options: DiscTextOptions): Promise<DiscLanguage[]> {
  const manifest: UnpackManifest = JSON.parse(
    await readFile(path.join(options.unpacked, "manifest.json"), "utf-8"),
  );
  assertCurrentFileNames(manifest, options.unpacked);
  if (manifest.region !== "eu") {
    throw new Error(
      `disc-text reads the EU disc's str_tbl; ${options.unpacked} is ${manifest.region.toUpperCase()}`,
    );
  }
  if (manifest.eboot === false) {
    throw new Error(
      `${options.unpacked} was unpacked with --skip-eboot; disc-text needs eboot.bin for the equipment descriptions`,
    );
  }
  const eboot = await readFile(path.join(options.unpacked, "eboot.bin"));
  const indexes = readDescriptionIndexes(
    new BinaryReader(eboot),
    MHP2G_EU_RESOLVER.resolve("equipmentDescriptions", eboot),
  );

  const files = loadFileList(manifest.region);
  await mkdir(options.out, { recursive: true });
  const languages = Object.keys(EU_STR_TBL_FILES) as DiscLanguage[];
  for (const language of languages) {
    const file = EU_STR_TBL_FILES[language];
    const rel = files.get(file) ?? path.join("_unindexed", `${file}.bin`);
    const tables = readMessageFile(await readFile(path.join(options.unpacked, "data-bin", rel)));
    if (!tables) throw new Error(`${file} (${rel}) isn't laid out like a message file`);
    const text = buildDiscText(language, tables, indexes);
    const out = path.join(options.out, `${language}.json`);
    await writeFile(out, `${JSON.stringify({ $comment: COMMENT, ...text }, null, 2)}\n`, "utf-8");
    console.log(
      `${language}: ${count(text.items)} items, ${count(text.melee) + count(text.ranged)} weapons, ` +
        `${count(text.helmet) + count(text.plate) + count(text.gauntlets) + count(text.waist) + count(text.leggings)} armor pieces, ` +
        `${count(text.skill_trees)} skill trees, ${count(text.skills)} skills -> ${out}`,
    );
  }
  return languages;
}

function count(list: readonly unknown[]): number {
  return list.filter((x) => x !== null).length;
}
