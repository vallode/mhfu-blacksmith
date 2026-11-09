/**
 * Builds a "~PSP" game EBOOT around an ELF by running decryptPrx's steps
 * backwards, for tests: no real EBOOT is ever committed. The KIRK 1 CMAC,
 * which decryptPrx doesn't check, is left as zeros.
 */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { cbcEncrypt } from "../src/container/aes.js";
import {
  GAME_TAG_KEYS,
  KEYVAULT_5D,
  KIRK1_KEY,
  PSP_MAGIC,
  TAG_CODE,
  expandSeed,
} from "../src/container/prx.js";

export interface EncryptOptions {
  tag?: number;
  /** Gzip the ELF first and set comp_attribute bit 0, as compressed EBOOTs do. */
  compress?: boolean;
}

export function encryptGameEboot(elf: Uint8Array, options: EncryptOptions = {}): Buffer {
  const tag = options.tag ?? 0xd91609f0;
  const tagKey = GAME_TAG_KEYS.get(tag)!;
  const payload = options.compress ? new Uint8Array(gzipSync(elf)) : elf;
  const dataSize = payload.length;
  const dataOffset = 0x80;
  const padded = new Uint8Array((dataSize + 15) & ~15);
  padded.set(payload);

  // KIRK 1: a made-up module key, encrypted under the KIRK 1 key, then the data under it.
  const aesKey = Uint8Array.from({ length: 16 }, (_, i) => (i * 37 + 11) & 0xff);
  const header = new Uint8Array(0x90);
  header.set(cbcEncrypt(KIRK1_KEY, new Uint8Array([...aesKey, ...new Uint8Array(16)])));
  const metadata = new Uint8Array(0x10);
  const view = new DataView(metadata.buffer);
  view.setUint32(0, dataSize, true);
  view.setUint32(4, dataOffset, true);

  const raw = Buffer.alloc(0x150 + padded.length);
  raw.set(PSP_MAGIC, 0);
  raw.writeUInt16LE(options.compress ? 1 : 0, 6);
  raw.write("randomfu test", 0x0a, "latin1");
  raw.writeUInt32LE(dataSize, 0x28);
  raw.set(metadata, 0xb0); // also the decrypted size at 0xB0
  raw.writeUInt32LE(tag, 0xd0);
  raw.set(cbcEncrypt(aesKey, padded), 0x150);

  // The masked KIRK header: XOR, KIRK 4 (encrypt), XOR, the reverse of decryptPrx.
  const xor = expandSeed(tagKey, TAG_CODE);
  const block = new Uint8Array(0x40);
  for (let i = 0; i < 0x40; i++) block[i] = header[i]! ^ xor[0x50 + i]!;
  const kirkHeader = cbcEncrypt(KEYVAULT_5D, block);
  for (let i = 0; i < 0x40; i++) kirkHeader[i]! ^= xor[0x10 + i]!;

  // The SHA-1 over the plain header pieces, then id, SHA-1 and most of the KIRK
  // header encrypted together as decryptPrx's single KIRK 7 call expects.
  const id = Uint8Array.from({ length: 16 }, (_, i) => i);
  const hash = createHash("sha1")
    .update(raw.subarray(0xd0, 0xd4))
    .update(xor.subarray(0, 0x10))
    .update(new Uint8Array(0x58))
    .update(id)
    .update(kirkHeader)
    .update(metadata)
    .update(raw.subarray(0, 0x80))
    .digest();
  const plain = new Uint8Array([...id, ...hash, ...kirkHeader.subarray(0, 0x3c)]);
  const encrypted = cbcEncrypt(KEYVAULT_5D, plain);
  const storedHeader = new Uint8Array([
    ...encrypted.subarray(0x24, 0x60),
    ...kirkHeader.subarray(0x3c),
  ]);
  raw.set(encrypted.subarray(0, 0x10), 0x140);
  raw.set(encrypted.subarray(0x10, 0x24), 0x12c);
  raw.set(storedHeader.subarray(0, 0x30), 0x80);
  raw.set(storedHeader.subarray(0x30, 0x40), 0xc0);
  return raw;
}
