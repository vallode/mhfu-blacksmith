import assert from "node:assert/strict";
import { test } from "node:test";
import { meshBlend } from "../src/models/pmo.js";

test("meshBlend reads the GE ALPHA command a mesh draws with", () => {
  assert.equal(meshBlend(0), "opaque");
  // Fur and wing membranes.
  assert.equal(meshBlend(0xdf000032), "alpha");
  // Glows: Chameleos, Lavasioth, White Fatalis's chest.
  assert.equal(meshBlend(0xdf0000a2), "add");
  assert.equal(meshBlend(0xdf0000aa), "add");
  // White Fatalis's dark head layer.
  assert.equal(meshBlend(0xdf0002aa), "revsub");
});
