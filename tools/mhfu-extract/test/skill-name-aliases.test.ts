import assert from "node:assert/strict";
import { test } from "node:test";
import { loadEnums } from "../src/strings/enums.js";
import {
  canonicalDecorationSkill,
  canonicalSkillName,
  skillNameAliases,
} from "../src/overlay/skill-name-aliases.js";
import { diffFile, normalizeCommittedItem } from "../src/cli/diff.js";

const SKILL_NAMES = new Set(loadEnums().get("SkillID"));

/**
 * Pin real entries from `skill-name-aliases.json`. The armor pairs come
 * from a real EU EBOOT `extract` + `diff` (see the module doc comment).
 */
test("canonicalSkillName maps committed armor spellings to the SkillID spelling", () => {
  assert.equal(canonicalSkillName("Defence"), "Defense");
  assert.equal(canonicalSkillName("Load"), "Reload");
  assert.equal(canonicalSkillName("Fast Chrge"), "ShortCharg");
  assert.equal(canonicalSkillName("Loading"), "Capacity");
  assert.equal(canonicalSkillName("CragS Add"), "Crag S Add");
});

test("canonicalSkillName maps committed decoration typos to the SkillID spelling", () => {
  assert.equal(canonicalSkillName("Everlasting"), "Everlastng");
  assert.equal(canonicalSkillName("NormalS up"), "NormalS Up");
});

test("canonicalSkillName leaves names without an alias unchanged", () => {
  assert.equal(canonicalSkillName("Attack"), "Attack");
  assert.equal(canonicalSkillName("Defense"), "Defense");
  assert.equal(canonicalSkillName("Rage"), "Rage");
});

test("every alias targets a real SkillID name, and no alias key is one", () => {
  assert.ok(SKILL_NAMES.size > 0);
  for (const [from, to] of skillNameAliases()) {
    assert.ok(SKILL_NAMES.has(to), `alias target "${to}" (from "${from}") is not a SkillID name`);
    assert.ok(!SKILL_NAMES.has(from), `alias key "${from}" is already a SkillID name`);
  }
});

test("canonicalDecorationSkill rewrites the name and normalizes the amount spacing", () => {
  assert.equal(canonicalDecorationSkill("Load -1"), "Reload -1");
  assert.equal(canonicalDecorationSkill("NormalS Up+1"), "NormalS Up +1");
  assert.equal(canonicalDecorationSkill("Attack +3"), "Attack +3");
  assert.equal(canonicalDecorationSkill(""), "");
});

test("normalizeCommittedItem handles armor and decoration skill shapes", () => {
  assert.deepEqual(
    normalizeCommittedItem({ name: "X", skills: [{ name: "Defence", amount: 2 }] }),
    {
      name: "X",
      skills: [{ name: "Defense", amount: 2 }],
    },
  );
  assert.deepEqual(normalizeCommittedItem({ name: "Y", skills: ["Recoil +1", "Load -1"] }), {
    name: "Y",
    skills: ["Recoil +1", "Reload -1"],
  });
  const noSkills = { name: "Z", skills: null };
  assert.equal(normalizeCommittedItem(noSkills), noSkills);
});

test("diffFile ignores spelling-only skill differences but still reports amount and skill differences", () => {
  const extracted = {
    armor: [
      {
        name: "Same",
        skills: [
          { name: "Defense", amount: 3 },
          { name: "Reload", amount: 2 },
        ],
      },
      { name: "Amount", skills: [{ name: "Defense", amount: 3 }] },
      { name: "Other", skills: [{ name: "Attack", amount: 3 }] },
    ],
  };
  const committed = {
    armor: [
      {
        name: "Same",
        skills: [
          { name: "Defence", amount: 3 },
          { name: "Load", amount: 2 },
        ],
      },
      { name: "Amount", skills: [{ name: "Defence", amount: 2 }] },
      { name: "Other", skills: [{ name: "Defence", amount: 3 }] },
    ],
  };
  const result = diffFile("armor/helmet.json", extracted, committed);
  assert.deepEqual(
    result.fieldMismatches.map((m) => m.itemKey),
    ["Amount", "Other"],
  );
});
