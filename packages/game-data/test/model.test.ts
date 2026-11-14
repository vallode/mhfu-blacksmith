import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import {
  dehydrate,
  fileKind,
  hydrate,
  importLegacy,
  readData,
  readRawData,
  readStringsDoc,
  serializeData,
  serializeStrings,
  stringResolver,
  StringTable,
  writeData,
  type LegacyIdSources,
} from "../src/index.js";

const DATA = fileURLToPath(new URL("../../../data", import.meta.url));

/** Every data file in the repository's data/, as paths inside it. */
function dataFiles(): string[] {
  const top = ["items.json", "decorations.json", "skills.json", "gathering.json", "shops.json"];
  top.push("veggie-trades.json", "combinations.json", "farm.json");
  const dirs = ["weapons", "armor", "monsters", "quests"].flatMap((dir) =>
    readdirSync(path.join(DATA, dir))
      .filter((f) => f.endsWith(".json"))
      .map((f) => `${dir}/${f}`),
  );
  return [...top, ...dirs];
}

describe("the committed data", () => {
  const en = new StringTable(readStringsDoc(DATA));
  const strings = { en, ja: new StringTable(readStringsDoc(DATA, "ja")) };

  test("every file's named view converts back to the file and the strings it came from", () => {
    for (const rel of dataFiles()) {
      const kind = fileKind(rel)!;
      const raw = readRawData(DATA, rel);
      const named = hydrate(kind, raw, strings);
      const back = dehydrate(kind, named, stringResolver(en, raw));
      assert.equal(serializeData(back.raw), serializeData(raw), rel);
      // The strings the records name are the ones already there.
      for (const [lang, doc] of [
        ["en", back.strings.en],
        ["ja", back.strings.ja],
      ] as const) {
        const have = readStringsDoc(DATA, lang) as Record<string, Record<string, unknown>>;
        for (const [kind, table] of Object.entries(doc)) {
          if (kind === "aliases") continue;
          for (const [key, value] of Object.entries(table as Record<string, string>))
            assert.equal(have[kind]?.[key], value, `${rel}: ${lang} ${kind} ${key}`);
        }
      }
    }
  });

  test("writing every file's named view back changes nothing", () => {
    for (const rel of dataFiles())
      assert.deepEqual(writeData(DATA, rel, readData(DATA, rel), { dryRun: true }), [], rel);
  });

  test("the strings files are in their canonical layout", () => {
    for (const lang of ["en", "ja"])
      assert.equal(
        readFileSync(path.join(DATA, "strings", `${lang}.json`), "utf-8"),
        serializeStrings(readStringsDoc(DATA, lang)),
      );
  });

  test("armor and decorations name every skill tree by its name, not an alias", () => {
    const en = readStringsDoc(DATA);
    const trees = new Set(Object.values(en.skill ?? {}));
    for (const slot of ["helmet", "plate", "gauntlets", "waist", "leggings"]) {
      for (const a of readRawData(DATA, "armor", `${slot}.json`).armor as {
        skills: Record<string, unknown>[] | null;
      }[])
        for (const s of a.skills ?? []) assert.ok(!("alias" in s), `${slot}: ${JSON.stringify(s)}`);
      for (const a of readData(DATA, "armor", `${slot}.json`).armor as {
        skills: { name: string }[] | null;
      }[])
        for (const s of a.skills ?? []) assert.ok(trees.has(s.name), s.name);
    }
    const hunter = readData(DATA, "armor/helmet.json").armor.find(
      (a: { name: string }) => a.name === "Hunter's Helm",
    );
    assert.deepEqual(hunter.skills[0], { name: "PsychicVis", amount: 3 });
    const decorations = readData(DATA, "decorations.json").decorations as {
      name: string;
      skills: string[];
    }[];
    assert.ok(decorations.some((d) => d.skills.includes("NormalS Up +4")));
    assert.ok(!decorations.some((d) => d.skills.includes("NormalS up +4")));
    // Decoration names are untouched.
    assert.ok(decorations.some((d) => d.name === "Constitutn Jewel"));
  });

  test("the equipment ID view lists every weapon and armor piece at its ID", () => {
    const ids = readData(DATA, "equipment-ids.json");
    assert.deepEqual(Object.keys(ids), [
      "leggings",
      "helmet",
      "plate",
      "gauntlets",
      "waist",
      "melee",
      "ranged",
    ]);
    // Guild Guard pieces share a name per sex; only they carry `sex`.
    assert.deepEqual(ids.waist[166], { name: "Red Guild Guard Coil", sex: "Male" });
    assert.deepEqual(ids.waist[1], { name: en.name("waist", 1) });
    assert.equal(ids.melee.at(-1).type !== undefined, true);
  });
});

describe("StringTable", () => {
  const table = new StringTable(
    { item: { "1": "Libro de combinaciones 1" } },
    {
      item: { "1": "Book of Combos 1", "2": "Book of Combos 2" },
      aliases: { item: { "2": ["BoC 2"] } },
    },
  );
  test("falls back to English", () => {
    assert.equal(table.name("item", 1), "Libro de combinaciones 1");
    assert.equal(table.name("item", 2), "Book of Combos 2");
    assert.equal(table.spelling("item", 2, 0), "BoC 2");
    assert.throws(() => table.name("item", 3), /no item name for 3/);
  });
});

/** A small data/ in the old named layout, for importLegacy and writeData. */
const legacy = () =>
  new Map<string, unknown>([
    [
      "items.json",
      {
        items: [
          { id: 1, name: "Iron Ore", name_jp: "鉄鉱石", rarity: 1 },
          {
            id: 2,
            name: "ConstitutnJewel",
            name_jp: "体操珠",
            aliases: ["Stamina Jewel"],
            rarity: 4,
          },
        ],
      },
    ],
    [
      "skills.json",
      {
        skills: [
          {
            tree: "Constitutn",
            aliases: ["Technique"],
            skills: [{ name: "Constitution +1", points: 10 }],
          },
        ],
      },
    ],
    [
      "equipment-ids.json",
      {
        helmet: [null, { name: "Bone Helm" }],
        melee: [{ name: "Bone Axe", type: "great-sword" }],
        ranged: [],
      },
    ],
    [
      "armor/helmet.json",
      {
        armor: [
          {
            name: "Bone Helm",
            skills: [{ name: "Technique", amount: 2 }],
            create_mats: [{ name: "Iron Ore", amount: 1 }],
          },
        ],
      },
    ],
    [
      "decorations.json",
      {
        decorations: [
          {
            name: "Constitutn Jewel",
            skills: ["Constitutn +1"],
            create_mats: [{ name: "Iron Ore", amount: 2 }],
          },
        ],
      },
    ],
    [
      "monsters/flying-wyvern.json",
      {
        monsters: [
          {
            name: "Rathian",
            type: "flying-wyvern",
            description: "Queen of the land.",
            drops: { "low-rank": { carves: [{ name: "Iron Ore x2", chance: "50%" }] } },
          },
        ],
      },
    ],
    [
      "quests/village.json",
      {
        quests: [
          {
            id: 101,
            map: "Old Swamp",
            target: { monster: "Rathian", amount: 1 },
            supplies: [{ item: "Iron Ore", amount: 1 }],
            reward_tables: [],
            large_monsters: [{ monster: "Pink Rathian Typo", quantity: 1 }],
            small_monsters: [],
            title: "Queen",
            goal: "Hunt a Rathian",
            details: null,
            fail: "Reward Zero",
            client: "Chief",
            requires: null,
          },
        ],
      },
    ],
  ]);
const sources: LegacyIdSources = {
  skillId: () => 33,
  monsterId: (name) => ({ Rathian: 1, "Pink Rathian Typo": 1 })[name],
  maps: { 28: "Old Swamp" },
};

describe("importLegacy", () => {
  test("moves names into the strings and references to IDs, and back", () => {
    const { files, en, ja } = importLegacy(legacy(), sources);
    assert.ok(!files.has("equipment-ids.json"));
    assert.deepEqual(files.get("armor/helmet.json"), {
      armor: [
        {
          id: 1,
          skills: [{ skill: 33, alias: 0, amount: 2 }],
          create_mats: [{ item: 1, amount: 1 }],
        },
      ],
    });
    assert.deepEqual(files.get("decorations.json").decorations[0].skills, [
      { skill: 33, points: 1 },
    ]);
    // A decoration's name is only listed where it isn't its item's.
    assert.deepEqual(en.decoration, { "2": "Constitutn Jewel" });
    assert.deepEqual(files.get("monsters/flying-wyvern.json").monsters[0].drops, {
      "low-rank": { carves: [{ item: 1, amount: 2, chance: "50%" }] },
    });
    // A quest's other spelling of a monster is an alias of it.
    assert.deepEqual(en.aliases?.monster, { "1": ["Pink Rathian Typo"] });
    assert.deepEqual(files.get("quests/village.json").quests[0].large_monsters, [
      { monster: 1, alias: 0, quantity: 1 },
    ]);
    assert.equal(en.quest?.["101"], "Queen");
    assert.equal(ja.item?.["1"], "鉄鉱石");

    const strings = { en: new StringTable(en), ja: new StringTable(ja) };
    for (const [rel, raw] of files) {
      const named = hydrate(fileKind(rel)!, raw, strings);
      assert.deepEqual(named, legacy().get(rel), rel);
    }
  });
});

describe("writeData", () => {
  function fixture(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "game-data-write-"));
    const { files, en, ja } = importLegacy(legacy(), sources);
    for (const [rel, raw] of files) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), serializeData(raw));
    }
    mkdirSync(path.join(dir, "strings"));
    writeFileSync(path.join(dir, "strings", "en.json"), serializeStrings(en));
    writeFileSync(path.join(dir, "strings", "ja.json"), serializeStrings(ja));
    return dir;
  }

  test("writes nothing for an unchanged view", () => {
    const dir = fixture();
    for (const rel of legacy().keys()) {
      if (rel === "equipment-ids.json") continue;
      assert.deepEqual(writeData(dir, rel, readData(dir, rel)), [], rel);
    }
  });

  test("writes new values to the record and new text to the strings", () => {
    const dir = fixture();
    const quests = readData(dir, "quests/village.json");
    quests.quests[0].title = "The Queen";
    quests.quests[0].supplies.push({ item: "ConstitutnJewel", amount: 1 });
    assert.deepEqual(writeData(dir, "quests/village.json", quests), [
      "quests/village.json",
      "strings/en.json",
    ]);
    assert.equal(readStringsDoc(dir).quest?.["101"], "The Queen");
    assert.deepEqual(readRawData(dir, "quests/village.json").quests[0].supplies, [
      { item: 1, amount: 1 },
      { item: 2, amount: 1 },
    ]);
    assert.deepEqual(readData(dir, "quests/village.json"), quests);
  });

  test("dry runs write nothing, and unknown names are errors", () => {
    const dir = fixture();
    const before = readFileSync(path.join(dir, "armor", "helmet.json"), "utf-8");
    const armor = readData(dir, "armor/helmet.json");
    armor.armor[0].defence = 9;
    assert.deepEqual(writeData(dir, "armor/helmet.json", armor, { dryRun: true }), [
      "armor/helmet.json",
    ]);
    assert.equal(readFileSync(path.join(dir, "armor", "helmet.json"), "utf-8"), before);

    armor.armor[0].create_mats[0].name = "Unobtainium";
    assert.throws(
      () => writeData(dir, "armor/helmet.json", armor),
      /no item is named "Unobtainium"/,
    );
    armor.armor[0].create_mats[0].name = "Iron Ore";
    armor.armor[0].name = "Not In The Tables";
    assert.throws(() => writeData(dir, "armor/helmet.json", armor), /no helmet is named/);
  });
});
