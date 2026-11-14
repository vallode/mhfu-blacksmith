/**
 * Rebuilding a quest from a document (mhfu-extract `quests/document.ts`),
 * for shuffles that change the shape of its lists rather than values in
 * place: moving a quest to another map takes on that map's gathering
 * points and small monster areas, whose lists are another length.
 *
 * The rebuilt quest replaces the loaded one for every later shuffle: its
 * payload is their base, and offsets they read come from it. It keeps the
 * disc's original (`QuestFile.disc`) so the writer still knows it changed.
 */
import { checkQuest, serializeQuest, type QuestDoc } from "mhfu-extract/src/quests/document.js";
import { parseQuest } from "mhfu-extract/src/quests/parser.js";
import type { LoadedQuest } from "./load.js";

/** The quest's document, or null if it doesn't survive a rebuild unchanged. */
export function questDoc(quest: LoadedQuest): QuestDoc | null {
  const check = checkQuest(quest.file.disc);
  return check.editable ? check.doc : null;
}

/**
 * The largest quest on the disc. No rebuilt quest grows past it, whatever
 * room its sectors have: it's a size the game is known to load.
 */
export function largestQuest(quests: readonly LoadedQuest[]): number {
  return Math.max(...quests.map((q) => q.file.disc.length));
}

/**
 * `doc` as a quest file for `quest`, or null if it doesn't fit, even with
 * identical strings stored once: past the quest's sectors or past
 * `maxLength` (`largestQuest`). Not padded.
 */
export function questPayload(quest: LoadedQuest, doc: QuestDoc, maxLength: number): Buffer | null {
  const { capacity, disc } = quest.file;
  const limit = Math.min(capacity, Math.max(maxLength, disc.length));
  let payload = serializeQuest(doc);
  if (payload.length > limit) payload = serializeQuest(doc, { shareStrings: true });
  return payload.length > limit ? null : payload;
}

/**
 * `quest` with `doc` as its contents, or null if it doesn't fit
 * (`questPayload`). A quest that comes out shorter than the disc's is
 * padded with zeros back to its length (the file's size can't go down).
 */
export function rebuildQuest(
  quest: LoadedQuest,
  doc: QuestDoc,
  maxLength: number,
): LoadedQuest | null {
  let payload = questPayload(quest, doc, maxLength);
  if (!payload) return null;
  const { disc } = quest.file;
  if (payload.length < disc.length) {
    const padded = Buffer.alloc(disc.length);
    payload.copy(padded);
    payload = padded;
  }
  return {
    ...quest,
    file: { ...quest.file, payload },
    parsed: parseQuest(payload),
  };
}
