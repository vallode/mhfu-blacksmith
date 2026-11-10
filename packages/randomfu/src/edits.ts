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
