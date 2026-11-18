import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { unpackEboot } from "../src/cli/eboot.js";
import { decryptEboot, EbootDecryptionError } from "../src/container/eboot.js";
import { encryptGameEboot } from "./prx-fixture.js";

const ELF_HEADER = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0]);
const PSP_HEADER = Buffer.from([0x7e, 0x50, 0x53, 0x50, 0, 0, 0, 0]);

test("decryptEboot passes through an already-decrypted ELF unchanged", async () => {
  const result = await decryptEboot(ELF_HEADER);
  assert.equal(result, ELF_HEADER);
});

test("unpackEboot reads an --eboot override path, validating it's an ELF", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mhfu-extract-test-"));
  try {
    const path = join(dir, "dump.elf");
    await writeFile(path, ELF_HEADER);
    const result = await unpackEboot(PSP_HEADER, { overridePath: path });
    assert.deepEqual(result, ELF_HEADER);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("unpackEboot rejects an override path that isn't a decrypted ELF", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mhfu-extract-test-"));
  try {
    const path = join(dir, "not-an-elf.bin");
    await writeFile(path, Buffer.from("not an elf"));
    await assert.rejects(
      () => unpackEboot(PSP_HEADER, { overridePath: path }),
      EbootDecryptionError,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("decryptEboot rejects unrecognized magic", async () => {
  await assert.rejects(() => decryptEboot(Buffer.from("nope")), EbootDecryptionError);
});

test("unpackEboot surfaces a clear error when pspdecrypt isn't found", async () => {
  await assert.rejects(
    () => unpackEboot(PSP_HEADER, { pspdecryptBin: "definitely-not-a-real-binary-xyz" }),
    (err: unknown) => {
      assert.ok(err instanceof EbootDecryptionError);
      assert.match(err.message, /not found on PATH/);
      return true;
    },
  );
});

test("decryptEboot decrypts a game EBOOT in-process, without pspdecrypt", async () => {
  const elf = Buffer.concat([ELF_HEADER, Buffer.alloc(3000, 7)]);
  const result = await unpackEboot(encryptGameEboot(elf), {
    pspdecryptBin: "definitely-not-a-real-binary-xyz",
  });
  assert.deepEqual(result, elf);
});

test("decryptEboot says why it couldn't decrypt", async () => {
  const raw = encryptGameEboot(Buffer.concat([ELF_HEADER, Buffer.alloc(100)]));
  raw.writeUInt32LE(0x12345678, 0xd0);
  await assert.rejects(
    () => decryptEboot(raw),
    /Couldn't decrypt EBOOT.BIN: Unknown EBOOT tag 0x12345678/,
  );
});
