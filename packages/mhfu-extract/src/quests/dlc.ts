/**
 * Downloadable quests: the Event Quests (`m60xxx.mib`) and Challenge Quests
 * (`m61xxx.mib`) Capcom handed out online. None of them are on a disc (not
 * the EU or JP retail DATA.BIN, nor FUComplete's): the game downloaded each
 * into one of six slots in the save file. See README's "Downloadable quests".
 *
 * `readDlcQuests` takes either
 *  - a CWCheat file (`.ini`) that writes the quests into the game's memory,
 *    as archived by github.com/viciousShadow/MH-PSP-DLC
 *    (`Event-via-Code/ULES01213.ini`), or
 *  - a directory of `.mib` files, plain or wrapped in `QuestCipher` as
 *    they were downloaded and stored in the save.
 *
 * The cheat file writes each quest as a run of 32-bit writes (`_L
 * 0x2AAAAAAA 0xVVVVVVVV`) under a `_C0 <DLC MHFU=60038> Title` heading. The
 * runs are the plain `.mib` with one change: every Event Quest carries quest
 * ID 60038, since the cheat swaps the quest into Twin Terrors' download slot.
 * Restoring the heading's ID gives back the downloaded file byte for byte
 * (checked against six quests stored in a 2010 EU save). Its MHFU sections
 * hold the English quests, its MHP2G sections the Japanese ones.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Region } from "../container/sfo.js";
import { DOWNLOADED_HUBS, questHub } from "../emit/quests.js";
import { decryptQuest, isQuestMagic } from "./mib.js";
import { parseQuest, type ParsedQuest } from "./parser.js";

/** `questHeader.QuestID`'s offset in a `.mib`. */
const QUEST_ID_OFFSET = 100;

/** Whether a quest ID is a downloadable quest's: one on the Event or Challenge board. */
export function isDlcQuestId(id: number): boolean {
  const hub = questHub(id);
  return hub !== null && DOWNLOADED_HUBS.has(hub);
}

export interface DlcQuestFile {
  /** Where it came from: the cheat heading or the file name. */
  source: string;
  payload: Buffer;
}

export interface DlcQuest extends DlcQuestFile {
  parsed: ParsedQuest;
  /** The file's size as read, before any `QuestCipher` unwrapping. */
  size: number;
}

/** A quest left out, and why. */
export interface DlcSkipped {
  source: string;
  reason: string;
}

export interface DlcReadResult {
  quests: DlcQuest[];
  skipped: DlcSkipped[];
}

/** The cheat file's game label for a region's quests: English on EU/US, Japanese on JP. */
function cheatGame(region: Region): "MHFU" | "MHP2G" {
  return region === "jp" ? "MHP2G" : "MHFU";
}

/**
 * The quests a CWCheat file writes, for `region`'s game, each a plain
 * `.mib` with its quest ID set from the heading. A section's writes must run
 * on from one another, 4 bytes at a time, and reach past the quest ID, or
 * the section is skipped with the reason.
 */
export function readCheatQuests(
  text: string,
  region: Region,
): { quests: DlcQuestFile[]; skipped: DlcSkipped[] } {
  const game = cheatGame(region);
  const quests: DlcQuestFile[] = [];
  const skipped: DlcSkipped[] = [];
  let current: {
    id: number;
    source: string;
    words: number[];
    next: number | null;
    problem: string | null;
  } | null = null;
  const finish = () => {
    if (!current || current.words.length === 0) return;
    const { source, problem } = current;
    const size = current.words.length * 4;
    if (problem) {
      skipped.push({ source, reason: problem });
    } else if (size < QUEST_ID_OFFSET + 2) {
      skipped.push({ source, reason: `${size} bytes, too short for a quest header` });
    } else {
      const payload = Buffer.alloc(size);
      current.words.forEach((word, i) => payload.writeUInt32LE(word, i * 4));
      payload.writeUInt16LE(current.id, QUEST_ID_OFFSET);
      quests.push({ source, payload });
    }
  };

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("_C")) {
      finish();
      current = null;
      const heading = line.match(/^_C\d\s+<DLC (\w+)=(\d+)>\s*(.*)$/);
      if (heading?.[1] === game) {
        current = {
          id: Number(heading[2]),
          source: line.slice(3).trim(),
          words: [],
          next: null,
          problem: null,
        };
      }
      continue;
    }
    if (!current || current.problem) continue;
    const write = line.match(/^_L 0x2([0-9A-Fa-f]{7}) 0x([0-9A-Fa-f]{8})/);
    if (!write) continue;
    const address = Number.parseInt(write[1]!, 16);
    if (current.next !== null && address !== current.next) {
      current.problem = `write to 0x${address.toString(16)} doesn't follow 0x${(current.next - 4).toString(16)}`;
      continue;
    }
    current.words.push(Number.parseInt(write[2]!, 16));
    current.next = address + 4;
  }
  finish();
  return { quests, skipped };
}

/** A downloaded `.mib`: plain if it starts with the quest magic, else unwrapped from `QuestCipher`. */
function questFilePayload(data: Buffer, region: Region): Buffer {
  return isQuestMagic(data) ? data : decryptQuest(data, region);
}

/**
 * Every downloadable quest in `source` (a cheat file or a directory of
 * `.mib` files) for `region`'s game, parsed. A quest outside the
 * downloadable ID range, or one that fails to decrypt or parse, is skipped
 * with the reason. Sorted by quest ID; a repeated ID keeps the first.
 */
export function readDlcQuests(source: string, region: Region): DlcReadResult {
  let files: DlcQuestFile[];
  const skipped: DlcSkipped[] = [];
  if (statSync(source).isDirectory()) {
    files = readdirSync(source)
      .filter((f) => f.toLowerCase().endsWith(".mib"))
      .sort()
      .map((f) => ({ source: f, payload: readFileSync(path.join(source, f)) }));
  } else {
    const cheat = readCheatQuests(readFileSync(source, "utf-8"), region);
    files = cheat.quests;
    skipped.push(...cheat.skipped);
  }

  const quests: DlcQuest[] = [];
  const seen = new Set<number>();
  for (const file of files) {
    try {
      const payload = questFilePayload(file.payload, region);
      if (!isQuestMagic(payload)) throw new Error("missing the quest magic");
      const parsed = parseQuest(payload);
      const id = parsed.header.questId;
      if (!isDlcQuestId(id)) throw new Error(`quest ID ${id} isn't a downloadable quest's`);
      if (seen.has(id)) throw new Error(`quest ${id} is already read`);
      seen.add(id);
      quests.push({ ...file, payload, parsed, size: file.payload.length });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      skipped.push({ source: file.source, reason });
    }
  }
  quests.sort((a, b) => a.parsed.header.questId - b.parsed.header.questId);
  return { quests, skipped };
}
