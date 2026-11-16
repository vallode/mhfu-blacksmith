/**
 * EBOOT.BIN decryption, in-process only, so it runs in Node and the browser
 * alike. The disc's `EBOOT.BIN` is a KIRK-CMD1-encrypted PSP executable
 * (magic `~PSP`); a buffer that's already a plain ELF passes through.
 * `unpack` adds a dump override and an external `pspdecrypt` fallback on
 * top (src/cli/eboot.ts).
 */
import { decryptGameEboot } from "./prx.js";

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const PSP_MAGIC = Buffer.from([0x7e, 0x50, 0x53, 0x50]); // "~PSP"

export class EbootDecryptionError extends Error {}

export function isElf(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).equals(ELF_MAGIC);
}

export function assertElf(buf: Buffer, label: string): void {
  if (!isElf(buf)) {
    throw new EbootDecryptionError(
      `${label} does not look like a decrypted ELF (expected magic 7f454c46, got ${buf.subarray(0, 4).toString("hex")})`,
    );
  }
}

/** Resolves the raw on-disc EBOOT.BIN bytes to a decrypted ELF buffer. */
export async function decryptEboot(raw: Buffer): Promise<Buffer> {
  if (isElf(raw)) return raw;
  if (raw.length < 4 || !raw.subarray(0, 4).equals(PSP_MAGIC)) {
    throw new EbootDecryptionError(
      `EBOOT.BIN has unrecognized magic ${raw.subarray(0, 4).toString("hex")} — expected "~PSP" (KIRK-encrypted) or an ELF header.`,
    );
  }
  try {
    return Buffer.from(await decryptGameEboot(raw));
  } catch (err) {
    throw new EbootDecryptionError(
      `Couldn't decrypt EBOOT.BIN: ${err instanceof Error ? err.message : err}`,
    );
  }
}
