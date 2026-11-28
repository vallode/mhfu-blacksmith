import assert from "node:assert/strict";
import { test } from "node:test";
import { enumMonsterNames, monsterNames } from "whetstone/src/names.js";

test("monsters take the disc's names where it has them, else monster.enum's", () => {
  const disc: (string | null)[] = Array.from({ length: 90 }, () => null);
  disc[86] = "Plum D.Hermitaur";
  const name = monsterNames({ monsterNames: disc });
  assert.equal(name(86), "Plum D.Hermitaur");
  assert.equal(name(1), "Monster 1"); // the disc names it nothing
  assert.equal(monsterNames({ monsterNames: null }), enumMonsterNames);
  assert.equal(enumMonsterNames(86), "Plum Daimyo Hermitaur");
});
