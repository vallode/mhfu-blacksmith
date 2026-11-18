import assert from "node:assert/strict";
import { test } from "node:test";
import {
  decryptQuest,
  decryptQuestBlock,
  encryptQuest,
  encryptQuestBlock,
  isQuestMagic,
  QUEST_MAGIC,
  QuestCipherError,
} from "../src/quests/mib.js";

test("encryptQuestBlock / decryptQuestBlock round-trip", () => {
  const original = Buffer.from(Array.from({ length: 40 }, (_, i) => i * 11 + 5));
  for (const seeds of [
    [0, 0, 0, 0],
    [1, 2, 3, 4],
    [11103, 58277, 28826, 16509],
  ] as const) {
    const encrypted = encryptQuestBlock(original, seeds);
    assert.equal(encrypted.length, original.length + 8);
    const decrypted = decryptQuestBlock(encrypted);
    assert.deepEqual(decrypted, original, `round-trip failed for seeds=${seeds}`);
  }
});

test("decryptQuestBlock rejects a too-short or odd-length buffer", () => {
  assert.throws(() => decryptQuestBlock(Buffer.alloc(6)), QuestCipherError);
  assert.throws(() => decryptQuestBlock(Buffer.alloc(9)), QuestCipherError);
});

test("encryptQuest / decryptQuest round-trip, verifying the embedded SHA1", () => {
  // QuestCipher operates on u16 words, so the payload (like the header) must
  // be an even length.
  const body = Buffer.from("hello quest data");
  const payload = Buffer.concat([QUEST_MAGIC, body]);
  assert.equal(payload.length % 2, 0);
  for (const region of ["jp", "us", "eu"] as const) {
    const encrypted = encryptQuest(payload, region, [1, 2, 3, 4]);
    const decrypted = decryptQuest(encrypted, region);
    assert.deepEqual(decrypted, payload, `round-trip failed for region=${region}`);
    assert.equal(isQuestMagic(decrypted), true);
  }
});

test("decryptQuest throws when decrypted with the wrong region's hash salt", () => {
  const payload = Buffer.concat([QUEST_MAGIC, Buffer.from("some quest bytes")]);
  const encrypted = encryptQuest(payload, "jp", [7, 8, 9, 10]);
  assert.throws(() => decryptQuest(encrypted, "us"), QuestCipherError);
});

test("decryptQuest throws when the declared size overruns the buffer", () => {
  // A block whose XOR-decrypted size field is garbage relative to its length
  // (simulating a wrong region/offset or non-quest data) must not silently
  // slice out-of-range data.
  const body = Buffer.alloc(32);
  body.writeUInt32LE(0xffffff, 0); // absurd size
  const encrypted = encryptQuestBlock(body, [1, 1, 1, 1]);
  assert.throws(() => decryptQuest(encrypted, "jp"), QuestCipherError);
});

test("isQuestMagic distinguishes the real magic from arbitrary bytes", () => {
  assert.equal(isQuestMagic(QUEST_MAGIC), true);
  assert.equal(isQuestMagic(Buffer.concat([QUEST_MAGIC, Buffer.from("more data")])), true);
  assert.equal(isQuestMagic(Buffer.alloc(8)), false);
  assert.equal(isQuestMagic(Buffer.alloc(4)), false);
});
