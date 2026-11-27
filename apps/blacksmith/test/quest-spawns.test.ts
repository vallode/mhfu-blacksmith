/** The Map tab's monster grouping (src/lib/quest-spawns.ts). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { areaMonsters, leadSpawn, spawnAreas } from "../src/lib/quest-spawns";
import type { QuestSpawn } from "../src/lib/quests";

function spawn(name: string, overrides: Partial<QuestSpawn> = {}): QuestSpawn {
  return {
    monster: { name, href: null },
    kind: "small",
    area: 1,
    x: 10,
    y: 20,
    quantity: 1,
    endless: false,
    ...overrides,
  };
}

test("areaMonsters sums a species' records, large monsters first and then by quantity", () => {
  const monsters = areaMonsters([
    spawn("Giaprey", { quantity: 2 }),
    spawn("Giaprey", { quantity: 3 }),
    spawn("Vespoid", { quantity: 10 }),
    spawn("Giadrome", { kind: "large", quantity: 1 }),
  ]);
  assert.deepEqual(
    monsters.map((m) => [m.spawn.monster.name, m.quantity, m.endless]),
    [
      ["Giadrome", 1, false],
      ["Vespoid", 10, false],
      ["Giaprey", 5, false],
    ],
  );
});

test("areaMonsters keeps an endless record out of the count", () => {
  const [monster] = areaMonsters([
    spawn("Giaprey", { quantity: 99, endless: true }),
    spawn("Giaprey", { quantity: 2 }),
  ]);
  assert.equal(monster!.endless, true);
  assert.equal(monster!.quantity, 2);
});

test("leadSpawn prefers a large monster, then the most plentiful one", () => {
  assert.equal(
    leadSpawn([spawn("Giaprey", { quantity: 10 }), spawn("Giadrome", { kind: "large" })]).monster
      .name,
    "Giadrome",
  );
  assert.equal(
    leadSpawn([spawn("Giaprey", { quantity: 2 }), spawn("Vespoid", { quantity: 8 })]).monster.name,
    "Vespoid",
  );
});

test("spawnAreas makes one marker per area, in area order, at its lead spawn's point", () => {
  const areas = spawnAreas([
    spawn("Giaprey", { area: 2, x: 30, y: 40, quantity: 2 }),
    spawn("Giadrome", { area: 2, x: 80, y: 90, kind: "large" }),
    spawn("Popo", { area: 1, x: 5, y: 6, quantity: 3 }),
  ]);
  assert.deepEqual(
    areas.map((area) => [area.area, area.x, area.y, area.monsters.length]),
    [
      [1, 5, 6, 1],
      [2, 80, 90, 2],
    ],
  );
  assert.deepEqual(spawnAreas([]), []);
});
