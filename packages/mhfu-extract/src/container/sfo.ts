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
    const dataMaxLen = buf.readUInt32LE(entryOffset + 8);
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
      // way, trim trailing NULs/padding. A NUL-terminated string is read to
      // its NUL within the field, not to its recorded length: FUComplete
      // writes a longer TITLE over the retail one and leaves the length.
      const len = dataFmt === 0x0204 ? Math.max(dataLen, dataMaxLen) : dataLen;
      let raw = buf.toString("utf8", valueStart, valueStart + len);
      const nul = raw.indexOf("\0");
      if (nul !== -1) raw = raw.slice(0, nul);
      result.set(key, raw);
    }
  }
  return result;
}

export type Region = "jp" | "us" | "eu";

/**
 * Which game a disc is. `mhp2g` is MHP2G/MHFU, the game everything past
 * `unpack` reads; `mhp` (MHP/MHF1) and `mhp2` (MHP2nd/MHF2) unpack, but no
 * command reads their tables yet (see README's "Other games").
 */
export type Game = "mhp" | "mhp2" | "mhp2g";

export const GAME_NAMES: Readonly<Record<Game, string>> = {
  mhp: "Monster Hunter Freedom (MHP)",
  mhp2: "Monster Hunter Freedom 2 (MHP2nd)",
  mhp2g: "Monster Hunter Freedom Unite (MHP2G)",
};

/** Retail disc IDs, as svanheulen/mhef's `psp.py` lists them. */
export const KNOWN_DISCS: Readonly<Record<string, { game: Game; region: Region }>> = {
  ULJM05066: { game: "mhp", region: "jp" },
  ULUS10084: { game: "mhp", region: "us" },
  ULES00318: { game: "mhp", region: "eu" },
  ULJM05156: { game: "mhp2", region: "jp" },
  ULUS10266: { game: "mhp2", region: "us" },
  ULES00851: { game: "mhp2", region: "eu" },
  ULJM05500: { game: "mhp2g", region: "jp" },
  ULUS10391: { game: "mhp2g", region: "us" },
  ULES01213: { game: "mhp2g", region: "eu" },
};

export function isGame(value: string): value is Game {
  return value in GAME_NAMES;
}

export function isRegion(value: string): value is Region {
  return value === "jp" || value === "us" || value === "eu";
}

/**
 * Resolves a PARAM.SFO's DISC_ID to the game and region it is. Returns
 * nulls (rather than throwing) for anything else, so callers can give a
 * clear "unsupported disc" error with the raw ID.
 */
export function detectDisc(sfo: Map<string, SfoValue>): {
  game: Game | null;
  region: Region | null;
  discId: string | null;
} {
  const discId = sfo.get("DISC_ID");
  if (typeof discId !== "string") return { game: null, region: null, discId: null };
  const known = KNOWN_DISCS[discId];
  return { game: known?.game ?? null, region: known?.region ?? null, discId };
}

/**
 * Resolves a PARAM.SFO's DISC_ID to one of the three MHP2G/MHFU regions.
 * Returns a null region for anything else, MHF1 and MHF2 discs included, so
 * the tools that only read MHFU (randomfu) keep refusing them.
 */
export function detectRegion(sfo: Map<string, SfoValue>): {
  region: Region | null;
  discId: string | null;
} {
  const { game, region, discId } = detectDisc(sfo);
  return { region: game === "mhp2g" ? region : null, discId };
}
