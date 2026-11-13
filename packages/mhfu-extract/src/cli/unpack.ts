/**
 * `unpack` subcommand — reads a disc image (.iso or .cso), decrypts
 * EBOOT.BIN and every DATA.BIN entry, and writes them to `--out` as plain
 * files a later `extract` run works from. See README's "Usage" section.
 *
 * MHF1 and MHF2 discs unpack too (README's "Other games"): their EBOOT the
 * same way, DATA.BIN through its plain TOC, and every other `USRDIR` file
 * copied as it is, for working out where their tables are. Nothing past
 * `unpack` reads them yet; `assertMhfuUnpack` turns them away.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readDataBin, type UnpackedDataBin } from "../container/databin.js";
import { decryptEboot } from "../container/eboot.js";
import { loadFileList } from "../container/filelist.js";
import { openDiscImage } from "../container/image.js";
import type { Iso9660Reader } from "../container/iso9660.js";
import {
  detectDisc,
  GAME_NAMES,
  KNOWN_DISCS,
  parseSfo,
  type Game,
  type Region,
} from "../container/sfo.js";

/** Bumped when unpack's file naming changes; see UnpackManifest.fileList. */
export const FILE_LIST_VERSION = 2;

/**
 * Throw if `manifest` comes from an unpack whose file names are stale: an EU
 * (or US) disc unpacked before region-aware naming. Anything reading files by
 * path (export-site, extract's quests) would silently read the wrong files.
 */
export function assertCurrentFileNames(manifest: UnpackManifest, dir: string): void {
  if (manifest.region !== "jp" && (manifest.fileList ?? 1) < FILE_LIST_VERSION) {
    throw new Error(
      `${dir} was unpacked before DATA.BIN files were named per region, so its ${manifest.region.toUpperCase()} file names are wrong ` +
        `(e.g. weapon/we020.pac holds the real we000). Delete it and run unpack again.`,
    );
  }
}

/** The game an unpack is of; manifests from before MHF1/MHF2 support have no `game` and are MHFU. */
export function manifestGame(manifest: UnpackManifest): Game {
  return manifest.game ?? "mhp2g";
}

/**
 * Throw unless `manifest` is an MHFU unpack with current file names: every
 * command past `unpack` reads MHP2G's tables, file names and quest format,
 * and would misread an MHF1 or MHF2 disc rather than fail.
 */
export function assertMhfuUnpack(manifest: UnpackManifest, dir: string): void {
  const game = manifestGame(manifest);
  if (game !== "mhp2g") {
    throw new Error(
      `${dir} is ${GAME_NAMES[game]} (${manifest.discId}). This command reads MHFU's tables and ` +
        `file names; for MHF2, \`extract\` reads its equipment tables. See README's "Other games".`,
    );
  }
  assertCurrentFileNames(manifest, dir);
}

const DISC_ID_LIST = Object.entries(KNOWN_DISCS)
  .map(([id, { game, region }]) => `${id} (${game} ${region})`)
  .join(", ");

export interface UnpackOptions {
  iso: string;
  out: string;
  /**
   * Treat the disc as this game and region whatever its DISC_ID says, for a
   * reissue or a patched disc with an ID `KNOWN_DISCS` doesn't list. Both or
   * neither.
   */
  game?: Game;
  region?: Region;
  /** Pre-decrypted EBOOT dump, bypassing KIRK decryption entirely (see decryptEboot). */
  eboot?: string;
  /**
   * Don't decrypt or write EBOOT.BIN at all — only DATA.BIN. For work that
   * only needs DATA.BIN's files (models, textures, quests) on a machine
   * without pspdecrypt. `extract` needs eboot.bin, so it won't run on the result.
   */
  skipEboot?: boolean;
  pspdecryptBin?: string;
}

export interface UnpackManifest {
  /** Absent in manifests from before MHF1/MHF2 support, which are all MHFU; read it with `manifestGame`. */
  game?: Game;
  region: Region;
  discId: string;
  isoPath: string;
  fileCount: number;
  /** False when DATA.BIN was stored without its cipher (FUComplete). Absent in older manifests. */
  dataBinEncrypted?: boolean;
  /** PARAM.SFO's TITLE; tells a patched disc (FUComplete) from the retail one with the same disc ID. Absent in older manifests. */
  title?: string;
  /**
   * How DATA.BIN entries were named: 2 = region-aware (EU via
   * filelist-eu.json). Absent in older unpacks, whose EU file names are off by
   * up to 55 entries (e.g. their weapon/we020.pac is the real we000);
   * assertCurrentFileNames() rejects those.
   */
  fileList?: number;
  /** False when unpacked with `--skip-eboot`: no eboot.bin was written. Absent in manifests from before the flag existed (always true then). */
  eboot?: boolean;
  /**
   * MHF1/MHF2 only: false when the disc has no DATA.BIN, or one without a
   * plain TOC, which is then copied whole into `usrdir/` instead.
   */
  dataBinUnpacked?: boolean;
  /** MHF1/MHF2 only: how many files were copied as they are from `PSP_GAME/USRDIR` into `usrdir/`. */
  usrdirFiles?: number;
  unpackedAt: string;
}

/** Every DATA.BIN entry's vendored path, or a synthetic fallback for indices filelist.csv doesn't name (none, on the real JP disc — kept for robustness). */
function relativeDataBinPath(index: number, fileList: Map<number, string>): string {
  return fileList.get(index) ?? path.join("_unindexed", `${index}.bin`);
}

const USRDIR = "/PSP_GAME/USRDIR";

/** Every file under `dir` in the image, as paths relative to it. */
function listFiles(iso: Iso9660Reader, dir: string): string[] {
  const files: string[] = [];
  for (const entry of iso.list(dir)) {
    const child = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      for (const sub of listFiles(iso, child)) files.push(`${entry.name}/${sub}`);
    } else {
      files.push(entry.name);
    }
  }
  return files.sort();
}

/** Which game and region to unpack as: the overrides if given, else the disc's own ID. */
export function resolveDisc(
  detected: { game: Game | null; region: Region | null; discId: string | null },
  override: { game?: Game; region?: Region },
): { game: Game; region: Region; discId: string } {
  const discId = detected.discId ?? "?";
  if ((override.game === undefined) !== (override.region === undefined)) {
    throw new Error("--game and --region go together: pass both or neither.");
  }
  if (override.game && override.region) {
    return { game: override.game, region: override.region, discId };
  }
  if (!detected.game || !detected.region) {
    throw new Error(
      `Unrecognized disc (PARAM.SFO DISC_ID="${discId}") — expected one of ${DISC_ID_LIST}. ` +
        "For a reissue or patched disc, pass --game (mhp, mhp2, mhp2g) and --region (jp, us, eu).",
    );
  }
  return { game: detected.game, region: detected.region, discId };
}

export async function runUnpack(options: UnpackOptions): Promise<UnpackManifest> {
  const { source, iso } = openDiscImage(options.iso);
  try {
    const sfo = parseSfo(iso.readFile("/PSP_GAME/PARAM.SFO"));
    const { game, region, discId } = resolveDisc(detectDisc(sfo), options);
    const title = sfo.get("TITLE");
    console.log(
      `Detected ${GAME_NAMES[game]}, region ${region} (${discId}${typeof title === "string" ? `, "${title}"` : ""})`,
    );

    if (options.skipEboot && options.eboot) {
      throw new Error("--skip-eboot and --eboot are mutually exclusive.");
    }
    await mkdir(options.out, { recursive: true });
    if (options.skipEboot) {
      console.log("Skipping EBOOT.BIN (--skip-eboot); `extract` will not run on this output.");
    } else {
      console.log("Decrypting EBOOT.BIN...");
      const rawEboot = iso.readFile("/PSP_GAME/SYSDIR/EBOOT.BIN");
      const eboot = await decryptEboot(rawEboot, {
        overridePath: options.eboot,
        pspdecryptBin: options.pspdecryptBin,
      });
      await writeFile(path.join(options.out, "eboot.bin"), eboot);
      console.log(`Wrote ${path.join(options.out, "eboot.bin")} (${eboot.length} bytes)`);
    }

    const dataBinDir = path.join(options.out, "data-bin");
    let dataBin: UnpackedDataBin | null = null;
    let usrdirFiles: number | undefined;
    if (game === "mhp2g") {
      console.log("Reading + decrypting DATA.BIN (this reads the whole file into memory)...");
      dataBin = readDataBin(iso.readFile(`${USRDIR}/DATA.BIN`), region, game);
      if (!dataBin.encrypted)
        console.log("DATA.BIN is stored without encryption (a patched disc).");
    } else {
      // Older games: DATA.BIN if it has a plain TOC, and every other USRDIR
      // file as it is, since nothing yet says which of them hold what.
      const usrdir = listFiles(iso, USRDIR);
      const dataBinName = usrdir.find((f) => f.toUpperCase() === "DATA.BIN");
      if (dataBinName) {
        console.log("Reading DATA.BIN (this reads the whole file into memory)...");
        try {
          dataBin = readDataBin(iso.readFile(`${USRDIR}/${dataBinName}`), region, game);
        } catch (error) {
          console.warn(
            `Not unpacking DATA.BIN, copying it as it is: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      } else {
        console.warn("This disc has no PSP_GAME/USRDIR/DATA.BIN.");
      }
      const toCopy = usrdir.filter((f) => !(dataBin && f === dataBinName));
      console.log(
        `Copying ${toCopy.length} PSP_GAME/USRDIR files to ${path.join(options.out, "usrdir")}...`,
      );
      for (const rel of toCopy) {
        const outPath = path.join(options.out, "usrdir", ...rel.split("/"));
        await mkdir(path.dirname(outPath), { recursive: true });
        await writeFile(outPath, iso.readFile(`${USRDIR}/${rel}`));
      }
      usrdirFiles = toCopy.length;
    }

    if (dataBin) {
      // Only MHFU's DATA.BIN entries have names (vendor/fuctool/filelist.csv).
      const fileList = game === "mhp2g" ? loadFileList(region) : new Map<number, string>();
      console.log(`Writing ${dataBin.files.length} DATA.BIN entries to ${dataBinDir}...`);
      for (const file of dataBin.files) {
        const outPath = path.join(dataBinDir, relativeDataBinPath(file.index, fileList));
        await mkdir(path.dirname(outPath), { recursive: true });
        await writeFile(outPath, file.data);
      }
    }

    const manifest: UnpackManifest = {
      game,
      region,
      discId,
      isoPath: path.resolve(options.iso),
      fileCount: dataBin?.files.length ?? 0,
      dataBinEncrypted: dataBin?.encrypted ?? false,
      ...(typeof title === "string" ? { title } : {}),
      eboot: !options.skipEboot,
      fileList: FILE_LIST_VERSION,
      ...(game === "mhp2g" ? {} : { dataBinUnpacked: dataBin !== null, usrdirFiles }),
      unpackedAt: new Date().toISOString(),
    };
    const manifestPath = path.join(options.out, "manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
    console.log(`Wrote ${manifestPath}`);
    return manifest;
  } finally {
    source.close();
  }
}
