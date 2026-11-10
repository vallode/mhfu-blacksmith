/**
 * `quest-text-scan` subcommand: finds where else on the disc a quest's text
 * lives (see quests/text-scan.ts). Reads one quest's strings from an
 * `unpack`ed disc, searches every other DATA.BIN file and the EBOOT for
 * them, and writes a report with the hits, their pointer tables, and the
 * headers of the files that are likely message files.
 *
 * The report quotes the quest's own text (to say which string was found):
 * it's for the person running it, like a spoiler log. Don't commit it.
 */
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadFileList } from "../container/filelist.js";
import { listQuestFiles } from "../quests/discovery.js";
import { decryptQuest } from "../quests/mib.js";
import { parseQuest, readQuestStrings, LANG_SLOTS, STRING_FIELDS } from "../quests/parser.js";
import { BinaryReader } from "../binary/reader.js";
import {
  describeFiles,
  formatTextScan,
  scanQuestText,
  type TextNeedle,
  type TextScanFile,
} from "../quests/text-scan.js";
import { assertCurrentFileNames, type UnpackManifest } from "./unpack.js";

export interface QuestTextScanOptions {
  unpacked: string;
  questId: number;
  /** Report path; defaults to `<unpacked>/quest-text-scan.txt`. */
  out?: string;
}

/** `LangPTRs` slots by the game's language ID (decomp `LanguageId`). */
const LANGUAGES = ["Japanese", "English", "German", "French", "Spanish", "Italian", "Korean"];

/**
 * Files likely to hold message text. JP names them (`message_jpn/str_tbl.pac`,
 * `quest_str.pac`, `lobby_str.pac`, `arcade_str.pac`); on the EU disc they're
 * the unnamed groups that fit five languages: 19-23 and 4776-4790.
 */
const MESSAGE_CANDIDATES: Record<string, number[]> = {
  jp: [15, 4756, 4757, 4758],
  eu: [19, 20, 21, 22, 23, ...Array.from({ length: 15 }, (_, i) => 4776 + i)],
};

async function walk(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const name of (await readdir(dir)).sort()) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if ((await stat(path.join(dir, name))).isDirectory())
      out.push(...(await walk(path.join(dir, name), rel)));
    else out.push(rel);
  }
  return out;
}

export async function runQuestTextScan(options: QuestTextScanOptions): Promise<string> {
  const manifest: UnpackManifest = JSON.parse(
    await readFile(path.join(options.unpacked, "manifest.json"), "utf-8"),
  );
  assertCurrentFileNames(manifest, options.unpacked);
  const dataBin = path.join(options.unpacked, "data-bin");

  let needles: TextNeedle[] | null = null;
  for (const ref of listQuestFiles(manifest.region)) {
    let payload: Buffer;
    try {
      payload = decryptQuest(await readFile(path.join(dataBin, ref.path)), manifest.region);
    } catch {
      continue;
    }
    const parsed = parseQuest(payload);
    if (parsed.header.questId !== options.questId) continue;
    const strings = readQuestStrings(new BinaryReader(payload), parsed.header);
    const seen = new Set<string>();
    needles = [];
    LANG_SLOTS.forEach((slot, i) => {
      const block = strings[slot];
      if (!block) return;
      for (const field of STRING_FIELDS) {
        const text = block[field];
        if (!text || seen.has(text)) continue;
        seen.add(text);
        needles!.push({ label: `${LANGUAGES[i]} ${field}`, text });
      }
    });
    break;
  }
  if (!needles) throw new Error(`No quest ${options.questId} on this disc`);

  const files: TextScanFile[] = [];
  const ebootPath = path.join(options.unpacked, "eboot.bin");
  if (manifest.eboot !== false) files.push({ name: "eboot.bin", buf: await readFile(ebootPath) });
  for (const rel of await walk(dataBin)) {
    if (/^mission_jpn\/.*\.mib$/.test(rel)) continue;
    files.push({ name: rel, buf: await readFile(path.join(dataBin, rel)) });
  }
  console.log(
    `Searching ${files.length} files for ${needles.length} strings of quest ${options.questId}...`,
  );

  const names = loadFileList(manifest.region);
  const candidates: TextScanFile[] = [];
  for (const index of MESSAGE_CANDIDATES[manifest.region] ?? []) {
    const rel = names.get(index) ?? path.join("_unindexed", `${index}.bin`);
    const file = files.find((f) => f.name === rel.split(path.sep).join("/"));
    if (file) candidates.push({ name: `${index} ${file.name}`, buf: file.buf });
  }

  const report = [
    `Quest ${options.questId} (${manifest.region.toUpperCase()} disc): where its own strings are found elsewhere.`,
    "",
    formatTextScan(scanQuestText(files, needles)),
    "Likely message files (first 16 u32 words):",
    describeFiles(candidates),
  ].join("\n");
  const out = options.out ?? path.join(options.unpacked, "quest-text-scan.txt");
  await writeFile(out, report, "utf-8");
  return out;
}
