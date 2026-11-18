import assert from "node:assert/strict";
import { test } from "node:test";
import { cn } from "../src/lib/cn";

test("cn keeps a type-scale size beside a text colour", () => {
  assert.equal(cn("text-main text-gold"), "text-main text-gold");
  assert.equal(cn("text-fine", "text-negative"), "text-fine text-negative");
});

test("cn lets a later type-scale size replace an earlier one", () => {
  assert.equal(cn("text-main text-white", "text-small"), "text-white text-small");
});
