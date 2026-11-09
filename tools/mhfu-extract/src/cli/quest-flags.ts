/**
 * `quest-flags` subcommand: searches an `unpack`ed EBOOT and the task/sub
 * overlays for the quest ID -> save "cleared" bit table (see
 * quests/flag-scan.ts) and writes every candidate to a JSON report.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadFileList } from "../container/filelist.js";
import { OVERLAY_DIR } from "../monsters/overlays.js";
import { scanQuestFlags, type QuestFlagReport, type ScanFile } from "../quests/flag-scan.js";
import { assertCurrentFileNames, type UnpackManifest } from "./unpack.js";

export interface QuestFlagsOptions {
  unpacked: string;
  /** Report path; defaults to `<unpacked>/quest-flags.json`. */
  out?: string;
}

const QUEST_FILE = /^mission_jpn\/m(\d+)\.mib$/;
/** The game's own code and data overlays; `emXX`/`stageXXX` hold one monster or map each. */
const SCANNED_OVERLAY = /_(task|sub)\.ovl$/;

/** Every quest ID on the disc, from the quest file names (`m01001.mib` -> 1001). */
export function discQuestIds(): Set<number> {
  const ids = new Set<number>();
  for (const filePath of loadFileList("jp").values()) {
    const m = QUEST_FILE.exec(filePath);
    if (m) ids.add(Number(m[1]));
  }
  return ids;
}

export async function runQuestFlags(options: QuestFlagsOptions): Promise<QuestFlagReport> {
  const manifest: UnpackManifest = JSON.parse(
    await readFile(path.join(options.unpacked, "manifest.json"), "utf-8"),
  );
  assertCurrentFileNames(manifest, options.unpacked);
  if (manifest.eboot === false) {
    throw new Error(
      `${options.unpacked} was unpacked with --skip-eboot, so it has no eboot.bin; rerun unpack with pspdecrypt on PATH or --eboot <path>.`,
    );
  }

  const files: ScanFile[] = [
    { name: "eboot.bin", buf: await readFile(path.join(options.unpacked, "eboot.bin")) },
  ];
  const overlayDir = path.join(options.unpacked, OVERLAY_DIR);
  for (const name of (await readdir(overlayDir)).filter((n) => SCANNED_OVERLAY.test(n)).sort()) {
    files.push({ name: `overlay/${name}`, buf: await readFile(path.join(overlayDir, name)) });
  }

  const questIds = discQuestIds();
  console.log(
    `Scanning ${files.map((f) => f.name).join(", ")} for ${questIds.size} quest IDs (${manifest.region.toUpperCase()} disc)...`,
  );
  const report = scanQuestFlags(files, questIds);
  const out = options.out ?? path.join(options.unpacked, "quest-flags.json");
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  printQuestFlagSummary(report);
  console.log(`\nWrote ${out}`);
  return report;
}

export function printQuestFlagSummary(report: QuestFlagReport): void {
  const anchored = report.idLists.filter((h) => h.anchorsMatched.length > 0);
  console.log(
    `\nQuest ID lists: ${report.idLists.length} found, ${anchored.length} placed by the anchor bits.`,
  );
  for (const h of report.idLists.slice(0, 10)) {
    const where = `${h.file} @0x${h.offset.toString(16)} u${h.width * 8} stride ${h.stride}, ${h.slots} slots`;
    const anchors = h.anchorsMatched.length
      ? `entry 0 = bit ${h.bitOfFirstEntry}, anchors ${h.anchorsMatched.join(",")}` +
        (h.anchorsMissed.length ? ` (missed ${h.anchorsMissed.join(",")})` : "") +
        `; vs saves: ${h.vsSaves!.agree} agree, ${h.vsSaves!.disagree} disagree, ${h.vsSaves!.notInSaves} not in saves`
      : "no anchor IDs";
    console.log(`  ${where}\n    ${anchors}\n    ${h.summary.slice(0, 160)}`);
  }
  console.log(`\nOrdered values: ${report.sequences.length} runs.`);
  for (const s of report.sequences.slice(0, 10)) {
    console.log(
      `  ${s.sequence}: ${s.file} @0x${s.offset.toString(16)} u${s.width * 8} stride ${s.stride}, ${s.length} values from #${s.from}`,
    );
  }
}
