/**
 * `unpack` subcommand — reads a disc image (.iso or .cso), decrypts
 * EBOOT.BIN and every DATA.BIN entry, and writes them to `--out` as plain
 * files a later `extract` run works from. See README's "Usage" section.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { unpackDataBin } from "../container/databin.js";
import { decryptEboot } from "../container/eboot.js";
import { loadFileList } from "../container/filelist.js";
import { openDiscImage } from "../container/image.js";
import { detectRegion, parseSfo, type Region } from "../container/sfo.js";

export interface UnpackOptions {
  iso: string;
  out: string;
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
  region: Region;
  discId: string;
  isoPath: string;
  fileCount: number;
  /** False when unpacked with `--skip-eboot`: no eboot.bin was written. Absent in manifests from before the flag existed (always true then). */
  eboot?: boolean;
  unpackedAt: string;
}

/** Every DATA.BIN entry's vendored path, or a synthetic fallback for indices filelist.csv doesn't name (none, on the real JP disc — kept for robustness). */
function relativeDataBinPath(index: number, fileList: Map<number, string>): string {
  return fileList.get(index) ?? path.join("_unindexed", `${index}.bin`);
}

export async function runUnpack(options: UnpackOptions): Promise<UnpackManifest> {
  const { source, iso } = openDiscImage(options.iso);
  try {
    const sfo = parseSfo(iso.readFile("/PSP_GAME/PARAM.SFO"));
    const { region, discId } = detectRegion(sfo);
    if (!region || !discId) {
      throw new Error(
        `Unrecognized disc (PARAM.SFO DISC_ID="${discId ?? "?"}") — expected one of ULJM05500 (JP), ULUS10391 (US), ULES01213 (EU).`,
      );
    }
    console.log(`Detected region: ${region} (${discId})`);

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

    console.log("Reading + decrypting DATA.BIN (this reads the whole file into memory)...");
    const rawDataBin = iso.readFile("/PSP_GAME/USRDIR/DATA.BIN");
    const files = unpackDataBin(rawDataBin, region);
    const fileList = loadFileList();

    const dataBinDir = path.join(options.out, "data-bin");
    console.log(`Writing ${files.length} DATA.BIN entries to ${dataBinDir}...`);
    for (const file of files) {
      const outPath = path.join(dataBinDir, relativeDataBinPath(file.index, fileList));
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, file.data);
    }

    const manifest: UnpackManifest = {
      region,
      discId,
      isoPath: path.resolve(options.iso),
      fileCount: files.length,
      eboot: !options.skipEboot,
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
