/**
 * `table-probe` subcommand: looks for MHFU's EBOOT tables in another
 * unpacked disc's EBOOT (MHF2, MHF1, or an MHFU region without a resolver
 * yet) by searching it for MHFU's own entries (tables/probe.ts). Writes
 * offsets and counts only, so the report is safe to share.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BinaryReader } from "../binary/reader.js";
import { GAME_NAMES } from "../container/sfo.js";
import { MHP2G_PROFILE } from "../games/mhp2g.js";
import { ARMOR_SLOT_COUNTS, ARMOR_SLOTS, armorValuesOffsets } from "../tables/armor.js";
import { ARMOR_ENTRY_SIZE } from "../tables/offsets.js";
import {
  byteAgreement,
  fieldShifts,
  probeTable,
  probeWindows,
  WindowIndex,
  type ProbeResult,
  type ProbeTable,
  type FieldShift,
  type WindowProbe,
} from "../tables/probe.js";
import { assertMhfuUnpack, manifestGame, type UnpackManifest } from "./unpack.js";

export interface TableProbeOptions {
  /** An MHFU unpack (JP or EU) to take the tables from. */
  reference: string;
  /** Any unpack with an eboot.bin to look for them in. */
  target: string;
  out?: string;
}

export interface TableProbeReport {
  reference: { game: string; region: string; discId: string };
  target: { game: string; region: string; discId: string; ebootBytes: number };
  tables: TableProbeEntry[];
}

export interface TableProbeEntry extends ProbeResult {
  /**
   * Per byte of an entry, the percentage of entries at the best base whose
   * byte matches MHFU's (when at least `MIN_AGREEMENT_ENTRIES` entries
   * agreed on it). Low bytes are fields the target changed.
   */
  agreement?: number[];
  /** Runs of each entry, for tables whose layout changed (tables/probe.ts). */
  windows: WindowProbe | null;
  /**
   * When the runs found a different entry size: per MHFU byte, where it
   * best lines up in a target entry, anchored on the field most entries
   * agreed on.
   */
  shifts?: { anchor: number; stride: number; from: number; to: number; bytes: FieldShift[] };
}

/** Fewest entries agreeing on a base before per-byte agreement means anything. */
const MIN_AGREEMENT_ENTRIES = 10;
/** Bytes per run in the window search. */
const WINDOW = 8;

async function readManifest(dir: string): Promise<UnpackManifest> {
  return JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf-8")) as UnpackManifest;
}

async function readEboot(dir: string, manifest: UnpackManifest): Promise<Buffer> {
  if (manifest.eboot === false) {
    throw new Error(`${dir} was unpacked with --skip-eboot, so it has no eboot.bin.`);
  }
  return readFile(path.join(dir, "eboot.bin"));
}

/** Every fixed-stride MHFU table, located in the reference EBOOT. */
export function referenceTables(eboot: Buffer, region: UnpackManifest["region"]): ProbeTable[] {
  const resolver = MHP2G_PROFILE.resolverForRegion(region);
  if (!resolver) {
    throw new Error(`No MHFU table addresses for region "${region}"; use a JP or EU MHFU unpack.`);
  }
  // JP's armor goes through its pointer table (no resolver), EU's through signatures.
  const armor = armorValuesOffsets(new BinaryReader(eboot), region === "jp" ? undefined : resolver);
  const tables: ProbeTable[] = [];
  for (const t of MHP2G_PROFILE.tables) {
    if (t.entrySize === undefined || t.count === undefined) continue;
    // Pointers are addresses in MHFU's own image: they won't match elsewhere.
    if (t.name === "armorValuePointers") continue;
    tables.push({
      name: t.name,
      offset: resolver.resolve(t.name, eboot),
      entrySize: t.entrySize,
      count: t.count,
    });
  }
  for (const slot of ARMOR_SLOTS) {
    tables.push({
      name: `armor:${slot}`,
      offset: armor[slot],
      entrySize: ARMOR_ENTRY_SIZE,
      count: ARMOR_SLOT_COUNTS[slot],
    });
  }
  return tables;
}

export async function runTableProbe(options: TableProbeOptions): Promise<TableProbeReport> {
  const refManifest = await readManifest(options.reference);
  assertMhfuUnpack(refManifest, options.reference);
  const targetManifest = await readManifest(options.target);
  const refEboot = await readEboot(options.reference, refManifest);
  const targetEboot = await readEboot(options.target, targetManifest);

  const index = new WindowIndex(targetEboot, WINDOW);
  const tables: TableProbeEntry[] = referenceTables(refEboot, refManifest.region).map((t) => {
    const result = probeTable(refEboot, t, targetEboot);
    const best = result.bases[0];
    const agreement =
      best && best.entries >= MIN_AGREEMENT_ENTRIES
        ? byteAgreement(refEboot, t, targetEboot, best.offset, best.firstIndex, best.lastIndex).map(
            (share) => Math.round(share * 100),
          )
        : undefined;
    const windows = probeWindows(refEboot, t, index);
    let shifts: TableProbeEntry["shifts"];
    const anchorField = windows?.fields.reduce<(typeof windows.fields)[number] | undefined>(
      (best, f) => (!best || f.agreeing > best.agreeing ? f : best),
      undefined,
    );
    if (
      windows?.stride &&
      windows.stride !== t.entrySize &&
      anchorField &&
      anchorField.agreeing >= MIN_AGREEMENT_ENTRIES
    ) {
      const anchor = anchorField.targetBase! - anchorField.refOffset;
      const { firstIndex: from, lastIndex: to } = anchorField;
      shifts = {
        anchor,
        stride: windows.stride,
        from,
        to,
        bytes: fieldShifts(refEboot, t, targetEboot, anchor, windows.stride, from, to),
      };
    }
    return {
      ...result,
      ...(agreement ? { agreement } : {}),
      windows,
      ...(shifts ? { shifts } : {}),
    };
  });
  const report: TableProbeReport = {
    reference: {
      game: manifestGame(refManifest),
      region: refManifest.region,
      discId: refManifest.discId,
    },
    target: {
      game: manifestGame(targetManifest),
      region: targetManifest.region,
      discId: targetManifest.discId,
      ebootBytes: targetEboot.length,
    },
    tables,
  };
  const out = options.out ?? path.join(options.target, "table-probe.json");
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, "utf-8");

  console.log(
    `MHFU (${refManifest.discId}) tables in ${GAME_NAMES[manifestGame(targetManifest)]} (${targetManifest.discId}):\n`,
  );
  for (const t of tables) {
    const best = t.bases[0];
    const where = best
      ? `best base 0x${best.offset.toString(16)} (${best.entries} entries, #${best.firstIndex}-#${best.lastIndex})` +
        (t.bases.length > 1 ? `, ${t.bases.length - 1} other base(s)` : "")
      : "not found";
    console.log(
      `  ${t.table.padEnd(22)} ${String(t.unique).padStart(5)}/${String(t.searched).padEnd(5)} unique, ${String(t.ambiguous).padStart(4)} ambiguous; ${where}`,
    );
    if (t.agreement) {
      const changed = t.agreement
        .map((pct, at) => ({ pct, at }))
        .filter(({ pct }) => pct < 90)
        .map(({ pct, at }) => `+${at}:${pct}%`);
      console.log(
        `  ${"".padEnd(22)} bytes under 90% agreement: ${changed.length ? changed.join(" ") : "none"}`,
      );
    }
    console.log(`  ${"".padEnd(22)} ${describeWindows(t.windows)}`);
    if (t.shifts) {
      const bytes = t.shifts.bytes
        .map(
          (b) =>
            `${b.refOffset}:${b.shift >= 0 ? "+" : ""}${b.shift}(${b.pct}%${b.distinct === 1 ? ",const" : ""})`,
        )
        .join(" ");
      console.log(
        `  ${"".padEnd(22)} byte shifts (MHFU byte:shift(agreement)), entries #${t.shifts.from}-#${t.shifts.to}: ${bytes}`,
      );
    }
  }
  console.log(`\nWrote ${out}`);
  return report;
}

/** One line on the window search: the target entry size and where MHFU's fields land in it. */
function describeWindows(w: WindowProbe | null): string {
  if (!w) return "runs: entries shorter than a run";
  if (w.stride === null || w.fields.length === 0) return "runs: no consistent spacing";
  const support = w.strides[0]!.pairs;
  const runnerUp = w.strides[1] ? `, next ${w.strides[1].stride} (${w.strides[1].pairs})` : "";
  const origin = Math.min(...w.fields.map((f) => f.targetBase!));
  const fields = [...w.fields]
    .sort((a, b) => a.refOffset - b.refOffset)
    .map((f) => `${f.refOffset}->${f.targetBase! - origin}(${f.agreeing})`)
    .join(" ");
  return `runs: entry size ${w.stride} (${support} pairs${runnerUp}), first field at 0x${origin.toString(16)}; MHFU offset->target offset(entries): ${fields}`;
}
