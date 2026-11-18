/**
 * `unpack`'s EBOOT.BIN decryption, which tries, in order:
 *
 *   1. `--eboot <path>` — a pre-decrypted dump the caller supplies (e.g.
 *      from PPSSPP's Debug -> Dump Decrypted EBOOT.BIN).
 *   2. The shared in-process decryption (container/eboot.ts), which also
 *      passes an already-decrypted ELF through.
 *   3. An external `pspdecrypt` binary on PATH (GPL-3.0,
 *      https://github.com/John-K/pspdecrypt) — validated against real JP
 *      and EU EBOOTs, see README — for a module prx.ts can't open.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { assertElf, decryptEboot, EbootDecryptionError } from "../container/eboot.js";

const execFileAsync = promisify(execFile);

export interface UnpackEbootOptions {
  /** Path to an already-decrypted EBOOT dump. Skips decryption entirely. */
  overridePath?: string;
  /** Name or path of the pspdecrypt binary. Defaults to "pspdecrypt" (resolved via PATH). */
  pspdecryptBin?: string;
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === "object" && err !== null && "code" in err;
}

export async function unpackEboot(raw: Buffer, options: UnpackEbootOptions = {}): Promise<Buffer> {
  if (options.overridePath) {
    const buf = await readFile(options.overridePath);
    assertElf(buf, `--eboot override at ${options.overridePath}`);
    return buf;
  }
  try {
    return await decryptEboot(raw);
  } catch (err) {
    // Unrecognized magic won't decrypt any other way either.
    if (err instanceof EbootDecryptionError && /unrecognized magic/.test(err.message)) throw err;
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
