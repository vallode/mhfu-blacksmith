/**
 * Reads what the randomizer needs from a disc image: the region, every
 * quest, `game_sub.ovl` (monster rewards) and, when asked for, the decrypted
 * EBOOT (crafting recipes).
 */
import { decryptEboot } from "mhfu-extract/src/container/eboot.js";
import { loadFileList } from "mhfu-extract/src/container/filelist.js";
import type { Iso9660Reader, DirEntry } from "mhfu-extract/src/container/iso9660.js";
import { parseOvl, type OvlFile } from "mhfu-extract/src/container/ovl.js";
import { detectRegion, parseSfo, type Region } from "mhfu-extract/src/container/sfo.js";
import type { RandomAccessSource } from "mhfu-extract/src/container/source.js";
import { MHP2G_PROFILE } from "mhfu-extract/src/games/mhp2g.js";
import { listQuestFiles } from "mhfu-extract/src/quests/discovery.js";
import { parseQuest, type ParsedQuest } from "mhfu-extract/src/quests/parser.js";
import { PinnedResolver, type TableAddressResolver } from "mhfu-extract/src/tables/resolver.js";
import { DataBin } from "../disc/databin.js";
import { openQuestFile, type QuestFile } from "../disc/quest-file.js";

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

export interface EbootOptions {
  /** A decrypted EBOOT dump's bytes (the browser app's upload). */
  dump?: Buffer;
  /** A decrypted EBOOT dump to use instead of decrypting the disc's. */
  overridePath?: string;
  pspdecryptBin?: string;
  /** False to only decrypt in-process, never with pspdecrypt (the browser). */
  external?: boolean;
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
  /** The decrypted EBOOT, when loaded. */
  eboot: Buffer | null;
  /** How EBOOT tables are found: undefined means JP's static addresses. */
  resolver: TableAddressResolver | undefined;
}

/** A decrypted EBOOT is a plain ELF; anything else is the wrong file. */
function checkedDump(dump: Buffer): Buffer {
  if (!dump.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    throw new Error(
      "That EBOOT isn't decrypted (no ELF header). Use PPSSPP's dump: Settings, Tools, Developer tools, “Dump Decrypted Eboot.bin on game boot”.",
    );
  }
  return dump;
}

function indexOf(region: Region, path: string): number {
  for (const [index, name] of loadFileList(region)) if (name === path) return index;
  throw new Error(`No DATA.BIN entry named ${path} for region ${region}`);
}

export async function loadGame(
  source: RandomAccessSource,
  iso: Iso9660Reader,
  options: { eboot: EbootOptions | null },
): Promise<GameData> {
  const { region, discId } = detectRegion(parseSfo(iso.readFile("/PSP_GAME/PARAM.SFO")));
  if (!region || !discId) {
    throw new Error(`Unrecognized disc (DISC_ID "${discId ?? "?"}"): expected an MHP2G/MHFU disc`);
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

  let eboot: Buffer | null = null;
  let resolver: TableAddressResolver | undefined;
  if (options.eboot) {
    eboot = options.eboot.dump
      ? checkedDump(options.eboot.dump)
      : await decryptEboot(iso.readFile(EBOOT_PATH), options.eboot);
    if (region !== "jp") {
      const found = MHP2G_PROFILE.resolverForRegion(region);
      if (!found) throw new Error(`No EBOOT table addresses for region ${region} yet`);
      // Signatures are found in the unedited EBOOT: shuffles that run first
      // (weapons, armor) change the tables later ones (recipes) look up.
      resolver = new PinnedResolver(found, Buffer.from(eboot));
    }
  }

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
    eboot,
    resolver,
  };
}
