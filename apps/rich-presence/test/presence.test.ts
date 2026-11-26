import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { readRawData } from "game-data";
import { DATA_DIR, loadNames } from "../src/names";
import { placeLabel, starLabel } from "../src/presence";

test("star levels as the boards show them", () => {
  assert.equal(starLabel("village", "low-rank", 3), "Village ★3");
  assert.equal(starLabel("village", "g-rank", 9), "Village ★9");
  assert.equal(starLabel("guild", "low-rank", 2), "Guild ★2");
  assert.equal(starLabel("guild", "high-rank", 8), "Guild ★8");
  assert.equal(starLabel("guild", "g-rank", 9), "G★1");
  assert.equal(starLabel("event", "g-rank", 10), "Event G★2");
  assert.equal(starLabel("treasure-hunting", null, 8), "Treasure Hunt");
  assert.equal(starLabel("training-school", null, 2), "Training ★2");
});

test("places: the day's maps lose their suffix, area 0 is the Base Camp", () => {
  assert.equal(placeLabel("Jungle (Day)", 5), "Jungle area 5");
  assert.equal(placeLabel("Jungle (Night)", 0), "Jungle (Night) Base Camp");
  assert.equal(placeLabel("Moat Arena", null), "Moat Arena");
  assert.equal(placeLabel(undefined, 3), undefined);
});

test("the real data names quests, monsters, weapons and maps", () => {
  const real = loadNames();
  assert.deepEqual(real.quest(10217), {
    title: "Slay the Great Kut-Ku!",
    hub: "village",
    rank: "low-rank",
  });
  assert.deepEqual(real.monster(6), { name: "Yian Kut-Ku", slug: "yian-kut-ku" });
  assert.equal(real.weapon(5, 3)?.name, "Buster Sword");
  assert.equal(real.weapon(5, 3)?.type, "great-sword");
  assert.equal(real.weapon(6, 116)?.type, "bow");
  assert.equal(real.weapon(6, 116)?.rarity, 1);
  assert.equal(real.weapon(7, 1), undefined);
  assert.equal(real.map(2), "Forest and Hills (Day)");
});

test("every monster's slug is the site's: its portrait, or its category's", () => {
  // The site names monster pages, and their pictures, slugify(English name).
  const real = loadNames();
  const images = path.join(DATA_DIR, "../apps/blacksmith/public/images/monsters");
  let own = 0;
  for (const file of readdirSync(path.join(DATA_DIR, "monsters"))) {
    for (const m of readRawData<{ monsters: { id: number }[] }>(DATA_DIR, "monsters", file)
      .monsters) {
      const slug = real.monster(m.id)?.slug;
      assert.ok(slug, `monster ${m.id} has no name`);
      if (existsSync(path.join(images, `${slug}.png`))) own++;
    }
  }
  assert.ok(own > 80, `${own} monsters have their own portrait`);
});
