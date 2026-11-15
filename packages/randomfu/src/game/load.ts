/**
 * Reads what the randomizer needs from a disc image: the region, every
 * quest, `game_sub.ovl` (monster rewards), the decrypted EBOOT (crafting
 * recipes) and, on EU, the game's monster names.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { decryptEboot } from "mhfu-extract/src/container/eboot.js";
import { loadFileList } from "mhfu-extract/src/container/filelist.js";
import type { Iso9660Reader, DirEntry } from "mhfu-extract/src/container/iso9660.js";
import { parseOvl, type OvlFile } from "mhfu-extract/src/container/ovl.js";
import { detectRegion, parseSfo, type Region } from "mhfu-extract/src/container/sfo.js";
import type { RandomAccessSource } from "mhfu-extract/src/container/source.js";
import { MHP2G_PROFILE } from "mhfu-extract/src/games/mhp2g.js";
import { listQuestFiles } from "mhfu-extract/src/quests/discovery.js";
import { parseQuest, type ParsedQuest } from "mhfu-extract/src/quests/parser.js";
import { readMessageFile } from "mhfu-extract/src/strings/messages.js";
import {
  discMonsterNames,
  MONSTER_NAME_FILE,
  MonsterNameError,
} from "mhfu-extract/src/strings/monster-names.js";
import { PinnedResolver, type TableAddressResolver } from "mhfu-extract/src/tables/resolver.js";
import { DataBin } from "../disc/databin.js";
import { openQuestFile, type QuestFile } from "../disc/quest-file.js";
import { BOARD_PATHS, readBoardRecords, type BoardFile } from "./board.js";

export const DATA_BIN_PATH = "/PSP_GAME/USRDIR/DATA.BIN";
export const EBOOT_PATH = "/PSP_GAME/SYSDIR/EBOOT.BIN";
const GAME_SUB_PATH = "overlay/game_sub.ovl";
const GAME_TASK_PATH = "overlay/game_task.ovl";
const LOBBY_TASK_PATH = "overlay/lobby_task.ovl";

export interface LoadedQuest {
  /** DATA.BIN file index. */
  index: number;
  /** Vendored file name, e.g. `mission_jpn/m01001.mib`. */
  path: string;
  file: QuestFile;
  parsed: ParsedQuest;
}

export interface LoadedOverlay {
  index: number;
  ovl: OvlFile;
}

export interface GameData {
  region: Region;
  discId: string;
  dataBinEntry: DirEntry;
  dataBin: DataBin;
  quests: LoadedQuest[];
  skippedQuests: { path: string; reason: string }[];
  gameSub: LoadedOverlay;
  gameTask: LoadedOverlay;
  /** Town code and data, including the shops' item lists. */
  lobbyTask: LoadedOverlay;
  /** The quest board files (`level*.mib`) that are on the disc and read as boards. */
  boards: BoardFile[];
  /** The decrypted EBOOT. */
  eboot: Buffer;
  /** How EBOOT tables are found: undefined means JP's static addresses. */
  resolver: TableAddressResolver | undefined;
  /**
   * The game's English monster names by emID, as the site has them
   * (mhfu-extract `strings/monster-names.ts`); null or absent where they
   * can't be read (JP), which names monsters from `monster.enum`.
   */
  monsterNames?: (string | null)[] | null;
  /** Why an EU disc's monster names couldn't be read, for the log. */
  monsterNamesProblem?: string;
}

function indexOf(region: Region, path: string): number {
  for (const [index, name] of loadFileList(region)) if (name === path) return index;
  throw new Error(`No DATA.BIN entry named ${path} for region ${region}`);
}

function readBoards(region: Region, dataBin: DataBin): BoardFile[] {
  const boards: BoardFile[] = [];
  const names = new Map([...loadFileList(region)].map(([index, name]) => [name, index]));
  for (const path of BOARD_PATHS) {
    const index = names.get(path);
    if (index === undefined || index >= dataBin.fileCount) continue;
    const data = dataBin.read(index);
    const records = readBoardRecords(data);
    if (records) boards.push({ index, path, data, records });
  }
  return boards;
}

/**
 * The EU disc's monster names (mhfu-extract `discMonsterNames`), or why
 * they can't be read: the names only label hints and the spoiler log, so
 * they shouldn't stop a run.
 */
export function readDiscMonsterNames(
  dataBin: Pick<DataBin, "fileCount" | "read">,
  eboot: Buffer,
): { names: (string | null)[] | null; problem?: string } {
  const unread = (why: string) => ({
    names: null,
    problem: `${why}; monsters are named from monster.enum.`,
  });
  if (MONSTER_NAME_FILE >= dataBin.fileCount)
    return unread(`DATA.BIN has no file ${MONSTER_NAME_FILE}`);
  try {
    const names = discMonsterNames(
      new BinaryReader(eboot),
      readMessageFile(dataBin.read(MONSTER_NAME_FILE)),
    );
    return names ? { names } : unread(`DATA.BIN file ${MONSTER_NAME_FILE} has no monster names`);
  } catch (error) {
    if (error instanceof MonsterNameError) return unread(error.message);
    throw error;
  }
}

export interface DiscCheck {
  discId: string | null;
  region: Region | null;
  /** MHP2G (JP) or MHFU (EU): the discs randomfu knows. */
  supported: boolean;
}

/** Which game a disc is, from its PARAM.SFO, and whether randomfu supports it. */
export function checkDisc(iso: Iso9660Reader): DiscCheck {
  const { region, discId } = detectRegion(parseSfo(iso.readFile("/PSP_GAME/PARAM.SFO")));
  return { region, discId, supported: region === "jp" || region === "eu" };
}

export async function loadGame(source: RandomAccessSource, iso: Iso9660Reader): Promise<GameData> {
  const { region, discId, supported } = checkDisc(iso);
  if (!supported || !region || !discId) {
    throw new Error(
      `Unsupported disc (DISC_ID "${discId ?? "?"}"): expected MHP2G (JP) or MHFU (EU)`,
    );
  }

  const dataBinEntry = iso.stat(DATA_BIN_PATH);
  const base = dataBinEntry.lba * 2048;
  const dataBin = new DataBin(
    (offset, length) => source.read(base + offset, length),
    dataBinEntry.size,
    region,
  );

  const quests: LoadedQuest[] = [];
  const skippedQuests: { path: string; reason: string }[] = [];
  for (const ref of listQuestFiles(region)) {
    try {
      const file = openQuestFile(dataBin.read(ref.index), region);
      quests.push({ index: ref.index, path: ref.path, file, parsed: parseQuest(file.payload) });
    } catch (error) {
      skippedQuests.push({ path: ref.path, reason: String(error) });
    }
  }

  const overlay = (path: string): LoadedOverlay => {
    const index = indexOf(region, path);
    return { index, ovl: parseOvl(dataBin.read(index)) };
  };

  const eboot = await decryptEboot(iso.readFile(EBOOT_PATH));
  let resolver: TableAddressResolver | undefined;
  if (region !== "jp") {
    const found = MHP2G_PROFILE.resolverForRegion(region);
    if (!found) throw new Error(`No EBOOT table addresses for region ${region} yet`);
    // Signatures are found in the unedited EBOOT: shuffles that run first
    // (weapons, armor) change the tables later ones (recipes) look up.
    resolver = new PinnedResolver(found, Buffer.from(eboot));
  }

  const monsterNames = region === "eu" ? readDiscMonsterNames(dataBin, eboot) : null;
  return {
    region,
    discId,
    dataBinEntry,
    dataBin,
    quests,
    skippedQuests,
    gameSub: overlay(GAME_SUB_PATH),
    gameTask: overlay(GAME_TASK_PATH),
    lobbyTask: overlay(LOBBY_TASK_PATH),
    boards: readBoards(region, dataBin),
    eboot,
    resolver,
    monsterNames: monsterNames?.names ?? null,
    ...(monsterNames?.problem && { monsterNamesProblem: monsterNames.problem }),
  };
}
