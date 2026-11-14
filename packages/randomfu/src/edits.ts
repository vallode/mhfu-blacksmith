/**
 * Copies of the game files the shuffles change. Shuffles read the vanilla
 * data from `GameData` and write into these copies; `write.ts` seals and
 * re-encrypts whatever changed.
 */
import type { GameData, LoadedOverlay, LoadedQuest } from "./game/load.js";

export class Edits {
  /** Quest payloads by DATA.BIN index. */
  readonly quests = new Map<number, { quest: LoadedQuest; payload: Buffer }>();
  /** Other DATA.BIN files (overlays) by index, plaintext. */
  readonly files = new Map<number, Buffer>();
  /** Files added to the disc, or replacing ones on it, by ISO path. */
  readonly discFiles = new Map<string, Buffer>();
  private ebootCopy: Buffer | null = null;

  constructor(private readonly game: GameData) {}

  quest(quest: LoadedQuest): Buffer {
    let edit = this.quests.get(quest.index);
    if (!edit) {
      edit = { quest, payload: Buffer.from(quest.file.payload) };
      this.quests.set(quest.index, edit);
    }
    return edit.payload;
  }

  /**
   * Appends `data` to a quest's payload, on a 4-byte boundary, and returns
   * its offset. Earlier edits are kept; later `quest()` calls return the
   * longer payload.
   */
  appendToQuest(quest: LoadedQuest, data: Buffer): number {
    const current = this.quest(quest);
    const offset = (current.length + 3) & ~3;
    const next = Buffer.alloc(offset + data.length);
    current.copy(next);
    data.copy(next, offset);
    this.quests.get(quest.index)!.payload = next;
    return offset;
  }

  /** A quest's payload as the shuffles so far left it, without marking it edited. Don't write to it. */
  questNow(quest: LoadedQuest): Buffer {
    return this.quests.get(quest.index)?.payload ?? quest.file.payload;
  }

  overlay(overlay: LoadedOverlay): Buffer {
    return this.dataFile(overlay.index);
  }

  /** Any other DATA.BIN file by index, plaintext (the quest board files). */
  dataFile(index: number): Buffer {
    let buf = this.files.get(index);
    if (!buf) {
      buf = Buffer.from(this.game.dataBin.read(index));
      this.files.set(index, buf);
    }
    return buf;
  }

  /** A data file as the shuffles so far left it, without marking it edited. Don't write to it. */
  dataFileNow(index: number): Buffer {
    return this.files.get(index) ?? this.game.dataBin.read(index);
  }

  /** Adds a file to the disc, or replaces one, outside DATA.BIN (an ISO path). */
  discFile(path: string, data: Buffer): void {
    this.discFiles.set(path, data);
  }

  eboot(): Buffer {
    if (!this.game.eboot) throw new Error("The EBOOT wasn't loaded");
    this.ebootCopy ??= Buffer.from(this.game.eboot);
    return this.ebootCopy;
  }

  /** The edited EBOOT, or null if nothing changed it. */
  changedEboot(): Buffer | null {
    return this.ebootCopy && !this.ebootCopy.equals(this.game.eboot!) ? this.ebootCopy : null;
  }
}
