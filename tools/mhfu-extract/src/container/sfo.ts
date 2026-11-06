/**
 * PARAM.SFO parser — just enough to read string/int key-value pairs.
 * Format reference: https://www.psdevwiki.com/psp/PARAM.SFO
 */
const MAGIC = 0x46535000; // "\0PSF" as a little-endian u32

export type SfoValue = string | number;

export function parseSfo(buf: Buffer): Map<string, SfoValue> {
  if (buf.readUInt32LE(0) !== MAGIC) throw new Error("Not a PARAM.SFO file (bad magic)");

  const keyTableStart = buf.readUInt32LE(0x08);
  const dataTableStart = buf.readUInt32LE(0x0c);
  const entryCount = buf.readUInt32LE(0x10);

  const result = new Map<string, SfoValue>();
  for (let i = 0; i < entryCount; i++) {
    const entryOffset = 0x14 + i * 16;
    const keyOffset = buf.readUInt16LE(entryOffset);
    const dataFmt = buf.readUInt16LE(entryOffset + 2);
    const dataLen = buf.readUInt32LE(entryOffset + 4);
    const dataOffset = buf.readUInt32LE(entryOffset + 12);

    const keyStart = keyTableStart + keyOffset;
    let keyEnd = keyStart;
    while (buf[keyEnd] !== 0) keyEnd++;
    const key = buf.toString("latin1", keyStart, keyEnd);

    const valueStart = dataTableStart + dataOffset;
    if (dataFmt === 0x0404) {
      result.set(key, buf.readUInt32LE(valueStart));
    } else {
      // 0x0204 = UTF-8 string, 0x0004 = UTF-8 (non-NUL-terminated) — either
      // way, trim trailing NULs/padding.
      let raw = buf.toString("utf8", valueStart, valueStart + dataLen);
      const nul = raw.indexOf("\0");
      if (nul !== -1) raw = raw.slice(0, nul);
      result.set(key, raw);
    }
  }
  return result;
}

export type Region = "jp" | "us" | "eu";

const DISC_ID_TO_REGION: Record<string, Region> = {
  ULJM05500: "jp",
  ULUS10391: "us",
  ULES01213: "eu",
};

/**
 * Resolves a PARAM.SFO's DISC_ID to one of our three supported MHP2G/MHFU
 * regions. Returns null (rather than throwing) for anything else, so
 * callers can give a clear "unsupported disc" error with the raw ID.
 */
export function detectRegion(sfo: Map<string, SfoValue>): { region: Region | null; discId: string | null } {
  const discId = sfo.get("DISC_ID");
  if (typeof discId !== "string") return { region: null, discId: null };
  return { region: DISC_ID_TO_REGION[discId] ?? null, discId };
}
