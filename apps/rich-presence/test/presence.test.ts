import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { Hunter } from "../src/layout";
import { readRawData } from "game-data";
import { DATA_DIR, loadNames, type Names } from "../src/names";
import {
  SITE,
  activityChanged,
  buildActivity,
  placeLabel,
  starLabel,
  type Activity,
} from "../src/presence";
import type { GameState } from "../src/read";

const names: Names = {
  quest: (id) =>
    ({
      10101: { title: "Gathering - Snowy Mountains", hub: "village", rank: "low-rank" },
      10217: { title: "Slay the Great Kut-Ku!", hub: "village", rank: "low-rank" },
      3201: { title: "Tigrex Tamer", hub: "guild", rank: "g-rank" },
    })[id],
  monster: (id) =>
    ({
      6: { name: "Yian Kut-Ku", slug: "yian-kut-ku" },
      70: { name: "Tigrex", slug: "tigrex" },
    })[id],
  weapon: (table, id) =>
    table === 5 && id === 1
      ? { name: "Buster Sword", type: "great-sword", rarity: 7 }
      : table === 6 && id === 2
        ? { name: "Hunter's Bow I", type: "bow", rarity: 1 }
        : undefined,
  map: (id) =>
    ({ 2: "Forest and Hills (Day)", 6: "Jungle (Day)", 11: "Snowy Mountains (Day)" })[id],
};
const hunter: Hunter = { name: "Nito", weapon: { table: 5, id: 1 } };
const options = { now: 1_000_000, sessionStart: 5_000 };

function onQuest(
  quest: Partial<Extract<GameState, { kind: "quest" }>["quest"]>,
  more: Partial<Extract<GameState, { kind: "quest" }>> = {},
): GameState {
  return {
    kind: "quest",
    gameId: "ULES01213",
    hunter,
    quest: { id: 3201, stars: 11, map: 6, timeLimit: 90000, target: 70, delivery: false, ...quest },
    state: 0,
    timeLeft: 90000,
    stage: 0,
    area: 5,
    ...more,
  };
}

test("on a quest: the target and its picture, the area, the quest's timer", () => {
  assert.deepEqual(buildActivity(onQuest({}, { timeLeft: 90000 - 30 * 125 }), names, options), {
    details: "Hunting Tigrex",
    state: "Jungle area 5",
    timestamps: { start: 1_000_000 - 125_000 },
    assets: {
      large_image: `${SITE}/embed/presence/monster-tigrex.png`,
      large_text: "G★3 · Tigrex Tamer",
      small_image: `${SITE}/embed/presence/great-sword-rarity-7.png`,
      small_text: "Buster Sword (Great Sword)",
    },
  });
});

test("a gathering quest shows its title and the Herb", () => {
  const activity = buildActivity(
    onQuest({ id: 10101, stars: 2, map: 11, target: null, delivery: true }, { area: 0 }),
    names,
    options,
  );
  assert.equal(activity?.details, "Gathering - Snowy Mountains");
  assert.equal(activity?.state, "Snowy Mountains Base Camp");
  assert.equal(activity?.assets?.large_image, `${SITE}/embed/presence/herb.png`);
  assert.equal(activity?.assets?.large_text, "Village ★2 · Gathering - Snowy Mountains");
  assert.equal(activity?.timestamps?.start, 1_000_000);
});

test("a quest with neither a target nor a delivery shows the game's picture", () => {
  const activity = buildActivity(onQuest({ id: 10217, stars: 3, target: null }), names, options);
  assert.equal(activity?.details, "Slay the Great Kut-Ku!");
  assert.match(activity?.assets?.large_image ?? "", /felyne-icon-512\.png$/);
});

test("a quest data/ doesn't have still shows", () => {
  const activity = buildActivity(
    onQuest(
      { id: 61001, stars: 4, map: 99, target: 6 },
      { hunter: { name: "Nito", weapon: null }, timeLeft: 0, area: null },
    ),
    names,
    options,
  );
  assert.equal(activity?.details, "Hunting Yian Kut-Ku");
  assert.equal(activity?.state, "Monster Hunter Freedom Unite");
  assert.equal(activity?.assets?.large_text, "★4 · Quest 61001");
  assert.equal(activity?.assets?.small_image, undefined);
});

test("rarities 1-3 get the untinted mini", () => {
  const activity = buildActivity(
    {
      kind: "town",
      gameId: "ULES01213",
      hunter: { name: "Nito", weapon: { table: 6, id: 2 } },
      stage: 139,
    },
    names,
    options,
  );
  assert.equal(activity?.assets?.small_image, `${SITE}/embed/presence/bow-plain.png`);
  assert.equal(activity?.assets?.small_text, "Hunter's Bow I (Bow)");
});

test("in town: the place, the hunter and the session timer", () => {
  const village = buildActivity(
    { kind: "town", gameId: "ULES01213", hunter, stage: 139 },
    names,
    options,
  );
  assert.equal(village?.details, "In Pokke Village");
  assert.equal(village?.state, "Nito");
  assert.equal(village?.timestamps?.start, 5_000);
  assert.equal(village?.assets?.small_text, "Buster Sword (Great Sword)");
  const farm = buildActivity(
    { kind: "town", gameId: "ULJM05500", hunter, stage: 46 },
    names,
    options,
  );
  assert.equal(farm?.details, "At Pokke Farm");
  const hall = buildActivity(
    { kind: "town", gameId: "ULES01213", hunter, stage: 85 },
    names,
    options,
  );
  assert.equal(hall?.details, "In the Gathering Hall");
  const school = buildActivity(
    { kind: "town", gameId: "ULES01213", hunter, stage: 0 },
    names,
    options,
  );
  assert.equal(school?.details, "At the Training School");
  const unknown = buildActivity(
    { kind: "town", gameId: "ULJM05500", hunter, stage: 9999 },
    names,
    options,
  );
  assert.equal(unknown?.details, "In town");
});

test("no presence without MHFU; the menus before a hunter is loaded", () => {
  assert.equal(buildActivity({ kind: "noGame" }, names, options), null);
  assert.equal(
    buildActivity({ kind: "otherGame", gameId: "UCUS98700", title: "Other" }, names, options),
    null,
  );
  assert.equal(
    buildActivity({ kind: "menus", gameId: "ULES01213" }, names, options)?.details,
    "In the menus",
  );
});

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

test("a timer that drifts a little isn't sent again", () => {
  const a: Activity = { details: "Hunting Tigrex", timestamps: { start: 100_000 } };
  assert.equal(activityChanged(a, { ...a, timestamps: { start: 103_000 } }), false);
  assert.equal(activityChanged(a, { ...a, timestamps: { start: 110_000 } }), true);
  assert.equal(activityChanged(a, { ...a, details: "Hunting Rajang" }), true);
  assert.equal(activityChanged(null, null), false);
  assert.equal(activityChanged(a, null), true);
  assert.equal(activityChanged(null, a), true);
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
