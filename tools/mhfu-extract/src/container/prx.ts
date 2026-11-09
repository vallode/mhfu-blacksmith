/**
 * Decrypts a PSP game EBOOT (a "~PSP" module) in-process, so neither
 * pspdecrypt nor a PPSSPP dump is needed. A port of the one scheme game
 * EBOOTs use ("type 2" in PPSSPP's Core/ELF/PrxDecrypter.cpp, GPL-2.0+; see
 * also libkirk), with the keys published in those projects:
 *
 *   1. The module's tag (at 0xD0) picks a 16-byte key. Expanded with KIRK
 *      command 7 (AES-128-CBC under key-vault entry 0x5D), it XOR-masks the
 *      KIRK header and a SHA-1 over the module header checks the result.
 *   2. The rebuilt KIRK command 1 header holds the module's AES key,
 *      encrypted under the KIRK 1 key, and the size and offset of the data.
 *   3. The data is AES-128-CBC under that key: the ELF, gzipped when the
 *      module header says so (comp_attribute bit 0).
 *
 * KIRK 1's CMAC over the header isn't checked; the SHA-1 above, the ELF
 * header and the table signatures found later all are.
 */
import { createHash } from "node:crypto";
import { cbcDecrypt } from "./aes.js";

export class PrxDecryptionError extends Error {}

/** KIRK command 1's own key: decrypts the AES key in a KIRK 1 header. */
export const KIRK1_KEY = hex("98c940975c1d10e87fe60ea3fd03a8ba");
/** The key-vault entry game EBOOT tags use (KIRK commands 4 and 7). */
export const TAG_CODE = 0x5d;
export const KEYVAULT_5D = hex("115a5d20d53a8dd39cc5af410f0f186f");

/** Game EBOOT tags (the u32 at 0xD0) and their keys. */
export const GAME_TAG_KEYS: ReadonlyMap<number, Uint8Array> = new Map(
  (
    [
      [0x8004fd03, "f4aef4e186ddd29c7cc542a695a08388"],
      [0xd91605f0, "b88c458bb6e76eb85159a6537c5e8631"],
      [0xd91606f0, "ed10e036c4fe83f375705ef6a44005f7"],
      [0xd91608f0, "5c770cbbb4c24fa27e3b4eb4b4c870af"],
      [0xd91609f0, "d036127580562043c430943e1c75d1bf"],
      [0xd9160af0, "10a9ac16ae19c07e3b607786016ff263"],
      [0xd9160bf0, "8383f13753d0befc8da73252460ac2c2"],
      [0xd91611f0, "61b0c0587157d9fa74670e5c7e6e95b9"],
      [0xd91612f0, "9e20e1cdd788dec0319b10afc5b87323"],
      [0xd91613f0, "ebff40d8b41ae166913b8f64b6fcb712"],
      [0xd91614f0, "fdf7b73c9fd1339511b8b5bb54237385"],
      [0xd91615f0, "c803e34450f1e72a6a0dc361b68e5f51"],
      [0xd91616f0, "5303b86a101998491caf30e4251b6b28"],
      [0xd91617f0, "02fa487375afae0a67892b954b0987a3"],
      [0xd91618f0, "96967cc3f712da621bf69a9a4444bc48"],
      [0xd91619f0, "e032a7086b2b292cd14d5beea8c8b4e9"],
      [0xd9161af0, "27e5a74952e194673566910ce89a2524"],
      [0xd91620f0, "521cb45f403b9addacfcea92fdddf590"],
      [0xd91621f0, "d1912ea621142962f6edaecbdda3bafe"],
      [0xd91622f0, "595d784d21b201176c9ab51bdab7f9e6"],
      [0xd91623f0, "aa45eb4f62fbd10d71d562d2f5bfa52f"],
      [0xd91624f0, "61b726af8bf14158836ac49212cbb1e9"],
      [0xd91628f0, "49a4fc66dce76221db18a750d6a8c1b6"],
    ] as const
  ).map(([tag, key]) => [tag, hex(key)]),
);

export const PSP_MAGIC = [0x7e, 0x50, 0x53, 0x50]; // "~PSP"
/** The module header; the KIRK 1 header is rebuilt inside a copy of it. */
const PSP_HEADER_SIZE = 0x150;
const KIRK1_HEADER_SIZE = 0x90;
/** Where the rebuilt KIRK 1 header goes: the module header less it and the 0x80 bytes after it. */
const KIRK1_AT = PSP_HEADER_SIZE - KIRK1_HEADER_SIZE - 0x80;

function hex(text: string): Uint8Array {
  return Uint8Array.from(text.match(/../g)!, (b) => parseInt(b, 16));
}

const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at, true);

/** KIRK command 7: AES-128-CBC decryption under a key-vault key (only 0x5D here). */
export function kirk7(data: Uint8Array, code: number): Uint8Array {
  if (code !== TAG_CODE) throw new PrxDecryptionError(`No key-vault key 0x${code.toString(16)}`);
  return cbcDecrypt(KEYVAULT_5D, data);
}

/** The tag key expanded into 0x90 bytes of XOR mask: nine numbered copies, through KIRK 7. */
export function expandSeed(key: Uint8Array, code: number): Uint8Array {
  const seed = new Uint8Array(0x90);
  for (let i = 0; i < 0x90; i += 0x10) {
    seed.set(key, i);
    seed[i] = i / 0x10;
  }
  return kirk7(seed, code);
}

function sha1(...parts: Uint8Array[]): Uint8Array {
  const hash = createHash("sha1");
  for (const part of parts) hash.update(part);
  return new Uint8Array(hash.digest());
}

const equal = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** True if `data` starts with "~PSP". */
export function isPspModule(data: Uint8Array): boolean {
  return data.length >= 4 && PSP_MAGIC.every((b, i) => data[i] === b);
}

/**
 * Decrypts a game EBOOT's module. The result is the ELF, or its gzip stream
 * when the module is compressed (see `decryptGameEboot`).
 */
export function decryptPrx(raw: Uint8Array): Uint8Array {
  if (!isPspModule(raw) || raw.length < PSP_HEADER_SIZE) {
    throw new PrxDecryptionError("Not a PSP module (no ~PSP header)");
  }
  const tag = u32(raw, 0xd0);
  const tagKey = GAME_TAG_KEYS.get(tag);
  if (!tagKey) {
    throw new PrxDecryptionError(`Unknown EBOOT tag 0x${tag.toString(16).padStart(8, "0")}`);
  }
  if (raw.subarray(0xd4, 0xd4 + 0x58).some((b) => b !== 0)) {
    throw new PrxDecryptionError("Not a game EBOOT (its signature-check area isn't empty)");
  }
  const xor = expandSeed(tagKey, TAG_CODE);

  // The header's pieces, rearranged as the hardware reads them:
  // tag, 0x58 empty, id, SHA-1, KIRK header, KIRK metadata, the first 0x80 of the module.
  const t = new Uint8Array(PSP_HEADER_SIZE);
  t.set(raw.subarray(0xd0, 0xd4), 0x00);
  t.set(raw.subarray(0x140, 0x150), 0x5c);
  t.set(raw.subarray(0x12c, 0x140), 0x6c);
  t.set(raw.subarray(0x80, 0xb0), 0x80);
  t.set(raw.subarray(0xc0, 0xd0), 0xb0);
  t.set(raw.subarray(0xb0, 0xc0), 0xc0);
  t.set(raw.subarray(0x00, 0x80), 0xd0);
  t.set(kirk7(t.subarray(0x5c, 0xbc), TAG_CODE), 0x5c);
  const tagBytes = t.subarray(0x00, 0x04);
  const empty = t.subarray(0x04, 0x5c);
  const id = t.subarray(0x5c, 0x6c);
  const expected = t.subarray(0x6c, 0x80);
  const kirkHeader = t.subarray(0x80, 0xc0);
  const kirkMetadata = t.subarray(0xc0, 0xd0);
  const moduleHead = t.subarray(0xd0, 0x150);
  const actual = sha1(
    tagBytes,
    xor.subarray(0, 0x10),
    empty,
    id,
    kirkHeader,
    kirkMetadata,
    moduleHead,
  );
  if (!equal(actual, expected)) {
    throw new PrxDecryptionError("The EBOOT's header check failed: wrong key or a damaged file");
  }

  // The KIRK 1 header: the unmasked key block, then the data's size and offset.
  const header = new Uint8Array(KIRK1_HEADER_SIZE);
  for (let i = 0; i < 0x40; i++) header[i] = kirkHeader[i]! ^ xor[0x10 + i]!;
  header.set(kirk7(header.subarray(0, 0x40), TAG_CODE));
  for (let i = 0; i < 0x40; i++) header[i]! ^= xor[0x50 + i]!;
  header.set(kirkMetadata, 0x70);
  const dataSize = u32(header, 0x70);
  const dataOffset = u32(header, 0x74);

  // KIRK 1 reads the data from after the header it's handed, which sits at
  // KIRK1_AT in a copy of the module with the module's first 0x80 bytes after it.
  const start = KIRK1_AT + KIRK1_HEADER_SIZE + dataOffset;
  const length = (dataSize + 15) & ~15;
  if (start + length > raw.length) {
    throw new PrxDecryptionError("The EBOOT is shorter than its header says");
  }
  const source = raw.slice(0, start + length);
  source.set(moduleHead, KIRK1_AT + KIRK1_HEADER_SIZE);
  const aesKey = cbcDecrypt(KIRK1_KEY, header.subarray(0, 0x20)).subarray(0, 0x10);
  const decrypted = cbcDecrypt(aesKey, source.subarray(start, start + length));
  const size = new DataView(raw.buffer, raw.byteOffset).getInt32(0xb0, true);
  if (size <= 0 || size > decrypted.length) {
    throw new PrxDecryptionError("The EBOOT's decrypted size is out of range");
  }
  return decrypted.subarray(0, size);
}

const ELF_MAGIC = [0x7f, 0x45, 0x4c, 0x46];

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Decrypts a game EBOOT to its ELF, unzipping it when it's compressed. */
export async function decryptGameEboot(raw: Uint8Array): Promise<Uint8Array> {
  let elf = decryptPrx(raw);
  if (elf[0] === 0x1f && elf[1] === 0x8b) elf = await gunzip(elf);
  if (!ELF_MAGIC.every((b, i) => elf[i] === b)) {
    throw new PrxDecryptionError("The decrypted EBOOT isn't an ELF");
  }
  return elf;
}
