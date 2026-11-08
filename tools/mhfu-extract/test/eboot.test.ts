import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { decryptEboot, EbootDecryptionError } from "../src/container/eboot.js";

const ELF_HEADER = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0]);
const PSP_HEADER = Buffer.from([0x7e, 0x50, 0x53, 0x50, 0, 0, 0, 0]);

test("decryptEboot passes through an already-decrypted ELF unchanged", async () => {
  const result = await decryptEboot(ELF_HEADER);
  assert.equal(result, ELF_HEADER);
});

test("decryptEboot reads an --eboot override path, validating it's an ELF", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mhfu-extract-test-"));
  try {
    const path = join(dir, "dump.elf");
    await writeFile(path, ELF_HEADER);
    const result = await decryptEboot(PSP_HEADER, { overridePath: path });
    assert.deepEqual(result, ELF_HEADER);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("decryptEboot rejects an override path that isn't a decrypted ELF", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mhfu-extract-test-"));
  try {
    const path = join(dir, "not-an-elf.bin");
    await writeFile(path, Buffer.from("not an elf"));
    await assert.rejects(
      () => decryptEboot(PSP_HEADER, { overridePath: path }),
      EbootDecryptionError,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("decryptEboot rejects unrecognized magic", async () => {
  await assert.rejects(() => decryptEboot(Buffer.from("nope")), EbootDecryptionError);
});

test("decryptEboot surfaces a clear error when pspdecrypt isn't found", async () => {
  await assert.rejects(
    () => decryptEboot(PSP_HEADER, { pspdecryptBin: "definitely-not-a-real-binary-xyz" }),
    (err: unknown) => {
      assert.ok(err instanceof EbootDecryptionError);
      assert.match(err.message, /not found on PATH/);
      return true;
    },
  );
});
