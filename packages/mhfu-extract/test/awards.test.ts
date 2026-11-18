/** The Guild Card awards' text (strings/awards.ts). */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AWARD_COUNT,
  AWARD_DESCRIPTION_ENTRY,
  AWARD_NAME_ENTRY,
  AwardTextError,
  awardLine,
  readAwardText,
} from "../src/strings/awards.js";
import type { MessageTable } from "../src/strings/messages.js";

/** A message file's tables, table 0 holding `entries` at their indexes and filler elsewhere. */
function awardTables(entries: Record<number, string>, length: number): MessageTable[] {
  const strings = Array.from({ length }, (_, i) => ({
    offset: i,
    bytes: Buffer.from(entries[i] ?? `filler ${i}`, "utf8"),
  }));
  return [{ offset: 0, strings }];
}

/** Award names or descriptions from `first` on: `<label> <n>`. */
function awardEntries(first: number, label: string): Record<number, string> {
  return Object.fromEntries(
    Array.from({ length: AWARD_COUNT }, (_, n) => [first + n, `${label} ${n}`]),
  );
}

test("reads the 48 names and descriptions, in award order", () => {
  const awards = readAwardText(
    awardTables(awardEntries(AWARD_NAME_ENTRY, "Name"), 1442),
    awardTables(awardEntries(AWARD_DESCRIPTION_ENTRY, "About"), 1963),
    "en",
  );
  assert.equal(awards.length, AWARD_COUNT);
  assert.deepEqual(awards[0], { id: 0, name: "Name 0", description: "About 0" });
  assert.deepEqual(awards[47], { id: 47, name: "Name 47", description: "About 47" });
});

test("joins the game's lines and drops their padding", () => {
  const line = (text: string, language: "en" | "de" = "en") =>
    awardLine(Buffer.from(text), language);
  assert.equal(
    line("Proof of slaying a Kirin.\n  Retains   the\nbeauty"),
    "Proof of slaying a Kirin. Retains the beauty",
  );
  // A word's own hyphen at a break stays, without the break.
  assert.equal(line("A mysterious-\nsounding bell"), "A mysterious-sounding bell");
  // German also breaks between syllables, which joins the word; before a capital it's a compound.
  assert.equal(line("Versamm-\nlungshalle", "de"), "Versammlungshalle");
  assert.equal(line("Machalit-\nErz.", "de"), "Machalit-Erz.");
  // A hyphen with a space before the break is a word left open: "...hallen- und".
  assert.equal(line("Versammlungshallen- \nund", "de"), "Versammlungshallen- und");
});

test("refuses files that don't hold the text", () => {
  const names = awardTables(awardEntries(AWARD_NAME_ENTRY, "Name"), 1442);
  assert.throws(
    () => readAwardText(names, awardTables({}, AWARD_DESCRIPTION_ENTRY + 10), "en"),
    AwardTextError,
  );
  assert.throws(() => readAwardText(names, null, "en"), AwardTextError);
  const blank = awardTables({ ...awardEntries(AWARD_DESCRIPTION_ENTRY, "About"), 1730: " " }, 1963);
  assert.throws(() => readAwardText(names, blank, "en"), /award 4 has no description/);
});
