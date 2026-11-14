/**
 * Writes edits into the output image, then reads every changed file back
 * through the normal decrypting path and checks it matches what was meant.
 */
import { DataBin } from "./disc/databin.js";
import type { PatchableImage } from "./disc/image.js";
import { openQuestFile } from "./disc/quest-file.js";
import type { Edits } from "./edits.js";
import { DATA_BIN_PATH, EBOOT_PATH, type GameData } from "./game/load.js";

export interface WriteSummary {
  quests: number;
  files: number;
  /** Files written outside DATA.BIN. */
  discFiles: number;
  eboot: "unchanged" | "in place" | "moved to the end of the image";
}

export function writeEdits(image: PatchableImage, game: GameData, edits: Edits): WriteSummary {
  const dataBinEntry = image.stat(DATA_BIN_PATH);
  const writeFile = (index: number, plaintext: Buffer): void => {
    image.writeInFile(
      dataBinEntry,
      game.dataBin.offsetOf(index),
      game.dataBin.encode(index, plaintext),
    );
  };

  let quests = 0;
  for (const [index, { quest, payload }] of edits.quests) {
    if (payload.equals(quest.file.payload)) continue;
    writeFile(index, quest.file.seal(payload));
    quests++;
  }

  let files = 0;
  for (const [index, data] of edits.files) {
    if (data.equals(game.dataBin.read(index))) continue;
    writeFile(index, data);
    files++;
  }

  let eboot: WriteSummary["eboot"] = "unchanged";
  const changedEboot = edits.changedEboot();
  if (changedEboot) {
    eboot = image.replaceFile(EBOOT_PATH, changedEboot).moved
      ? "moved to the end of the image"
      : "in place";
  }

  for (const [path, data] of edits.discFiles) image.writeFile(path, data);

  verify(image, game, edits);
  return { quests, files, discFiles: edits.discFiles.size, eboot };
}

/** Re-reads the output image from scratch and compares every edited file. */
function verify(image: PatchableImage, game: GameData, edits: Edits): void {
  const entry = image.stat(DATA_BIN_PATH);
  const base = entry.lba * 2048;
  const written = new DataBin(
    (offset, length) => image.source.read(base + offset, length),
    entry.size,
    game.region,
  );
  for (const [index, { quest, payload }] of edits.quests) {
    const reread = openQuestFile(written.read(index), game.region).payload;
    if (!reread.equals(payload)) throw new Error(`Read-back check failed for ${quest.path}`);
  }
  for (const [index, data] of edits.files) {
    if (!written.read(index).equals(data)) {
      throw new Error(`Read-back check failed for DATA.BIN file ${index}`);
    }
  }
  const changedEboot = edits.changedEboot();
  if (changedEboot && !image.iso.readFile(EBOOT_PATH).equals(changedEboot)) {
    throw new Error("Read-back check failed for EBOOT.BIN");
  }
  for (const [path, data] of edits.discFiles) {
    if (!image.iso.readFile(path).equals(data))
      throw new Error(`Read-back check failed for ${path}`);
  }
}

export interface RoundTripResult {
  checked: number;
  mismatches: string[];
}

/**
 * Re-encrypts files without changing them and compares with the disc's own
 * bytes: every quest (both cipher layers) and the overlays shuffles edit. A
 * clean result means edited files will be written in the format the game
 * reads. Nothing is written.
 */
export function roundTrip(
  game: GameData,
  read: (offset: number, length: number) => Buffer,
): RoundTripResult {
  const base = game.dataBinEntry.lba * 2048;
  const onDisc = (index: number): Buffer =>
    read(base + game.dataBin.offsetOf(index), game.dataBin.lengthOf(index));
  const mismatches: string[] = [];
  let checked = 0;
  for (const quest of game.quests) {
    checked++;
    const sealed = quest.file.seal(Buffer.from(quest.file.payload));
    if (!game.dataBin.encode(quest.index, sealed).equals(onDisc(quest.index))) {
      mismatches.push(quest.path);
    }
  }
  for (const { index } of [game.gameSub, game.gameTask, game.lobbyTask]) {
    checked++;
    if (!game.dataBin.encode(index, game.dataBin.read(index)).equals(onDisc(index))) {
      mismatches.push(`DATA.BIN file ${index}`);
    }
  }
  return { checked, mismatches };
}
