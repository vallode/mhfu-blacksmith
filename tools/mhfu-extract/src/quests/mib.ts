/**
 * QuestCipher — a second decryption layer wrapping every `.mib` quest file
 * inside `DATA.BIN`, on top of the disc-wide `DataCipher` (databin.ts).
 * Ported from `QuestCipher` in svanheulen/mhef (mhef/psp.py), GPL-3.0-or-later
 * — see ../../NOTICE.md.
 *
 * mhef documents this cipher as being for quests downloaded from Capcom's
 * (now-defunct) DLC websites. Empirically, every on-disc retail quest under
 * `mission_jpn/*.mib` is *also* wrapped in it: after `DataCipher` alone, the
 * bytes don't match `quest.hexpat`'s magic and look like uniform random
 * noise; applying `QuestCipher` on top (with the region's hash salt) yields
 * a plausible declared size, a matching SHA1 header, and the exact expected
 * magic (`4C 00 00 00 32 4E 44 47` — `questHeader.VDatPTR=0x4C` + ASCII
 * `2NDG`). Verified against a real JP disc quest (filelist.csv index 4759,
 * `mission_jpn/m00001.mib`).
 *
 * Encrypted blob layout (this is what a DataCipher-decrypted DATA.BIN entry
 * for a quest file looks like, including its trailing sector padding):
 *
 *   u16[4]   XOR keystream seeds (one per parallel LCG stream, index i%4)
 *   -- everything below is XOR-ciphered by the keystream, u16 at a time --
 *   u32      payload size (byte length of the plaintext .mib, header excluded)
 *   u8[20]   SHA1(plaintext .mib bytes + region hash salt)
 *   u8[size] plaintext .mib bytes (starts with the questHeader magic)
 *   ...      zero-padding out to the DATA.BIN sector boundary — not covered
 *            by the size or SHA1, safe to ignore/truncate
 */
import { createHash } from "node:crypto";
import type { Region } from "../container/sfo.js";

const KEY_DEFAULT: readonly [number, number, number, number] = [0xff9d, 0xffa9, 0xffc7, 0xfff1];
const KEY_MODIFIER: readonly [number, number, number, number] = [0x1709, 0x3df3, 0x747b, 0xb381];

/** us and eu share one salt in mhef ("na" in its naming); jp has its own. */
const HASH_SALT: Record<Region, string> = {
  jp: "37wyS2Jfc3x5w9oG",
  us: "Vd6gh8F30wA86Ex5",
  eu: "Vd6gh8F30wA86Ex5",
};

/** questHeader.VDatPTR (always 0x4C for a normal single-visual-data quest) + ASCII "2NDG". */
export const QUEST_MAGIC = Buffer.from([0x4c, 0x00, 0x00, 0x00, 0x32, 0x4e, 0x44, 0x47]);

export class QuestCipherError extends Error {}

class QuestKeyStream {
  private readonly key: [number, number, number, number];

  constructor(seeds: readonly [number, number, number, number]) {
    this.key = [0, 1, 2, 3].map((i) => (seeds[i] === 0 ? KEY_DEFAULT[i]! : seeds[i]!)) as [
      number,
      number,
      number,
      number,
    ];
  }

  next(round: number): number {
    const i = round % 4;
    const updated = (this.key[i]! * KEY_MODIFIER[i]!) % KEY_DEFAULT[i]!;
    this.key[i] = updated;
    return updated;
  }
}

/** Decrypts the seed-prefixed, u16-XOR-ciphered body. `buf` includes the 8-byte seed prefix. */
export function decryptQuestBlock(buf: Buffer): Buffer {
  if (buf.length < 8 || buf.length % 2 !== 0) {
    throw new QuestCipherError(`quest block must be an even length of at least 8 bytes, got ${buf.length}`);
  }
  const seeds: [number, number, number, number] = [
    buf.readUInt16LE(0),
    buf.readUInt16LE(2),
    buf.readUInt16LE(4),
    buf.readUInt16LE(6),
  ];
  const keystream = new QuestKeyStream(seeds);
  const out = Buffer.alloc(buf.length - 8);
  for (let i = 0; i < out.length; i += 2) {
    out.writeUInt16LE(buf.readUInt16LE(8 + i) ^ keystream.next(i / 2), i);
  }
  return out;
}

/** Inverse of decryptQuestBlock — kept for completeness/round-trip tests. */
export function encryptQuestBlock(body: Buffer, seeds: readonly [number, number, number, number]): Buffer {
  if (body.length % 2 !== 0) {
    throw new QuestCipherError(`quest body must be an even length, got ${body.length}`);
  }
  const keystream = new QuestKeyStream(seeds);
  const out = Buffer.alloc(8 + body.length);
  out.writeUInt16LE(seeds[0], 0);
  out.writeUInt16LE(seeds[1], 2);
  out.writeUInt16LE(seeds[2], 4);
  out.writeUInt16LE(seeds[3], 6);
  for (let i = 0; i < body.length; i += 2) {
    out.writeUInt16LE(body.readUInt16LE(i) ^ keystream.next(i / 2), 8 + i);
  }
  return out;
}

/**
 * Decrypts a DataCipher-decrypted DATA.BIN quest entry (may include
 * trailing sector padding) to its plaintext `.mib` bytes, verifying the
 * embedded SHA1. Throws `QuestCipherError` on a hash mismatch, which most
 * often means the wrong region was passed.
 */
export function decryptQuest(buf: Buffer, region: Region): Buffer {
  const decrypted = decryptQuestBlock(buf);
  if (decrypted.length < 24) {
    throw new QuestCipherError(`decrypted quest block too short for its header (${decrypted.length} bytes)`);
  }
  const size = decrypted.readUInt32LE(0);
  const hash = decrypted.subarray(4, 24);
  const rest = decrypted.subarray(24);
  if (size > rest.length) {
    throw new QuestCipherError(
      `quest header declares size ${size}, but only ${rest.length} bytes follow — wrong region/offset or corrupt data`
    );
  }
  const payload = rest.subarray(0, size);

  const expected = createHash("sha1")
    .update(Buffer.concat([payload, Buffer.from(HASH_SALT[region], "ascii")]))
    .digest();
  if (!expected.equals(hash)) {
    throw new QuestCipherError(`quest SHA1 mismatch for region "${region}" — wrong region, or not QuestCipher-wrapped`);
  }

  return Buffer.from(payload);
}

/** Inverse of decryptQuest — encrypts plaintext `.mib` bytes for round-trip tests. */
export function encryptQuest(
  payload: Buffer,
  region: Region,
  seeds: readonly [number, number, number, number] = [0, 0, 0, 0]
): Buffer {
  const hash = createHash("sha1")
    .update(Buffer.concat([payload, Buffer.from(HASH_SALT[region], "ascii")]))
    .digest();
  const header = Buffer.alloc(24);
  header.writeUInt32LE(payload.length, 0);
  hash.copy(header, 4);
  return encryptQuestBlock(Buffer.concat([header, payload]), seeds);
}

/** True if `buf` starts with the plaintext quest header magic. */
export function isQuestMagic(buf: Buffer): boolean {
  return buf.length >= QUEST_MAGIC.length && buf.subarray(0, QUEST_MAGIC.length).equals(QUEST_MAGIC);
}
