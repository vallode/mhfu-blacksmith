import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractSignature,
  findAllOccurrences,
  SignatureResolver,
  StaticOffsetResolver,
  TableResolutionError,
  verifyResolverCoverage,
} from "../src/tables/resolver.js";

test("StaticOffsetResolver rebases a table's virtual address against baseAddress", () => {
  const resolver = new StaticOffsetResolver(0x1000, { foo: 0x1040, bar: 0x2000 });
  assert.equal(resolver.resolve("foo"), 0x40);
  assert.equal(resolver.resolve("bar"), 0x1000);
});

test("StaticOffsetResolver throws for an unknown table", () => {
  const resolver = new StaticOffsetResolver(0x1000, { foo: 0x1040 });
  assert.throws(() => resolver.resolve("nonexistent"), TableResolutionError);
});

test("findAllOccurrences finds every match, including overlapping-adjacent ones", () => {
  const buf = Buffer.from("aabbaaccaadd", "hex");
  assert.deepEqual(findAllOccurrences(buf, Buffer.from("aa", "hex")), [0, 2, 4]);
  assert.deepEqual(findAllOccurrences(buf, Buffer.from("ffff", "hex")), []);
});

test("findAllOccurrences rejects an empty needle rather than matching every offset", () => {
  assert.throws(() => findAllOccurrences(Buffer.alloc(10), Buffer.alloc(0)), TableResolutionError);
});

test("SignatureResolver resolves a table by finding its unique signature and subtracting signatureOffset", () => {
  const signature = Buffer.from("deadbeef", "hex");
  const buf = Buffer.concat([Buffer.alloc(100, 0), signature, Buffer.alloc(50, 0)]);
  // signatureOffset=4 means the signature starts 4 bytes into the table.
  const resolver = new SignatureResolver({ myTable: { signature, signatureOffset: 4 } });
  assert.equal(resolver.resolve("myTable", buf), 96);
});

test("SignatureResolver throws for a table with no registered signature", () => {
  const resolver = new SignatureResolver({});
  assert.throws(
    () => resolver.resolve("myTable", Buffer.alloc(10)),
    (err: unknown) => {
      assert.ok(err instanceof TableResolutionError);
      assert.match(err.message, /no signature registered/);
      return true;
    },
  );
});

test("SignatureResolver throws if called without a buffer", () => {
  const signature = Buffer.from("deadbeef", "hex");
  const resolver = new SignatureResolver({ myTable: { signature, signatureOffset: 0 } });
  assert.throws(
    () => resolver.resolve("myTable"),
    (err: unknown) => {
      assert.ok(err instanceof TableResolutionError);
      assert.match(err.message, /requires a buffer/);
      return true;
    },
  );
});

test("SignatureResolver throws when the signature isn't found (0 matches)", () => {
  const signature = Buffer.from("deadbeef", "hex");
  const resolver = new SignatureResolver({ myTable: { signature, signatureOffset: 0 } });
  assert.throws(
    () => resolver.resolve("myTable", Buffer.alloc(100, 0)),
    (err: unknown) => {
      assert.ok(err instanceof TableResolutionError);
      assert.match(err.message, /0 matches/);
      return true;
    },
  );
});

test("SignatureResolver throws when the signature is ambiguous (2+ matches)", () => {
  const signature = Buffer.from("deadbeef", "hex");
  const buf = Buffer.concat([signature, Buffer.alloc(20, 0), signature]);
  const resolver = new SignatureResolver({ myTable: { signature, signatureOffset: 0 } });
  assert.throws(
    () => resolver.resolve("myTable", buf),
    (err: unknown) => {
      assert.ok(err instanceof TableResolutionError);
      assert.match(err.message, /ambiguous \(2 matches/);
      return true;
    },
  );
});

test("extractSignature derives a signature from a known-good buffer via an existing resolver", () => {
  const knownGoodBuf = Buffer.concat([
    Buffer.alloc(16, 0),
    Buffer.from("cafef00dbaadf00d", "hex"),
    Buffer.alloc(8, 0),
  ]);
  const knownGoodResolver = new StaticOffsetResolver(0, { myTable: 16 });

  const sig = extractSignature(knownGoodBuf, knownGoodResolver, "myTable", 4, 0);
  assert.equal(sig.signature.toString("hex"), "cafef00d");
  assert.equal(sig.signatureOffset, 0);

  // The derived signature must actually round-trip through SignatureResolver
  // against a *different* buffer with the same table shifted elsewhere.
  const otherBuf = Buffer.concat([Buffer.alloc(200, 0xff), Buffer.from("cafef00dbaadf00d", "hex")]);
  const resolver = new SignatureResolver({ myTable: sig });
  assert.equal(resolver.resolve("myTable", otherBuf), 200);
});

test("verifyResolverCoverage reports ok:true with per-table offsets when every table resolves", () => {
  const resolver = new StaticOffsetResolver(0x1000, { foo: 0x1040, bar: 0x2000 });
  const result = verifyResolverCoverage(resolver, ["foo", "bar"], Buffer.alloc(1));
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.checks.map((c) => c.ok),
    [true, true],
  );
  assert.match(result.checks[0]!.detail, /^0x40$/);
});

test("verifyResolverCoverage reports ok:false and includes the underlying error when a table fails to resolve", () => {
  const resolver = new StaticOffsetResolver(0x1000, { foo: 0x1040 });
  const result = verifyResolverCoverage(resolver, ["foo", "missing"], Buffer.alloc(1));
  assert.equal(result.ok, false);
  assert.equal(result.checks[0]!.ok, true);
  assert.equal(result.checks[1]!.ok, false);
  assert.match(result.checks[1]!.detail, /no known address/);
});

test("extractSignature supports a non-zero signatureOffset", () => {
  const knownGoodBuf = Buffer.concat([Buffer.alloc(16, 0), Buffer.from("cafef00dbaadf00d", "hex")]);
  const knownGoodResolver = new StaticOffsetResolver(0, { myTable: 16 });

  // Take the signature from 4 bytes into the table, not its start.
  const sig = extractSignature(knownGoodBuf, knownGoodResolver, "myTable", 4, 4);
  assert.equal(sig.signature.toString("hex"), "baadf00d");
  assert.equal(sig.signatureOffset, 4);

  const resolver = new SignatureResolver({ myTable: sig });
  assert.equal(resolver.resolve("myTable", knownGoodBuf), 16);
});
