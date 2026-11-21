/**
 * `model-roundtrip` subcommand: reads every `.pac` model package under a
 * directory and writes it back with `writePac` / `writePmo`
 * (`models/pmo-file.ts`), counting the packages that come out byte for
 * byte the same. Anything that differs is something the writers don't
 * understand yet, so run this after changing them.
 *
 * Packages are whole sectors in DATA.BIN; the bytes after their last entry
 * are padding (not zeros on the EU disc) and aren't compared.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isPac, readPac, writePac } from "../models/pac.js";
import { isPmo } from "../models/pmo.js";
import { parsePmoFile, writePmo } from "../models/pmo-file.js";
import { listPacs } from "./models.js";

export interface RoundTripResult {
  source: string;
  /** Absent when the package came back the same. */
  problem?: string;
}

/** Rewrites one package; returns what went wrong, or undefined when nothing did. */
export function roundTripPac(buf: Buffer): string | undefined {
  const entries = readPac(buf);
  const rebuilt: Buffer[] = [];
  for (const entry of entries) {
    if (!isPmo(entry.data)) {
      rebuilt.push(entry.data);
      continue;
    }
    let pmo: Buffer;
    try {
      pmo = writePmo(parsePmoFile(entry.data));
    } catch (error) {
      return `entry ${entry.index}: ${(error as Error).message}`;
    }
    const at = firstDifference(pmo, entry.data);
    if (at !== undefined) return `entry ${entry.index}: PMO differs from byte 0x${at.toString(16)}`;
    rebuilt.push(pmo);
  }
  const pac = writePac(rebuilt);
  const at = firstDifference(pac, buf.subarray(0, pac.length));
  return at === undefined ? undefined : `package differs from byte 0x${at.toString(16)}`;
}

function firstDifference(a: Buffer, b: Buffer): number | undefined {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? undefined : length;
}

export async function runModelRoundTrip(input: string): Promise<RoundTripResult[]> {
  const results: RoundTripResult[] = [];
  for (const file of await listPacs(input)) {
    const buf = await readFile(file);
    if (!isPac(buf)) continue;
    const source = path.relative(input, file) || path.basename(file);
    const problem = roundTripPac(buf);
    results.push(problem === undefined ? { source } : { source, problem });
  }
  return results;
}
