import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFlags } from "../src/cli.js";

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
