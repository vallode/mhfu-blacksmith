/**
 * `extract` subcommand — reads an `unpack`-produced directory and writes
 * the full `data/*.json`-shaped output plus an `EXTRACTION.json` provenance
 * manifest. See README's "Usage" section.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BinaryReader } from "../binary/reader.js";
import type { Region } from "../container/sfo.js";
import { emitAll, writeEmitOutput, type EmitOutput } from "../emit/index.js";
import { emitQuestsFile } from "../emit/quests.js";
import { dumpMonstersRaw } from "../emit/monsters-raw.js";
import { dumpSharpnessRaw } from "../emit/sharpness-raw.js";
import { dumpWeaponsRaw } from "../emit/weapons-raw.js";
import { MHP2G_EMIT_TABLES, MHP2G_PROFILE } from "../games/mhp2g.js";
import { loadMonsterOverlays } from "../monsters/overlays.js";
import { listQuestFiles } from "../quests/discovery.js";
import { decryptQuest, isQuestMagic, QuestCipherError } from "../quests/mib.js";
import { parseQuest, type ParsedQuest } from "../quests/parser.js";
import { verifyOffsets, type OffsetVerificationResult } from "../tables/offsets.js";
import {
  verifyResolverCoverage,
  type ResolverCoverageResult,
  type TableAddressResolver,
} from "../tables/resolver.js";
import { assertCurrentFileNames, type UnpackManifest } from "./unpack.js";

export interface ExtractOptions {
  unpacked: string;
  out: string;
  /** Also write numbers-only table dumps to `<out>/raw/` (see emit/sharpness-raw.ts, emit/weapons-raw.ts, emit/monsters-raw.ts). */
  raw?: boolean;
  /** Committed `data/` directory, for the monster probe in the raw dump. Defaults to the repo's. */
  data?: string;
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
async function readQuestsFromUnpackedDir(
  unpackedDir: string,
  region: Region,
): Promise<{ quests: ParsedQuest[]; skipped: SkippedQuest[] }> {
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

/** Written before emitting, so the dump survives an emit error. */
async function writeRawDumps(
  outDir: string,
  unpackedDir: string,
  dataDir: string,
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): Promise<void> {
  const rawDir = path.join(outDir, "raw");
  await mkdir(rawDir, { recursive: true });
  const dumps = {
    "sharpness.json": dumpSharpnessRaw(reader, resolver),
    "weapons.json": dumpWeaponsRaw(reader, resolver),
  };
  for (const [file, dump] of Object.entries(dumps)) {
    const rawPath = path.join(rawDir, file);
    await writeFile(rawPath, `${JSON.stringify(dump)}\n`, "utf-8");
    console.log(`Wrote ${rawPath}`);
  }
  // The monster tables are still being mapped (#35): record a failure in
  // the dump instead of stopping extract.
  let monsters: unknown;
  try {
    monsters = dumpMonstersRaw(await loadMonsterOverlays(unpackedDir), dataDir);
  } catch (error) {
    monsters = { error: error instanceof Error ? (error.stack ?? error.message) : String(error) };
  }
  const monstersPath = path.join(rawDir, "monsters.json");
  await writeFile(monstersPath, `${JSON.stringify(monsters)}\n`, "utf-8");
  console.log(`Wrote ${monstersPath}`);
}

export async function runExtract(options: ExtractOptions): Promise<ExtractionManifest> {
  const manifestPath = path.join(options.unpacked, "manifest.json");
  const manifest: UnpackManifest = JSON.parse(await readFile(manifestPath, "utf-8"));
  assertCurrentFileNames(manifest, options.unpacked);
  if (manifest.eboot === false) {
    throw new Error(
      `${options.unpacked} was unpacked with --skip-eboot, so it has no eboot.bin; rerun unpack with pspdecrypt on PATH or --eboot <path>.`,
    );
  }

  const dataDir =
    options.data ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "data");

  console.log("Reading EBOOT.BIN...");
  const ebootBuf = await readFile(path.join(options.unpacked, "eboot.bin"));
  const reader = new BinaryReader(ebootBuf);

  // JP keeps its original, unchanged fast path: static addresses +
  // JP-specific structural self-checks (verifyOffsets(), offsets.ts).
  // Every other region MHP2G_PROFILE knows about goes through its
  // TableAddressResolver instead — see README's "Region support" section
  // for exactly which tables that covers per region. A region the profile
  // has no resolver for at all (e.g. "us" — no disc to derive one from)
  // fails fast here rather than emitting partial/garbage equipment data.
  let offsetResult: OffsetVerificationResult | ResolverCoverageResult;
  let output: EmitOutput;
  if (manifest.region === "jp") {
    offsetResult = verifyOffsets(reader);
    if (!offsetResult.ok) {
      const failed = offsetResult.checks
        .filter((c) => !c.ok)
        .map((c) => `  - ${c.name}: ${c.detail}`);
      throw new Error(
        `EBOOT offset verification failed — this EBOOT doesn't look like a real JP MHP2G dump:\n${failed.join("\n")}`,
      );
    }
    console.log(`Offset verification passed (${offsetResult.checks.length} checks).`);
    if (options.raw) await writeRawDumps(options.out, options.unpacked, dataDir, reader);
    output = emitAll(reader);
  } else {
    const resolver = MHP2G_PROFILE.resolverForRegion(manifest.region);
    if (!resolver) {
      throw new Error(
        `extract has no table address resolver for region "${manifest.region}" yet — see README's "Region support" section.`,
      );
    }
    offsetResult = verifyResolverCoverage(resolver, MHP2G_EMIT_TABLES, ebootBuf);
    if (!offsetResult.ok) {
      const failed = offsetResult.checks
        .filter((c) => !c.ok)
        .map((c) => `  - ${c.name}: ${c.detail}`);
      throw new Error(
        `Table resolution failed for region "${manifest.region}" — this EBOOT doesn't look like a real "${manifest.region}" MHP2G/MHFU dump, or that region's resolver coverage has a gap:\n${failed.join("\n")}`,
      );
    }
    console.log(
      `Table resolution passed (${offsetResult.checks.length} checks) for region "${manifest.region}".`,
    );
    if (options.raw) await writeRawDumps(options.out, options.unpacked, dataDir, reader, resolver);
    output = emitAll(reader, resolver);
  }

  console.log("Reading and parsing quest files...");
  const { quests, skipped } = await readQuestsFromUnpackedDir(options.unpacked, manifest.region);
  console.log(`Parsed ${quests.length} quests, skipped ${skipped.length}.`);
  Object.assign(output, emitQuestsFile(quests));

  await writeEmitOutput(options.out, output);

  const pkgPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "package.json",
  );
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
  await writeFile(
    extractionManifestPath,
    `${JSON.stringify(extractionManifest, null, 2)}\n`,
    "utf-8",
  );

  console.log(`Wrote ${Object.keys(output).length} data file(s) + ${extractionManifestPath}`);
  return extractionManifest;
}
