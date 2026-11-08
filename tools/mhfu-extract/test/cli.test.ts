import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFlags } from "../src/cli.js";
import { assertCurrentFileNames, FILE_LIST_VERSION, type UnpackManifest } from "../src/cli/unpack.js";

test("parseFlags reads --flag value pairs", () => {
  const flags = parseFlags(["unpack", "--iso", "/path/to.iso", "--out", ".cache/mhfu"]);
  assert.deepEqual(flags, { iso: "/path/to.iso", out: ".cache/mhfu" });
});

test("parseFlags ignores non-flag leading tokens (the subcommand itself)", () => {
  const flags = parseFlags(["--a", "1", "--b", "2"]);
  assert.deepEqual(flags, { a: "1", b: "2" });
});

test("parseFlags throws when a flag is missing its value", () => {
  assert.throws(() => parseFlags(["--iso"]), /Missing value for --iso/);
  assert.throws(() => parseFlags(["--iso", "--out", "x"]), /Missing value for --iso/);
});

test("parseFlags reads --skip-eboot as a value-less boolean flag", () => {
  const flags = parseFlags(["unpack", "--iso", "/path/to.iso", "--skip-eboot", "--out", ".cache/mhfu"]);
  assert.deepEqual(flags, { iso: "/path/to.iso", "skip-eboot": "true", out: ".cache/mhfu" });
});

test("assertCurrentFileNames rejects EU unpacks named before region-aware file lists", () => {
  const base: UnpackManifest = { region: "eu", discId: "ULES01213", isoPath: "x.iso", fileCount: 6657, unpackedAt: "" };
  assert.throws(() => assertCurrentFileNames(base, ".cache/mhfu"), /unpack again/);
  assert.doesNotThrow(() => assertCurrentFileNames({ ...base, fileList: FILE_LIST_VERSION }, ".cache/mhfu"));
  // JP names never changed, so old JP unpacks stay valid.
  assert.doesNotThrow(() => assertCurrentFileNames({ ...base, region: "jp", discId: "ULJM05500" }, ".cache/mhfu"));
});
