/**
 * `extract` subcommand — reads an `unpack`-produced directory and writes
 * the full `data/*.json`-shaped output plus an `EXTRACTION.json` provenance
 * manifest. See README's "Usage" section.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BinaryReader } from "../binary/reader.js";
import type { Region } from "../container/sfo.js";
import { emitAll, writeEmitOutput, type EmitOutput } from "../emit/index.js";
import { emitQuestsFile } from "../emit/quests.js";
import { listQuestFiles } from "../quests/discovery.js";
import { decryptQuest, isQuestMagic, QuestCipherError } from "../quests/mib.js";
import { parseQuest, type ParsedQuest } from "../quests/parser.js";
import { verifyOffsets, type OffsetVerificationResult } from "../tables/offsets.js";
import type { UnpackManifest } from "./unpack.js";

export interface ExtractOptions {
  unpacked: string;
  out: string;
}

export interface SkippedQuest {
  path: string;
  reason: string;
}

export interface ExtractionManifest {
  region: Region;
  discId: string;
  isoPath: string;
  toolVersion: string;
  extractedAt: string;
  offsetChecks: OffsetVerificationResult["checks"];
  questsParsed: number;
  questsSkipped: SkippedQuest[];
}

/**
 * Reads every real quest file straight off an unpacked directory's
 * `data-bin/mission_jpn/*.mib` tree (already DataCipher-decrypted by
 * `unpack`) and applies the second QuestCipher layer + struct parsing —
 * the same logic as `quests/discovery.ts`'s `readAllQuests`, but reading
 * files individually from disk instead of requiring the full in-memory
 * `DataBinFile[]` (extract doesn't need the other ~6000 non-quest entries).
 */
async function readQuestsFromUnpackedDir(unpackedDir: string, region: Region): Promise<{ quests: ParsedQuest[]; skipped: SkippedQuest[] }> {
  const quests: ParsedQuest[] = [];
  const skipped: SkippedQuest[] = [];

  for (const ref of listQuestFiles()) {
    const filePath = path.join(unpackedDir, "data-bin", ref.path);
    try {
      const raw = await readFile(filePath);
      const payload = decryptQuest(raw, region);
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

export async function runExtract(options: ExtractOptions): Promise<ExtractionManifest> {
  const manifestPath = path.join(options.unpacked, "manifest.json");
  const manifest: UnpackManifest = JSON.parse(await readFile(manifestPath, "utf-8"));

  if (manifest.region !== "jp") {
    throw new Error(
      `extract only supports the JP disc for now (unpacked region is "${manifest.region}") — see README's "Region support" section.`
    );
  }

  console.log("Reading EBOOT.BIN...");
  const ebootBuf = await readFile(path.join(options.unpacked, "eboot.bin"));
  const reader = new BinaryReader(ebootBuf);

  const offsetResult = verifyOffsets(reader);
  if (!offsetResult.ok) {
    const failed = offsetResult.checks.filter((c) => !c.ok).map((c) => `  - ${c.name}: ${c.detail}`);
    throw new Error(`EBOOT offset verification failed — this EBOOT doesn't look like a real JP MHP2G dump:\n${failed.join("\n")}`);
  }
  console.log(`Offset verification passed (${offsetResult.checks.length} checks).`);

  const output: EmitOutput = emitAll(reader);

  console.log("Reading and parsing quest files...");
  const { quests, skipped } = await readQuestsFromUnpackedDir(options.unpacked, manifest.region);
  console.log(`Parsed ${quests.length} quests, skipped ${skipped.length}.`);
  Object.assign(output, emitQuestsFile(quests));

  await writeEmitOutput(options.out, output);

  const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
  const pkg: { version: string } = JSON.parse(await readFile(pkgPath, "utf-8"));

  const extractionManifest: ExtractionManifest = {
    region: manifest.region,
    discId: manifest.discId,
    isoPath: manifest.isoPath,
    toolVersion: pkg.version,
    extractedAt: new Date().toISOString(),
    offsetChecks: offsetResult.checks,
    questsParsed: quests.length,
    questsSkipped: skipped,
  };
  const extractionManifestPath = path.join(options.out, "EXTRACTION.json");
  await writeFile(extractionManifestPath, `${JSON.stringify(extractionManifest, null, 2)}\n`, "utf-8");

  console.log(`Wrote ${Object.keys(output).length} data file(s) + ${extractionManifestPath}`);
  return extractionManifest;
}
