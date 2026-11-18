import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import * as shim from "../shims/crypto.js";

test("the browser build's SHA-1 and SHA-256 match Node's", () => {
  // Lengths around the 64-byte block and its 55/56-byte padding edge.
  const lengths = [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 70_000];
  for (const length of lengths) {
    const data = Buffer.from(Array.from({ length }, (_, i) => (i * 31 + length) & 0xff));
    for (const algorithm of ["sha1", "sha256"] as const) {
      const expected = createHash(algorithm).update(data).digest("hex");
      assert.equal(
        shim.createHash(algorithm).update(data).digest("hex"),
        expected,
        `${algorithm} of ${length} bytes`,
      );
    }
  }
  // As the seeded RNG uses it: a string, in parts.
  assert.equal(
    shim.createHash("sha256").update("randomfu/6/", "utf8").update("SEED").digest("hex"),
    createHash("sha256").update("randomfu/6/SEED").digest("hex"),
  );
  assert.throws(() => shim.createHash("md5"), /only has sha1 and sha256/);
});
