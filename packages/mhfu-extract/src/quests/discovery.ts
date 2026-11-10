/**
 * Enumerates and decrypts every real quest file out of an already-
 * `unpackDataBin()`'d DATA.BIN.
 *
 * `mission_jpn/*.mib` (per the vendored filelist.csv) has 564 entries, but
 * 13 of them (`level1.mib`..`level11.mib`, `levelx.mib`, `levela.mib`) are a
 * different, non-quest format — confirmed empirically: every one of them
 * fails `QuestCipher`'s SHA1/size check under the `decryptQuest()` region
 * salt that cleanly decrypts all other 551 `m#####.mib` files. They aren't
 * quest-encrypted at all: they're the quest board, a copy of each quest's
 * display header section and text (README "Quest text"; randomfu
 * `src/game/board.ts`). Filtering them out by filename upfront documents the distinction
 * explicitly instead of relying on that decrypt failure.
 */
import type { DataBinFile } from "../container/databin.js";
import type { Region } from "../container/sfo.js";
import { loadFileList, questFileIndices } from "../container/filelist.js";
import { decryptQuest, isQuestMagic, QuestCipherError } from "./mib.js";
import { parseQuest, type ParsedQuest } from "./parser.js";

export interface QuestFileRef {
  index: number;
  path: string;
}

const REAL_QUEST_FILE = /^mission_jpn\/m\d+\.mib$/;

/** Every real `mission_jpn/m#####.mib` file's DATA.BIN TOC index + vendored path, excluding the 13 non-quest `level*.mib` files. */
export function listQuestFiles(region: Region = "jp"): QuestFileRef[] {
  const fileList = loadFileList(region);
  return questFileIndices(region)
    .map((index) => ({ index, path: fileList.get(index)! }))
    .filter((ref) => REAL_QUEST_FILE.test(ref.path));
}

export interface SkippedQuestFile {
  path: string;
  reason: string;
}

export interface QuestReadResult {
  quests: ParsedQuest[];
  skipped: SkippedQuestFile[];
}

/**
 * Decrypts and parses every real quest file referenced by `listQuestFiles()`
 * out of `dataBinFiles` (the result of `unpackDataBin()` on a full DATA.BIN).
 * Any file that fails to decrypt, doesn't carry the expected magic, or
 * throws while parsing is reported in `skipped` rather than aborting the
 * whole run.
 */
export function readAllQuests(dataBinFiles: DataBinFile[], region: Region): QuestReadResult {
  const quests: ParsedQuest[] = [];
  const skipped: SkippedQuestFile[] = [];

  for (const ref of listQuestFiles(region)) {
    const file = dataBinFiles[ref.index];
    if (!file) {
      skipped.push({ path: ref.path, reason: "missing from DATA.BIN TOC" });
      continue;
    }
    try {
      const payload = decryptQuest(file.data, region);
      if (!isQuestMagic(payload)) {
        skipped.push({ path: ref.path, reason: "decrypted payload is missing the quest magic" });
        continue;
      }
      quests.push(parseQuest(payload));
    } catch (error) {
      const reason = error instanceof QuestCipherError ? error.message : String(error);
      skipped.push({ path: ref.path, reason });
    }
  }

  return { quests, skipped };
}
