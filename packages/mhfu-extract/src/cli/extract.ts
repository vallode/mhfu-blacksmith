/**
 * `extract` subcommand — reads an `unpack`-produced directory and writes
 * the full `data/*.json`-shaped output plus an `EXTRACTION.json` provenance
 * manifest. See README's "Usage" section.
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BinaryReader } from "../binary/reader.js";
import type { Region } from "../container/sfo.js";
import { emitAll, writeEmitOutput, type EmitOutput } from "../emit/index.js";
import { emitCombinations } from "../emit/combinations.js";
import { emitMonsters } from "../emit/monsters.js";
import { emitGathering, type GatheringQuestInput } from "../emit/gathering.js";
import { loadMapLayouts } from "../tables/map-layout.js";
import { emitQuestsFile, type MultiplierLookup } from "../emit/quests.js";
import { emitShops } from "../emit/shops.js";
import { emitVeggieTrades } from "../emit/veggie-trades.js";
import { emitFarm } from "../emit/farm.js";
import { dumpQuestRaw, type QuestRawEntry } from "../emit/quests-raw.js";
import { dumpGunnerRaw } from "../emit/gunner-raw.js";
import { dumpSharpnessRaw } from "../emit/sharpness-raw.js";
import { dumpWeaponsRaw } from "../emit/weapons-raw.js";
import { dumpArmorRaw } from "../emit/armor-raw.js";
import { writeCollisionRaw } from "./collision-raw.js";
import { writeBreakCodeRaw } from "./break-code-raw.js";
import {
  committedMelodyCombos,
  dumpMelodyRaw,
  hornNotesFromCommitted,
} from "../emit/melody-raw.js";
import { MHP2G_EMIT_TABLES, MHP2G_PROFILE } from "../games/mhp2g.js";
import { parseOvl } from "../container/ovl.js";
import { loadMonsterOverlays, OVERLAY_DIR } from "../monsters/overlays.js";
import { multiplierRow } from "../monsters/multipliers.js";
import { readMonsterTables } from "../monsters/read.js";
import { readSizeTables, type SizeTables } from "../monsters/sizes.js";
import {
  BESTIARY_MESSAGE_TABLE,
  BestiaryError,
  readBestiary,
  type BestiaryEntry,
} from "../monsters/bestiary.js";
import { loadFileList } from "../container/filelist.js";
import { readMessageFile, type MessageTable } from "../strings/messages.js";
import {
  AWARD_TEXT_FILES,
  AwardTextError,
  readAwardText,
  type AwardLanguage,
  type AwardText,
} from "../strings/awards.js";
import {
  discMonsterNames,
  MONSTER_NAME_FILE,
  MONSTER_NAME_OVERLAY,
  MONSTER_NAME_TABLE,
} from "../strings/monster-names.js";
import { useMonsterNames } from "../strings/names.js";
import { listQuestFiles } from "../quests/discovery.js";
import { decryptQuest, isQuestMagic, QuestCipherError } from "../quests/mib.js";
import { parseQuest, type ParsedQuest } from "../quests/parser.js";
import { readDlcQuests } from "../quests/dlc.js";
import { findShops } from "../shops/shops.js";
import {
  JP_BASE_ADDRESS,
  verifyOffsets,
  type OffsetVerificationResult,
} from "../tables/offsets.js";
import { readCombinations } from "../tables/combinations.js";
import { readVeggieTrades } from "../tables/veggie-trades.js";
import { readFarmTables } from "../tables/farm.js";
import {
  verifyResolverCoverage,
  type ResolverCoverageResult,
  type TableAddressResolver,
} from "../tables/resolver.js";
import { assertCurrentFileNames, type UnpackManifest } from "./unpack.js";

export interface ExtractOptions {
  unpacked: string;
  out: string;
  /** Also write numbers-only table dumps to `<out>/raw/` (see emit/sharpness-raw.ts, emit/weapons-raw.ts, emit/gunner-raw.ts, emit/armor-raw.ts, emit/quests-raw.ts), `raw/monsters.json` (the decoded monster tables) and the hitbox candidates in `raw/collision.json`, `raw/emmodel.json` and `raw/emmodel/` (emit/collision-raw.ts), and the break reward code references in `raw/break-code.json` with the overlays in `raw/overlays/` (emit/break-code-raw.ts). */
  raw?: boolean;
  /**
   * The downloadable quests (src/quests/dlc.ts): a CWCheat file or a
   * directory of `.mib` files. Without it, no Event or Challenge Quests are
   * emitted, and `build-data` leaves theirs in `data/` as they are.
   */
  dlc?: string;
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
 *
 * The paths come from the region's own file list, the same names `unpack`
 * wrote (an EU unpack made before region-aware naming is rejected by
 * `assertCurrentFileNames` first: its `mission_jpn/` names were off by 32).
 */
export async function readQuestsFromUnpackedDir(
  unpackedDir: string,
  region: Region,
): Promise<{
  quests: ParsedQuest[];
  skipped: SkippedQuest[];
  raw: QuestRawEntry[];
  payloads: GatheringQuestInput[];
}> {
  const quests: ParsedQuest[] = [];
  const payloads: GatheringQuestInput[] = [];
  const skipped: SkippedQuest[] = [];
  const raw: QuestRawEntry[] = [];

  for (const ref of listQuestFiles(region)) {
    const filePath = path.join(unpackedDir, "data-bin", ref.path);
    try {
      const file = await readFile(filePath);
      const payload = decryptQuest(file, region);
      if (!isQuestMagic(payload)) {
        skipped.push({ path: ref.path, reason: "decrypted payload is missing the quest magic" });
        continue;
      }
      const parsed = parseQuest(payload);
      quests.push(parsed);
      payloads.push({ parsed, payload });
      raw.push(dumpQuestRaw(ref.path, payload, parsed, file.length));
    } catch (error) {
      const reason = error instanceof QuestCipherError ? error.message : String(error);
      skipped.push({ path: ref.path, reason });
    }
  }
  return { quests, skipped, raw, payloads };
}

/** Written before emitting, so the dump survives an emit error. */
async function writeRawDumps(
  outDir: string,
  reader: BinaryReader,
  resolver?: TableAddressResolver,
): Promise<void> {
  const rawDir = path.join(outDir, "raw");
  await mkdir(rawDir, { recursive: true });
  const dumps = {
    "sharpness.json": dumpSharpnessRaw(reader, resolver),
    "weapons.json": dumpWeaponsRaw(reader, resolver),
    "gunner.json": dumpGunnerRaw(reader, resolver),
    "armor.json": dumpArmorRaw(reader, resolver),
  };
  for (const [file, dump] of Object.entries(dumps)) {
    const rawPath = path.join(rawDir, file);
    await writeFile(rawPath, `${JSON.stringify(dump)}\n`, "utf-8");
    console.log(`Wrote ${rawPath}`);
  }
}

/**
 * A message file (`strings/messages.ts`) by DATA.BIN index, with its path
 * inside `data-bin`; `tables` is null if the unpack doesn't have the file.
 */
export async function loadMessageFile(
  unpacked: string,
  region: Region,
  index: number,
): Promise<{ rel: string; tables: MessageTable[] | null }> {
  const rel = loadFileList(region).get(index) ?? path.join("_unindexed", `${index}.bin`);
  const file = path.join(unpacked, "data-bin", rel);
  const found = await access(file).then(
    () => true,
    () => false,
  );
  return { rel, tables: found ? readMessageFile(await readFile(file)) : null };
}

/** The EU disc's English message file 19, which names the monsters and describes them. */
async function loadEnglishMessages(
  unpacked: string,
  region: Region,
): Promise<{ rel: string; tables: MessageTable[] | null }> {
  return loadMessageFile(unpacked, region, MONSTER_NAME_FILE);
}

/**
 * The awards' text in one EU language (`strings/awards.ts`), or null with a
 * warning if its files aren't there or don't hold it.
 */
export async function loadAwardText(
  unpacked: string,
  region: Region,
  language: AwardLanguage,
): Promise<AwardText[] | null> {
  const files = AWARD_TEXT_FILES[language];
  const names = await loadMessageFile(unpacked, region, files.names);
  const descriptions = await loadMessageFile(unpacked, region, files.descriptions);
  try {
    return readAwardText(names.tables, descriptions.tables, language);
  } catch (error) {
    if (!(error instanceof AwardTextError)) throw error;
    console.warn(
      `Warning: no ${language} award text in ${names.rel} and ${descriptions.rel}. ${error.message}`,
    );
    return null;
  }
}

/**
 * Monster names from the disc (`strings/monster-names.ts`), or null with a
 * warning if the message file or its name table isn't there. A disc whose
 * EBOOT table doesn't read, or an overlay entry that no longer fits it,
 * stops the extract.
 */
function loadMonsterNames(
  messages: { rel: string; tables: MessageTable[] | null },
  eboot: BinaryReader,
): (string | null)[] | null {
  const names = discMonsterNames(eboot, messages.tables);
  if (!names)
    console.warn(
      `Warning: ${messages.rel} is missing or has no table ${MONSTER_NAME_TABLE}; no monster names.`,
    );
  return names;
}

/** The monster list and its descriptions (`monsters/bestiary.ts`), or null with a warning. */
function loadBestiary(
  messages: { rel: string; tables: MessageTable[] | null },
  eboot: BinaryReader,
): BestiaryEntry[] | null {
  const table = messages.tables?.[BESTIARY_MESSAGE_TABLE];
  try {
    if (!table) throw new BestiaryError(`${messages.rel} has no table ${BESTIARY_MESSAGE_TABLE}`);
    const entries = readBestiary(eboot, JP_BASE_ADDRESS, table);
    console.log(`Monster list: ${entries.length} descriptions.`);
    return entries;
  } catch (error) {
    if (!(error instanceof BestiaryError)) throw error;
    console.warn(`Warning: no monster descriptions. ${error.message}`);
    return null;
  }
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

  console.log("Reading EBOOT.BIN...");
  const ebootBuf = await readFile(path.join(options.unpacked, "eboot.bin"));
  const reader = new BinaryReader(ebootBuf);

  // Only the EU disc's English text is known: its monster names and
  // descriptions. Names go in before anything is emitted, so every file
  // names monsters alike; elsewhere they come from monster.enum.
  const messages =
    manifest.region === "eu" ? await loadEnglishMessages(options.unpacked, manifest.region) : null;
  const monsterNames = messages ? loadMonsterNames(messages, reader) : null;
  useMonsterNames(monsterNames);
  if (monsterNames)
    console.log(
      `Monster names: ${monsterNames.filter((n) => n !== null).length - MONSTER_NAME_OVERLAY.length} from the disc, ${MONSTER_NAME_OVERLAY.length} from overlay/monster-names.json.`,
    );
  else console.warn(`Warning: region "${manifest.region}" names monsters from monster.enum.`);

  // JP keeps its original, unchanged fast path: static addresses +
  // JP-specific structural self-checks (verifyOffsets(), offsets.ts).
  // Every other region MHP2G_PROFILE knows about goes through its
  // TableAddressResolver instead — see README's "Region support" section
  // for exactly which tables that covers per region. A region the profile
  // has no resolver for at all (e.g. "us" — no disc to derive one from)
  // fails fast here rather than emitting partial/garbage equipment data.
  // Loaded first: hunting horn melodies are in game_task.ovl.
  const overlays = await loadMonsterOverlays(options.unpacked);

  let offsetResult: OffsetVerificationResult | ResolverCoverageResult;
  let output: EmitOutput;
  let resolver: TableAddressResolver | undefined;
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
    if (options.raw) await writeRawDumps(options.out, reader);
    output = emitAll(reader, undefined, overlays.gameTask.reader);
  } else {
    resolver = MHP2G_PROFILE.resolverForRegion(manifest.region) ?? undefined;
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
    if (options.raw) await writeRawDumps(options.out, reader, resolver);
    output = emitAll(reader, resolver, overlays.gameTask.reader);
  }

  // Found by shape, not address, so this is the same for every region. A
  // disc they can't be found on still gets everything else.
  try {
    const combinations = readCombinations(ebootBuf, JP_BASE_ADDRESS);
    console.log(
      `Combination List at 0x${combinations.offsets.list.toString(16)} (${combinations.recipes.length} combinations), recipes at 0x${combinations.offsets.records.toString(16)}.`,
    );
    output["combinations.json"] = emitCombinations(combinations);
  } catch (error) {
    console.warn(
      `Warning: skipping combinations.json. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  console.log("Reading and parsing quest files...");
  const { quests, skipped, raw, payloads } = await readQuestsFromUnpackedDir(
    options.unpacked,
    manifest.region,
  );
  console.log(`Parsed ${quests.length} quests, skipped ${skipped.length}.`);
  if (options.dlc) {
    const dlc = readDlcQuests(options.dlc, manifest.region);
    for (const q of dlc.quests) {
      quests.push(q.parsed);
      payloads.push({ parsed: q.parsed, payload: q.payload });
      raw.push(dumpQuestRaw(`dlc/${q.source}`, q.payload, q.parsed, q.size));
    }
    for (const s of dlc.skipped) skipped.push({ path: `dlc/${s.source}`, reason: s.reason });
    console.log(
      `Read ${dlc.quests.length} downloadable quests from ${options.dlc}, skipped ${dlc.skipped.length}.`,
    );
  }
  if (options.raw) {
    const rawPath = path.join(options.out, "raw", "quests.json");
    await mkdir(path.dirname(rawPath), { recursive: true });
    await writeFile(rawPath, `${JSON.stringify(raw)}\n`, "utf-8");
    console.log(`Wrote ${rawPath}`);
  }
  // Read before the quests: their large monsters take stat multipliers from them.
  console.log("Reading monster tables from game_task.ovl and game_sub.ovl...");
  // The EBOOT's species table maps subspecies to their base species' breaks;
  // EU and JP load it at the same address.
  const monsters = readMonsterTables(overlays, { reader, baseAddress: JP_BASE_ADDRESS });
  console.log(
    monsters.locations.breaks === null
      ? "Break table not found; monsters get no breaks."
      : `Break table at 0x${monsters.locations.breaks.toString(16)} (${monsters.breaks!.length} records), species table ${monsters.species ? "found" : "not found"}.`,
  );
  console.log(
    `Monster chunks at 0x${monsters.locations.chunks.offset.toString(16)}, reward tables at 0x${monsters.locations.rewards.carves.pointers.toString(16)} / 0x${monsters.locations.rewards.capBreak.pointers.toString(16)}.`,
  );
  const multipliers = monsters.multipliers;
  if (!multipliers)
    console.warn("Warning: quest stat multiplier tables not found; quests get none.");
  const multiplierLookup: MultiplierLookup | undefined = multipliers
    ? (emId, statTable, power) => {
        const chunk = monsters.chunks[emId];
        return chunk ? multiplierRow(multipliers, chunk.multiplierSet, statTable, power) : null;
      }
    : undefined;
  // Only the EU disc's size tables are known; elsewhere there are no sizes or crowns.
  let sizes: SizeTables | null = null;
  if (manifest.region === "eu") {
    try {
      sizes = readSizeTables(reader, JP_BASE_ADDRESS);
      console.log(
        `Size tables: ${sizes.crowns.length} crown entries, ${sizes.fixedSizeQuests.size} fixed-size quests.`,
      );
    } catch (error) {
      console.warn(
        `Warning: no monster sizes or crowns. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    console.warn(`Warning: region "${manifest.region}" has no size tables, so no sizes or crowns.`);
  }
  monsters.sizes = sizes;
  // Only the EU disc's monster list and English descriptions are known.
  monsters.bestiary = messages ? loadBestiary(messages, reader) : null;
  if (monsterNames)
    output["monster-names.json"] = {
      names: Object.fromEntries(
        monsterNames.flatMap((name, id) => (name === null ? [] : [[String(id), name]])),
      ),
    };
  if (!monsters.bestiary)
    console.warn(`Warning: region "${manifest.region}" has no monster descriptions.`);
  Object.assign(output, emitQuestsFile(quests, multiplierLookup, sizes ?? undefined));

  // Only the EU disc's map tables are known; elsewhere points get no positions.
  const maps =
    manifest.region === "eu"
      ? await loadMapLayouts(options.unpacked, reader, overlays.gameSub)
      : undefined;
  if (!maps) {
    console.warn(`Warning: region "${manifest.region}" has no map tables, so no map positions.`);
  }
  const gathering = emitGathering(payloads, maps);
  for (const { questId, problem } of gathering.problems) {
    console.log(`Quest ${questId}: gathering points skipped (${problem}).`);
  }
  console.log(`Gathering: ${gathering.layouts.length} distinct sets of points.`);
  output["gathering.json"] = { layouts: gathering.layouts };

  console.log("Reading shop stock from lobby_task.ovl...");
  const lobbyTask = parseOvl(
    await readFile(path.join(options.unpacked, OVERLAY_DIR, "lobby_task.ovl")),
  );
  const shops = emitShops(findShops(lobbyTask), reader, resolver);
  console.log(`Shops: ${shops.map((s) => `${s.name} (${s.items.length} items)`).join(", ")}.`);
  output["shops.json"] = { shops };

  const trades = readVeggieTrades(overlays.gameTask);
  if (trades) {
    console.log(
      `Veggie Elder trades at 0x${trades.offset.toString(16)}: ${trades.tables.map((t) => t.length).join(", ")} rows.`,
    );
    output["veggie-trades.json"] = emitVeggieTrades(trades);
  } else {
    console.warn(
      "Warning: the Veggie Elder's trade tables weren't found; skipping veggie-trades.json.",
    );
  }

  // Only the EU disc's farm tables are known; elsewhere there's no farm.json.
  const farm = manifest.region === "eu" ? readFarmTables(reader) : null;
  if (manifest.region !== "eu") {
    console.warn(`Warning: region "${manifest.region}" has no farm tables, so no farm.json.`);
  } else if (farm) {
    console.log(
      `Pokke Farm tables at 0x${farm.offset.toString(16)}: ${farm.tables.length} points.`,
    );
    output["farm.json"] = emitFarm(farm);
  } else {
    console.warn("Warning: Pokke Farm's gathering tables weren't found; skipping farm.json.");
  }

  // The awards' names and descriptions, from the EU disc's message files.
  const awards =
    manifest.region === "eu" ? await loadAwardText(options.unpacked, manifest.region, "en") : null;
  if (manifest.region !== "eu") {
    console.warn(`Warning: region "${manifest.region}" has no award text, so no awards.json.`);
  } else if (awards) {
    console.log(`Guild Card awards: ${awards.length} names and descriptions.`);
    output["awards.json"] = { awards };
  }

  if (options.raw) {
    const rawPath = path.join(options.out, "raw", "monsters.json");
    await mkdir(path.dirname(rawPath), { recursive: true });
    // Maps (the size tables' fixed-size quests) would serialize as `{}`.
    const json = JSON.stringify(monsters, (_, v: unknown) =>
      v instanceof Map ? Object.fromEntries(v) : v,
    );
    await writeFile(rawPath, `${json}\n`, "utf-8");
    console.log(`Wrote ${rawPath}`);

    // Hunting horn note-set/melody table candidates (#14): searched in the
    // EBOOT and both overlays against the committed horn notes.
    console.log("Searching for hunting horn note-set tables...");
    const melodyRaw = dumpMelodyRaw(
      [
        { name: "eboot.bin", reader },
        { name: "game_task.ovl", reader: overlays.gameTask.reader },
        { name: "game_sub.ovl", reader: overlays.gameSub.reader },
      ],
      hornNotesFromCommitted(reader, resolver),
      committedMelodyCombos(),
    );
    const melodyPath = path.join(options.out, "raw", "melodies.json");
    await writeFile(melodyPath, `${JSON.stringify(melodyRaw)}\n`, "utf-8");
    console.log(`Wrote ${melodyPath} (${melodyRaw.hits.length} candidate table(s)).`);

    // Monster hitbox candidates: CollisionPTR targets and the model packages' unknown entries.
    await writeCollisionRaw(
      options.unpacked,
      options.out,
      overlays,
      monsters.locations.chunks.offset,
    );
    // Breakable parts: code that reads the break reward tables, and the overlays.
    await writeBreakCodeRaw(
      options.unpacked,
      options.out,
      ebootBuf,
      overlays,
      monsters.locations.rewards,
      monsters.capBreak.length,
    );
  }
  Object.assign(output, emitMonsters(monsters));

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
