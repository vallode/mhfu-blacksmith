/**
 * Parses a real MHFU save (test/fixtures/MHP2NDG.BIN, a US/EU PPSSPP save that
 * still has the PSP hardware layer) through the site's own save worker, and
 * checks every item ID it contains against data/items.json.
 *
 * The worker is loaded as-is: `self` is stubbed so its `onmessage` handler can
 * be called directly and its `postMessage` result captured.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { before, test } from "node:test";
import type { CharacterResult, WorkerResult } from "../src/hooks/useSaveWorker";
import { AWARDS, awardProgress } from "../src/lib/awards";
import { lookFromSave } from "../src/lib/hunter-look";
import type { ItemRecord } from "../src/lib/items";
import { MONSTER_GAME_IDS, monsterGameId } from "../src/lib/monster-ids";
import { DATA_DIR } from "../src/lib/paths";
import { HR_URGENT_QUESTS, hunterRankFrom } from "../src/lib/hunter-rank";
import { AWARD_RECORD_KEYS, getSave, saveFromCharacter, setSave } from "../src/lib/save-store";
import { readData } from "game-data";

const root = path.resolve(__dirname, "..");
const SAVE = path.join(root, "test/fixtures/MHP2NDG.BIN");

type Message = WorkerResult | { ok: false; error: string };
type Handler = (e: { data: { buffer: ArrayBuffer; region: string } }) => Promise<void>;

let onmessage: Handler;
let lastMessage: Message | null = null;
/** The worker's last result (read through a function so TS doesn't narrow it to null). */
const message = (): Message => {
  assert.ok(lastMessage, "worker posted no result");
  return lastMessage;
};

before(async () => {
  (globalThis as unknown as { self: object }).self = {
    postMessage: (m: Message) => {
      lastMessage = m;
    },
  };
  await import("../public/javascript/save-worker.js");
  onmessage = (globalThis as unknown as { self: { onmessage: Handler } }).self.onmessage;
});

async function parse(region: string): Promise<Message> {
  const buf = fs.readFileSync(SAVE);
  const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  lastMessage = null;
  await onmessage({ data: { buffer, region } });
  assert.ok(lastMessage, "worker posted no result");
  return lastMessage;
}

function ok(m: Message): WorkerResult {
  assert.equal(m.ok, true, m.ok ? "" : (m as { error: string }).error);
  return m as WorkerResult;
}

const items = new Map(
  (readData(DATA_DIR, "items.json").items as ItemRecord[]).map((i) => [i.id, i]),
);
const name = (id: number) => items.get(id)?.name;

test("decrypts both layers and finds the two hunters", async () => {
  const r = ok(await parse("us"));
  assert.equal(r.decrypted, true);
  const [a, b, c] = r.characters;
  assert.equal(c, null, "slot 3 is empty");
  assert.deepEqual(
    [a, b].map(
      (h) =>
        h && [
          h.name,
          h.sex,
          h.zenny,
          h.playTime,
          h.hunterRank,
          h.equipBox.length,
          h.itemChest.length,
          h.itemPouch.length,
        ],
    ),
    [
      ["Gideon", "Male", 1223209, 19087, 9, 79, 914, 15],
      ["MEARO", "Male", 9999999, 2840, 9, 16, 999, 14],
    ],
  );
});

test("the look picked at character creation", async () => {
  const r = ok(await parse("us"));
  const [gideon, mearo] = r.characters as CharacterResult[];
  assert.deepEqual(gideon!.look, { clothing: 1, face: 0, hair: 10, hairColor: 0xff485c7c });
  assert.deepEqual(mearo!.look, { clothing: 4, face: 3, hair: 14, hairColor: 0xff595d65 });
  // The game's 0xAABBGGRR, as the viewer's RGB: brown and grey.
  assert.equal(lookFromSave(gideon!.look).hairColor, 0x7c5c48);
  assert.equal(lookFromSave(mearo!.look).hairColor, 0x655d59);
});

test("EU uses the same keys as US", async () => {
  const us = ok(await parse("us"));
  const eu = ok(await parse("eu"));
  assert.deepEqual(eu.characters, us.characters);
});

test("pouch items resolve to the expected names", async () => {
  const [gideon] = ok(await parse("us")).characters as CharacterResult[];
  assert.deepEqual(
    gideon.itemPouch.map((s) => [name(s.id), s.qty]),
    [
      ["Potion", 10],
      ["Mega Potion", 10],
      ["Power Juice", 5],
      ["Mega Juice", 5],
      ["Cool Drink", 5],
      ["Hot Drink", 5],
      ["Psychoserum", 3],
      ["Max Potion", 2],
      ["Ancient Potion", 1],
      ["Paralyze Thr Knf", 5],
      ["Paintball", 95],
      ["Flash Bomb", 5],
      ["Farcaster", 1],
      ["Whetstone", 20],
      ["Map", 1],
    ],
  );
});

test("every item ID in the save is in data/items.json", async () => {
  const r = ok(await parse("us"));
  for (const h of r.characters) {
    if (!h) continue;
    for (const s of [...h.itemChest, ...h.itemPouch]) {
      assert.ok(items.has(s.id), `${h.name}: item ID ${s.id} is not in data/items.json`);
      assert.ok(s.qty >= 1 && s.qty <= 99, `${h.name}: item ${s.id} has qty ${s.qty}`);
    }
  }
});

test("the only unnamed IDs are the known placeholders", async () => {
  const r = ok(await parse("us"));
  const placeholders = new Set<number>();
  for (const h of r.characters) {
    for (const s of [...(h?.itemChest ?? []), ...(h?.itemPouch ?? [])]) {
      if (items.get(s.id)?.placeholder) placeholders.add(s.id);
    }
  }
  // This save has every item at x99, so the three padding IDs are in it too.
  assert.deepEqual(
    [...placeholders].sort((x, y) => x - y),
    [128, 465, 875],
  );
});

test("the region is detected from the keys, whatever the hint", async () => {
  assert.equal(ok(await parse("us")).region, "us");
  const r = ok(await parse("jp"));
  assert.equal(r.region, "us", "JP keys fail on a US/EU save, so the other keyset is tried");
  assert.deepEqual(
    r.characters.map((h) => h?.name ?? null),
    ["Gideon", "MEARO", null],
  );
});

test("the region is also detected when only the game layer is left", async () => {
  // Strip the PSP hardware layer first (as PPSSPP's default export does).
  const { decryptPSPLayer } = await import("../public/javascript/save-cipher.js");
  const buf = fs.readFileSync(SAVE);
  const gameOnly: ArrayBuffer = await decryptPSPLayer(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    "na",
  );
  assert.equal(gameOnly.byteLength, 0x16a100);

  lastMessage = null;
  await onmessage({ data: { buffer: gameOnly.slice(0), region: "us" } });
  assert.deepEqual(
    ok(message()).characters.map((h) => h?.name ?? null),
    ["Gideon", "MEARO", null],
  );

  lastMessage = null;
  await onmessage({ data: { buffer: gameOnly.slice(0), region: "jp" } });
  assert.equal(ok(message()).region, "us");
});

test("a file no region can decrypt says so", async () => {
  const junk = new Uint8Array(0x16a110);
  for (let i = 0; i < junk.length; i++) junk[i] = (i * 2654435761) >>> 24;
  lastMessage = null;
  await onmessage({ data: { buffer: junk.buffer, region: "us" } });
  assert.equal(message().ok, false);
  assert.match(
    (message() as { error: string }).error,
    /couldn't be decrypted with any region's keys/,
  );
});

// Equipment box slots resolve through data/equipment-ids.json (by equip type code).
const equipmentIds = readData(DATA_DIR, "equipment-ids.json") as Record<
  string,
  ({ name: string; type?: string } | null)[]
>;
const EQUIP_SLOTS = ["leggings", "helmet", "plate", "gauntlets", "waist", "melee", "ranged"];
const equipName = (s: { type: number; id: number }) =>
  equipmentIds[EQUIP_SLOTS[s.type]]?.[s.id]?.name;

test("every equipment box slot resolves to an item", async () => {
  for (const h of ok(await parse("us")).characters) {
    for (const s of h?.equipBox ?? []) {
      assert.ok(equipName(s), `${h!.name}: equip type ${s.type} ID ${s.id} has no item`);
    }
  }
});

test("equipment IDs line up: a starter kit, and whole armor sets across all five slots", async () => {
  const [gideon, mearo] = ok(await parse("us")).characters as CharacterResult[];
  // A fresh hunter's box: one bone weapon per class plus the Mafumofu set.
  assert.deepEqual(mearo.equipBox.map(equipName), [
    "Bone Blade",
    "Large Bone",
    "Bone Club",
    "Ivory Horn",
    "Longhorn",
    "Bone Gunlance",
    "Bone Kris",
    "Bone Scythe",
    "Shooter's Barrel",
    "Bone Shooter",
    "Hunter's Bow I",
    "Mafumofu Hood",
    "Mafumofu Jacket",
    "Mafumofu Mittens",
    "Mafumofu Coat",
    "Mafumofu Boots",
  ]);
  // Each slot's ID table is separate, so a misaligned table would break these sets up.
  const armor = gideon.equipBox.filter((s) => s.type <= 4).map(equipName);
  for (const set of [
    [
      "Ucamulbas Mask",
      "Ucamulbas Aegis",
      "Ucamulbas Claw",
      "Ucamulbas Cincture",
      "Ucamulbas Hessian",
    ],
    [
      "Empress Crown X",
      "Empress Mail X",
      "Empress Vambraces X",
      "Empress Tasset X",
      "Empress Greaves X",
    ],
    [
      "Dark Akantor Mask",
      "Dark Akantor Aegis",
      "Dark Akantor Claw",
      "DarkAkantor Cincture",
      "Dark Akantor Hessian",
    ],
  ]) {
    for (const piece of set)
      assert.ok(armor.includes(piece), `Gideon's box should include ${piece}`);
  }
});

// Decorations: bytes 6–11 of each equipment slot hold up to three jewel item IDs.
const decorationSlots = new Map(
  (
    readData(DATA_DIR, "decorations.json").decorations as {
      name: string;
      slots: number;
    }[]
  ).map((d) => [d.name, Number(d.slots)]),
);
/** Slot count of an equipment box piece, from data/weapons or data/armor. */
const pieceSlots = (() => {
  const bySlot = new Map<string, Map<string, number>>();
  const add = (key: string, entries: { name: string; slots?: number | string }[]) => {
    const m = bySlot.get(key) ?? new Map<string, number>();
    for (const e of entries) m.set(e.name, Number(e.slots ?? 0));
    bySlot.set(key, m);
  };
  for (const f of fs.readdirSync(path.join(DATA_DIR, "weapons"))) {
    const weapons = readData(DATA_DIR, "weapons", f).weapons;
    add("melee", weapons);
    add("ranged", weapons);
  }
  for (const slot of ["leggings", "helmet", "plate", "gauntlets", "waist"]) {
    add(slot, readData(DATA_DIR, "armor", `${slot}.json`).armor);
  }
  return (s: { type: number; id: number }) => bySlot.get(EQUIP_SLOTS[s.type])?.get(equipName(s)!);
})();

test("decorations decode as jewel item IDs", async () => {
  const [gideon, mearo] = ok(await parse("us")).characters as CharacterResult[];
  // This save's only decorations: two Grinder Jewels in each 2-slot Ucamulbas
  // blademaster piece and in Master's Blade G.
  const decorated = gideon.equipBox
    .filter((s) => s.decorations?.length)
    .map((s) => [equipName(s), s.decorations!.map(name)]);
  assert.deepEqual(decorated, [
    ["Ucamulbas Mask", ["Grinder Jewel", "Grinder Jewel"]],
    ["Ucamulbas Aegis", ["Grinder Jewel", "Grinder Jewel"]],
    ["Ucamulbas Claw", ["Grinder Jewel", "Grinder Jewel"]],
    ["Ucamulbas Cincture", ["Grinder Jewel", "Grinder Jewel"]],
    ["Ucamulbas Hessian", ["Grinder Jewel", "Grinder Jewel"]],
    ["Master's Blade G", ["Grinder Jewel", "Grinder Jewel"]],
  ]);
  assert.ok(
    mearo.equipBox.every((s) => s.decorations?.length === 0),
    "MEARO's gear has no decorations",
  );
});

test("every decoration is a known jewel and the jewels fit the piece's slots", async () => {
  for (const h of ok(await parse("us")).characters) {
    for (const s of h?.equipBox ?? []) {
      let used = 0;
      for (const id of s.decorations ?? []) {
        const jewel = name(id);
        assert.ok(
          jewel && decorationSlots.has(jewel),
          `${h!.name}: ${equipName(s)} holds item ${id} (${jewel}), not a decoration`,
        );
        used += decorationSlots.get(jewel)!;
      }
      const slots = pieceSlots(s);
      assert.ok(slots !== undefined, `${equipName(s)}: slot count not found`);
      assert.ok(
        used <= slots,
        `${h!.name}: ${equipName(s)} has ${slots} slots but ${used} slots of jewels`,
      );
    }
  }
});

// Quest flags and monster records. This save's quest bits were set with the
// "All quests clear" cheat (the first 448 bits); the Training School bits
// after them, and every monster table, are the hunters' own.
const siteQuestIds = new Set(
  ["village", "guild", "training-school", "treasure-hunting"].flatMap((hub) =>
    (
      readData(DATA_DIR, "quests", `${hub}.json`).quests as {
        id: number;
      }[]
    ).map((q) => q.id),
  ),
);

test("cleared quests: every quest the cheat's 448 bits cover, plus each hunter's training", async () => {
  const [gideon, mearo] = ok(await parse("us")).characters as CharacterResult[];
  // Everything but the Training School's 47 quests sits in the first 448 bits.
  const cheat = [...siteQuestIds].filter((id) => id < 20000);
  for (const h of [gideon, mearo]) {
    for (const id of cheat) assert.ok(h.clearedQuests.includes(id), `${h.name}: ${id}`);
  }
  const training = (h: CharacterResult) => h.clearedQuests.filter((id) => id >= 20000);
  assert.deepEqual(training(gideon), [21001]);
  assert.deepEqual(training(mearo), [20001, 20007]);
  // 403 quests before the Training School, counting 1-10 and 101-109.
  assert.equal(gideon.clearedQuests.length, 403 + 1);
});

test("Hunter Rank comes from the urgent quests cleared, as the game works it out", async () => {
  // Both hunters have every quest cleared (the cheat above), so both are HR 9.
  const { decryptGameLayer, decryptPSPLayer } = await import("../public/javascript/save-cipher.js");
  const buf = fs.readFileSync(SAVE);
  const plain: ArrayBuffer = await decryptGameLayer(
    await decryptPSPLayer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "na"),
    "na",
  );
  const rank = async (bytes: Uint8Array) => {
    lastMessage = null;
    await onmessage({ data: { buffer: bytes.slice().buffer, region: "us" } });
    const gideon = ok(message()).characters[0] as CharacterResult;
    // The site's own copy of the rule (src/lib/hunter-rank.ts) agrees.
    assert.equal(hunterRankFrom(gideon.clearedQuests), gideon.hunterRank);
    return gideon.hunterRank;
  };
  // Gideon's cleared bits (character 0x3f88); bit numbers from the game's table.
  const bytes = new Uint8Array(plain);
  const clear = (bit: number) => (bytes[0x1000 + 0x3f88 + (bit >> 3)] &= ~(1 << (bit & 7)));
  // Bits of 3228, 3103, 3009, 2201, 2120, 1218, 1201 and 1104 (HR 9 down to HR 2),
  // in the worker's QUEST_FLAG_RUNS order.
  const urgent = [259, 204, 180, 132, 121, 84, 67, 44];
  assert.equal(await rank(bytes), 9);
  clear(urgent[0]);
  assert.equal(await rank(bytes), 8, "3228 not cleared");
  for (const bit of urgent.slice(1, 7)) clear(bit);
  assert.equal(await rank(bytes), 2, "only 1104 cleared");
  clear(urgent[7]);
  assert.equal(await rank(bytes), 1, "no urgent quest cleared");
});

test("the worker and src/lib/hunter-rank.ts use the same urgent quests", () => {
  const worker = fs.readFileSync(path.join(root, "public/javascript/save-worker.js"), "utf8");
  const list = worker.match(/const HR_URGENT_QUESTS = \[([^\]]*)\]/);
  assert.ok(list, "HR_URGENT_QUESTS not found in the worker");
  assert.deepEqual(list[1].split(",").map(Number), HR_URGENT_QUESTS);
});

test("stored saves work HR out from the cleared quests, never from storage", () => {
  const store = new Map<string, string>();
  const global = globalThis as unknown as { localStorage?: Pick<Storage, "getItem" | "setItem"> };
  global.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  };
  try {
    setSave({ name: "New", region: "us", items: [], hunterRank: 3, clearedQuests: [1104, 1201] });
    assert.equal(JSON.parse(store.get("mhfu_save")!).hunterRank, undefined, "HR isn't stored");
    assert.equal(getSave()?.hunterRank, 3);
    // A save stored before the fix: hunterRank held the Village quest count.
    store.set(
      "mhfu_save",
      JSON.stringify({ name: "Old", items: [], hunterRank: 37, clearedQuests: [1104] }),
    );
    assert.equal(getSave()?.hunterRank, 2);
    store.set("mhfu_save", JSON.stringify({ name: "Older", items: [], hunterRank: 37 }));
    assert.equal(getSave()?.hunterRank, undefined, "no cleared quests stored, so no HR");
    store.set("mhfu_save", JSON.stringify({ name: "Odd", items: [], clearedQuests: 5 }));
    assert.equal(getSave()?.name, "Odd", "a bad cleared-quest list doesn't lose the save");
  } finally {
    delete global.localStorage;
  }
});

test("every cleared quest is on the site, or one of the disc's unlisted 1-10 / 103-107", async () => {
  for (const h of ok(await parse("us")).characters) {
    for (const id of h?.clearedQuests ?? []) {
      assert.ok(
        siteQuestIds.has(id) || id <= 10 || (id >= 103 && id <= 107),
        `${h!.name}: quest ${id} is not on the site`,
      );
    }
  }
});

test("monster records read the Guild Card tables by monster ID", async () => {
  const [gideon, mearo] = ok(await parse("us")).characters as CharacterResult[];
  const byName = (h: CharacterResult, monster: string) =>
    h.monsters.find((m) => m.id === monsterGameId(monster));
  assert.deepEqual(byName(gideon, "Bullfango"), {
    id: 5,
    kills: 31,
    captures: 0,
    largest: 0,
    smallest: 0,
  });
  assert.equal(byName(gideon, "Melynx")?.kills, 34);
  assert.equal(byName(gideon, "Akantor")?.kills, 1);
  // A large monster's first kill sets both size records.
  assert.deepEqual(byName(gideon, "Cephadrome"), {
    id: 8,
    kills: 1,
    captures: 0,
    largest: 103,
    smallest: 103,
  });
  assert.deepEqual(
    mearo.monsters.map((m) => [m.id, m.kills]),
    [
      [70, 5],
      [77, 1],
    ],
  );
  assert.equal(byName(mearo, "Popo")?.kills, 5);
  assert.equal(byName(mearo, "Giadrome")?.kills, 1);
  assert.ok(
    [gideon, mearo].every((h) => h.monsters.every((m) => m.captures === 0)),
    "neither hunter has captured anything",
  );
});

test("awards read the game's own flags, in AWARDS order", async () => {
  const [gideon, mearo] = ok(await parse("us")).characters as CharacterResult[];
  // Gideon's u64 is 0x00004020ff10072f.
  assert.deepEqual(
    gideon.awards.map((n) => AWARDS[n].id),
    [
      "chief-glove",
      "chief-hat",
      "chief-scarf",
      "chief-coat",
      "blood-onyx",
      "bronze-medal",
      "silver-medal",
      "gold-medal",
      "grateful-letter",
      "nekoht-whiskers",
      "nekoht-bell",
      "nekoht-coat",
      "pokke-gourd",
      "orichalcum-shield",
      "platinum-shield",
      "gold-shield",
      "supreme-crest",
      "epic-hunts",
      "artisans-mitten",
    ],
  );
  // Blood Onyx (Akantor) but not Mane Necklace (Kirin): the game checks kills.
  assert.equal(gideon.monsters.find((m) => m.id === MONSTER_GAME_IDS.Akantor)?.kills, 1);
  assert.equal(
    gideon.monsters.find((m) => m.id === MONSTER_GAME_IDS.Kirin),
    undefined,
  );
  assert.deepEqual(mearo.awards, []);
});

test("stored saves keep the award flags", async () => {
  const [gideon] = ok(await parse("us")).characters as CharacterResult[];
  assert.deepEqual(saveFromCharacter(gideon, "us", 0).awards, gideon.awards);
});

test("award records: training, farm, Felynes, treasures, map counters and forging", async () => {
  const [gideon, mearo] = ok(await parse("us")).characters as CharacterResult[];
  const records = (h: CharacterResult) =>
    Object.fromEntries(AWARD_RECORD_KEYS.map((k) => [k, h[k]]));
  // Gideon: 21001 cleared with weapon set 4 only; three Comrades raised by
  // "Callum" (another hunter), with an edited fondness of 9999; five chefs,
  // whose levels no longer meet the Grateful Letter he holds.
  const callum = { fondness: 9999, own: false };
  assert.deepEqual(records(gideon), {
    trainingSets: [4],
    farm: [0, 0, 0, 0],
    felyneChefs: [9, 9, 3, 3, 2],
    comrades: [
      { ...callum, skills: 27 },
      { ...callum, skills: 24 },
      { ...callum, skills: 24 },
    ],
    recipes: 0,
    guildPoints: 1007759,
    goldTreasures: 0,
    treasureScores: [0, 0, 0, 0, 0, 0, 0],
    mapQuests: [1, 2, 0, 0, 0, 7, 0, 0, 0, 0, 1, 0, 0, 0],
    trenyaTrips: 0,
    specialWeapons: 1,
  });
  // MEARO: five Comrades of his own without skills, one chef.
  const own = { fondness: 9999, skills: 0, own: true };
  assert.deepEqual(records(mearo), {
    trainingSets: [],
    farm: [0, 0, 0, 0],
    felyneChefs: [2],
    comrades: [own, own, own, own, own],
    recipes: 0,
    guildPoints: 999999,
    goldTreasures: 0,
    treasureScores: [0, 0, 0, 0, 0, 0, 0],
    mapQuests: [0, 0, 1, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0],
    trenyaTrips: 0,
    specialWeapons: 0,
  });
});

test("stored saves keep the award records", async () => {
  const [gideon] = ok(await parse("us")).characters as CharacterResult[];
  const stored = saveFromCharacter(gideon, "us", 0);
  assert.deepEqual(stored.felyneChefs, gideon.felyneChefs);
  assert.deepEqual(stored.comrades, gideon.comrades);
  assert.equal(stored.guildPoints, 1007759);
  assert.deepEqual(stored.mapQuests, gideon.mapQuests);
});

test("the award records show Gideon's progress on the Awards page", async () => {
  const [gideon] = ok(await parse("us")).characters as CharacterResult[];
  const ctx = {
    save: { ...saveFromCharacter(gideon, "us", 0), savedAt: 0 },
    quests: [],
    monsters: [],
  };
  const progress = (id: string) => {
    const p = awardProgress(
      AWARDS.find((a) => a.id === id)!,
      ctx,
    );
    return p.status === "progress" ? [p.status, p.done, p.total] : [p.status];
  };
  assert.deepEqual(
    [
      "grateful-letter",
      "flower-bouquet",
      "fearless-leader",
      "ultimate-catnip",
      "members-card",
      "artisans-hammer",
      "artisans-mitten",
      "guardians-award",
      "hunters-miracle",
      "azure-stone",
      "hunters-progress",
    ].map((id) => [id, ...progress(id)]),
    [
      // Given, though his chefs' levels have since dropped (the save looks edited).
      ["grateful-letter", "earned"],
      // Past the mark, but the game hasn't handed it over yet.
      ["flower-bouquet", "progress", 1_000_000, 1_000_000],
      // Fondness 9999 isn't the 7000 the game checks for.
      ["fearless-leader", "progress", 0, 5],
      // His Comrades are Callum's.
      ["ultimate-catnip", "progress", 0, 36],
      ["members-card", "progress", 1, 50],
      ["artisans-hammer", "progress", 0, 11],
      ["artisans-mitten", "earned"],
      ["guardians-award", "progress", 0, 40],
      ["hunters-miracle", "progress", 0, 6],
      ["azure-stone", "progress", 0, 4],
      ["hunters-progress", "notEarned"],
    ],
  );
});
