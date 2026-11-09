import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { test } from "node:test";
import { cbcDecrypt, cbcEncrypt } from "../src/container/aes.js";
import {
  GAME_TAG_KEYS,
  PrxDecryptionError,
  decryptGameEboot,
  decryptPrx,
} from "../src/container/prx.js";
import { encryptGameEboot } from "./prx-fixture.js";

const ZERO_IV = Buffer.alloc(16);

test("AES-128-CBC matches Node's, both ways", () => {
  for (const blocks of [1, 2, 9, 64]) {
    const key = randomBytes(16);
    const data = randomBytes(blocks * 16);
    const cipher = createCipheriv("aes-128-cbc", key, ZERO_IV).setAutoPadding(false);
    const expected = Buffer.concat([cipher.update(data), cipher.final()]);
    assert.deepEqual(Buffer.from(cbcEncrypt(key, data)), expected);
    const decipher = createDecipheriv("aes-128-cbc", key, ZERO_IV).setAutoPadding(false);
    const plain = Buffer.concat([decipher.update(expected), decipher.final()]);
    assert.deepEqual(Buffer.from(cbcDecrypt(key, expected)), plain);
  }
});

test("AES-128 matches the FIPS-197 test vector", () => {
  const hex = (s: string) => Buffer.from(s, "hex");
  const out = cbcEncrypt(
    hex("000102030405060708090a0b0c0d0e0f"),
    hex("00112233445566778899aabbccddeeff"),
  );
  assert.equal(Buffer.from(out).toString("hex"), "69c4e0d86a7b0430d8cdb78070b4c55a");
});

/** A small ELF-looking payload: the magic and some varied bytes. */
function fakeElf(size: number): Buffer {
  const elf = Buffer.alloc(size);
  for (let i = 0; i < size; i++) elf[i] = (i * 31 + (i >> 8)) & 0xff;
  elf.set([0x7f, 0x45, 0x4c, 0x46]);
  return elf;
}

test("decryptGameEboot opens a game EBOOT for every known tag", async () => {
  const elf = fakeElf(5000);
  for (const tag of GAME_TAG_KEYS.keys()) {
    const out = await decryptGameEboot(encryptGameEboot(elf, { tag }));
    assert.deepEqual(Buffer.from(out), elf, `tag 0x${tag.toString(16)}`);
  }
});

test("decryptGameEboot unzips a compressed EBOOT", async () => {
  const elf = fakeElf(200_000);
  const raw = encryptGameEboot(elf, { compress: true });
  assert.ok(raw.length < elf.length);
  assert.deepEqual(Buffer.from(await decryptGameEboot(raw)), elf);
});

test("decryptPrx refuses unknown tags, damaged headers and non-modules", () => {
  const raw = encryptGameEboot(fakeElf(1000));
  const unknown = Buffer.from(raw);
  unknown.writeUInt32LE(0x12345678, 0xd0);
  assert.throws(() => decryptPrx(unknown), /Unknown EBOOT tag 0x12345678/);

  const damaged = Buffer.from(raw);
  damaged[0x12c]! ^= 1;
  assert.throws(() => decryptPrx(damaged), /header check failed/);

  assert.throws(() => decryptPrx(fakeElf(1000)), PrxDecryptionError);
  assert.throws(() => decryptPrx(raw.subarray(0, 0x100)), PrxDecryptionError);
});
