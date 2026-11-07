/**
 * `.pac` package container used by model files in DATA.BIN
 * (`weapon/weNNN.pac`, `emmodel/emNN.pac`, `player/**.pac`).
 *
 * Layout (see svanheulen/mhff `psp/package.py`): u32 entry count, then
 * `count` pairs of (u32 offset, u32 size), offsets relative to the start of
 * the file. Entries are not named; their type is identified by magic
 * (`pmo\0` mesh, `.TMH` texture set, others not yet identified). Unused
 * slots are (0, 0): small monsters' `emmodel/em03.pac` declares 7 entries
 * but fills 4.
 */
import { BinaryReader } from "../binary/reader.js";

export interface PacEntry {
  index: number;
  data: Buffer;
  /** First 4 bytes as ASCII when printable (e.g. "pmo", ".TMH"), else null. */
  magic: string | null;
}

/** Upper bound for a plausible entry count; guards against parsing non-package files as packages. */
const MAX_ENTRIES = 256;

export function isPac(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const reader = new BinaryReader(buf);
  const count = reader.u32(0);
  if (count === 0 || count > MAX_ENTRIES || 4 + count * 8 > buf.length) return false;
  for (let i = 0; i < count; i++) {
    const offset = reader.u32(4 + i * 8);
    const size = reader.u32(8 + i * 8);
    if (offset === 0 && size === 0) continue; // unused slot
    if (offset < 4 + count * 8 || offset + size > buf.length) return false;
  }
  return true;
}

function readMagic(data: Buffer): string | null {
  if (data.length < 4) return null;
  const raw = data.subarray(0, 4).toString("latin1").replace(/\0+$/, "");
  return raw.length > 0 && /^[\x20-\x7e]+$/.test(raw) ? raw : null;
}

export function readPac(buf: Buffer): PacEntry[] {
  if (!isPac(buf)) throw new Error("Not a .pac package (bad entry count or out-of-range entry)");
  const reader = new BinaryReader(buf);
  const count = reader.u32(0);
  const entries: PacEntry[] = [];
  for (let i = 0; i < count; i++) {
    const offset = reader.u32(4 + i * 8);
    const size = reader.u32(8 + i * 8);
    const data = buf.subarray(offset, offset + size);
    entries.push({ index: i, data, magic: readMagic(data) });
  }
  return entries;
}
