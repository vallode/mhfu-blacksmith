import assert from "node:assert/strict";
import { test } from "node:test";
import { monsterName, useDiscMonsterNames } from "../src/names.js";

test("monsters take the disc's names where it has them, else monster.enum's", () => {
  const names: (string | null)[] = Array.from({ length: 90 }, () => null);
  names[86] = "Plum D.Hermitaur";
  try {
    useDiscMonsterNames({ monsterNames: names });
    assert.equal(monsterName(86), "Plum D.Hermitaur");
    assert.equal(monsterName(1), "Monster 1"); // the disc names it nothing
  } finally {
    useDiscMonsterNames({ monsterNames: null });
  }
  assert.equal(monsterName(86), "Plum Daimyo Hermitaur");
});
