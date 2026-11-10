/**
 * EBOOT.BIN decryption strategy chain.
 *
 * The disc's `EBOOT.BIN` is a KIRK-CMD1-encrypted PSP executable (magic
 * `~PSP`). This tries, in order:
 *
 *   1. Passthrough — the buffer is already a plain ELF (magic `\x7fELF`),
 *      e.g. because the caller already decrypted it.
 *   2. `--eboot <path>` override — a pre-decrypted dump the caller supplies
 *      (e.g. from PPSSPP's Debug -> Dump Decrypted EBOOT.BIN).
 *   3. In-process decryption of game EBOOTs (prx.ts), which also runs in
 *      the browser.
 *   4. An external `pspdecrypt` binary on PATH (GPL-3.0,
 *      https://github.com/John-K/pspdecrypt) — validated against real JP
 *      and EU EBOOTs, see README — for a module prx.ts can't open.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { decryptGameEboot } from "./prx.js";

const execFileAsync = promisify(execFile);

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const PSP_MAGIC = Buffer.from([0x7e, 0x50, 0x53, 0x50]); // "~PSP"

export class EbootDecryptionError extends Error {}

export interface DecryptEbootOptions {
  /** Path to an already-decrypted EBOOT dump. Skips decryption entirely. */
  overridePath?: string;
  /** Name or path of the pspdecrypt binary. Defaults to "pspdecrypt" (resolved via PATH). */
  pspdecryptBin?: string;
  /** False to skip the pspdecrypt fallback (the browser, which can't run it). */
  external?: boolean;
}

function isElf(buf: Buffer): boolean {
  return buf.length >= 4 && buf.subarray(0, 4).equals(ELF_MAGIC);
}

function assertElf(buf: Buffer, label: string): void {
  if (!isElf(buf)) {
    throw new EbootDecryptionError(
      `${label} does not look like a decrypted ELF (expected magic 7f454c46, got ${buf.subarray(0, 4).toString("hex")})`,
    );
  }
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === "object" && err !== null && "code" in err;
}

/** Resolves the raw on-disc EBOOT.BIN bytes to a decrypted ELF buffer. */
export async function decryptEboot(
  raw: Buffer,
  options: DecryptEbootOptions = {},
): Promise<Buffer> {
  if (options.overridePath) {
    const buf = await readFile(options.overridePath);
    assertElf(buf, `--eboot override at ${options.overridePath}`);
    return buf;
  }

  if (isElf(raw)) {
    return raw;
  }

  if (raw.length < 4 || !raw.subarray(0, 4).equals(PSP_MAGIC)) {
    throw new EbootDecryptionError(
      `EBOOT.BIN has unrecognized magic ${raw.subarray(0, 4).toString("hex")} — expected "~PSP" (KIRK-encrypted) or an ELF header.`,
    );
  }

  let nativeError: unknown;
  try {
    return Buffer.from(await decryptGameEboot(raw));
  } catch (err) {
    nativeError = err;
  }
  if (options.external === false) {
    throw new EbootDecryptionError(
      `Couldn't decrypt EBOOT.BIN: ${nativeError instanceof Error ? nativeError.message : nativeError}`,
    );
  }
  return decryptViaPspdecrypt(raw, options.pspdecryptBin ?? "pspdecrypt");
}

async function decryptViaPspdecrypt(raw: Buffer, bin: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "mhfu-extract-eboot-"));
  const inPath = join(dir, "EBOOT.BIN");
  const outPath = join(dir, "EBOOT.dec");
  try {
    await writeFile(inPath, raw);
    await execFileAsync(bin, ["-o", outPath, inPath]);
    const decrypted = await readFile(outPath);
    assertElf(decrypted, `${bin} output`);
    return decrypted;
  } catch (err) {
    if (err instanceof EbootDecryptionError) throw err;
    if (isErrnoException(err) && err.code === "ENOENT") {
      throw new EbootDecryptionError(
        `EBOOT.BIN is KIRK-encrypted and no decryption path succeeded: "${bin}" was not found on PATH.\n` +
          `Either build pspdecrypt (GPL-3.0, https://github.com/John-K/pspdecrypt) and put it on PATH, or pass ` +
          `--eboot <path> pointing at a pre-decrypted dump (e.g. via PPSSPP's Debug -> Dump Decrypted EBOOT.BIN). See README.`,
      );
    }
    throw new EbootDecryptionError(
      `"${bin}" failed to decrypt EBOOT.BIN: ${err instanceof Error ? err.message : err}`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
