import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { parseFlags } from "../src/cli.js";
import { cachePaths, defaultDataDir, defaultDisc } from "../src/cli/paths.js";
import {
  assertCurrentFileNames,
  FILE_LIST_VERSION,
  type UnpackManifest,
} from "../src/cli/unpack.js";

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
  const flags = parseFlags([
    "unpack",
    "--iso",
    "/path/to.iso",
    "--skip-eboot",
    "--out",
    ".cache/mhfu",
  ]);
  assert.deepEqual(flags, { iso: "/path/to.iso", "skip-eboot": "true", out: ".cache/mhfu" });
});

test("cachePaths default to this package's .cache", () => {
  const cache = cachePaths({});
  assert.ok(cache.root.endsWith(path.join("packages", "mhfu-extract", ".cache")));
  assert.equal(cache.unpacked, path.join(cache.root, "mhfu"));
  assert.equal(cache.extracted, path.join(cache.root, "mhfu", "extracted"));
  assert.equal(cache.dlc, path.join(cache.root, "dlc", "ULES01213.ini"));
});

test("cachePaths follows MHFU_CACHE", () => {
  const shared = path.resolve("/tmp/shared-mhfu-cache");
  const cache = cachePaths({ MHFU_CACHE: shared });
  assert.equal(cache.root, shared);
  assert.equal(cache.unpacked, path.join(shared, "mhfu"));
  assert.equal(cache.extracted, path.join(shared, "mhfu", "extracted"));
});

test("defaultDisc reads MHFU_DISC, then MHFU_ISO", () => {
  assert.equal(defaultDisc({ MHFU_DISC: "/discs/mhfu.iso" }), "/discs/mhfu.iso");
  assert.equal(defaultDisc({ MHFU_ISO: "/discs/other.iso" }), "/discs/other.iso");
  assert.equal(defaultDisc({ MHFU_DISC: "  " }), undefined);
  assert.equal(defaultDisc({}), undefined);
});

test("defaultDataDir is the repository's data directory", () => {
  assert.ok(path.isAbsolute(defaultDataDir()));
  assert.equal(path.basename(defaultDataDir()), "data");
});

test("assertCurrentFileNames rejects EU unpacks named before region-aware file lists", () => {
  const base: UnpackManifest = {
    region: "eu",
    discId: "ULES01213",
    isoPath: "x.iso",
    fileCount: 6657,
    unpackedAt: "",
  };
  assert.throws(() => assertCurrentFileNames(base, ".cache/mhfu"), /unpack again/);
  assert.doesNotThrow(() =>
    assertCurrentFileNames({ ...base, fileList: FILE_LIST_VERSION }, ".cache/mhfu"),
  );
  // JP names never changed, so old JP unpacks stay valid.
  assert.doesNotThrow(() =>
    assertCurrentFileNames({ ...base, region: "jp", discId: "ULJM05500" }, ".cache/mhfu"),
  );
});
