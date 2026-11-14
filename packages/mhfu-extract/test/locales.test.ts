/**
 * `locales`: quest text per language slot (locales/quests.ts), the locale
 * file merge and schema check (locales/file.ts), game ID -> site name
 * mapping (locales/names.ts), and the whole command on a synthetic
 * unpacked disc.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { runLocales } from "../src/cli/locales.js";
import {
  loadLocaleSchema,
  mergeLocale,
  serializeLocale,
  sourceLabel,
  validateLocale,
  type LocaleFile,
} from "../src/locales/file.js";
import { loadSiteKeys, nameSections } from "../src/locales/names.js";
import { parseSlotMap, questLocales } from "../src/locales/quests.js";
import { encryptQuest, QUEST_MAGIC } from "../src/quests/mib.js";
import {
  LANG_SLOTS,
  parseQuest,
  type LangSlot,
  type ParsedQuest,
  type QuestStrings,
} from "../src/quests/parser.js";
import { detectLanguage } from "../src/strings/language.js";
import { enumNames } from "../src/strings/name-search.js";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "data");
const dataFile = (file: string): string => readFileSync(path.join(DATA, file), "utf-8");

/** One quest's text in each language, in the style of the game's quest board. */
const TEXT: Record<"en" | "de" | "fr" | "es" | "it", QuestStrings> = {
  en: {
    title: "The Giadrome Hunt",
    goal: "Hunt 1 Giadrome",
    fail: "Reward hits 0\nTime expires",
    details: "There's a big boss leading the sly Giaprey pack. Please take care of it for me!",
    monsters: "Giadrome\nGiaprey",
    client: "Treshi",
  },
  de: {
    title: "Die Giadrome-Jagd",
    goal: "Jage 1 Giadrome",
    fail: "Belohnung null\nZeit abgelaufen",
    details: "Ein großer Anführer führt die listigen Giaprey an. Bitte erledige ihn für mich!",
    monsters: "Giadrome\nGiaprey",
    client: "Treshi",
  },
  fr: {
    title: "La chasse au Giadrome",
    goal: "Chasser 1 Giadrome",
    fail: "Récompense nulle\nTemps écoulé",
    details: "Un grand chef dirige les rusés Giaprey. Débarrassez-nous de lui, s'il vous plaît !",
    monsters: "Giadrome\nGiaprey",
    client: "Treshi",
  },
  es: {
    title: "La caza del Giadrome",
    goal: "Caza 1 Giadrome",
    fail: "Sin recompensa\nSe acaba el tiempo",
    details: "Hay un gran jefe que lidera a los astutos Giaprey. ¡Acaba con él, por favor!",
    monsters: "Giadrome\nGiaprey",
    client: "Treshi",
  },
  it: {
    title: "La caccia al Giadrome",
    goal: "Caccia 1 Giadrome",
    fail: "Ricompensa zero\nTempo scaduto",
    details: "C'è un grande capo che guida gli astuti Giaprey. Eliminalo per me, per favore!",
    monsters: "Giadrome\nGiaprey",
    client: "Treshi",
  },
};

/** The EU slot layout: English in eng1/eng2/eng3, then quest.hexpat's ger/fre/spa/ita. */
const EU_SLOTS: Record<LangSlot, QuestStrings> = {
  eng1: TEXT.en,
  eng2: TEXT.en,
  ger: TEXT.de,
  fre: TEXT.fr,
  spa: TEXT.es,
  ita: TEXT.it,
  eng3: TEXT.en,
};

/** A plaintext `.mib` with a header and the given language slots (everything else absent). */
function questPayload(id: number, slots: Partial<Record<LangSlot, QuestStrings>>): Buffer {
  const buf = Buffer.alloc(8192);
  QUEST_MAGIC.copy(buf, 0);
  buf.writeUInt8(1, 68); // rank: low
  buf.writeUInt32LE(100, 80); // fee
  buf.writeUInt32LE(1200, 84); // reward
  buf.writeUInt32LE(90000, 92); // time limit
  buf.writeUInt32LE(0x100, 96); // stringPtrTbl
  buf.writeUInt16LE(id, 100);
  buf.writeUInt8(1, 102); // stars
  buf.writeUInt8(2, 104); // map
  let at = 0x200;
  const blocks = new Map<QuestStrings, number>();
  LANG_SLOTS.forEach((slot, i) => {
    const strings = slots[slot];
    if (!strings) return;
    let block = blocks.get(strings);
    if (block === undefined) {
      block = at;
      at += 24;
      blocks.set(strings, block);
      (["title", "goal", "fail", "details", "monsters", "client"] as const).forEach((f, k) => {
        buf.writeUInt32LE(at, block! + k * 4);
        at += buf.write(strings[f], at, "utf8") + 1;
      });
      at = Math.ceil(at / 4) * 4;
    }
    buf.writeUInt32LE(block, 0x100 + i * 4);
  });
  return buf.subarray(0, at + 4);
}

const quest = (id: number, slots: Partial<Record<LangSlot, QuestStrings>>): ParsedQuest =>
  parseQuest(questPayload(id, slots));

describe("questLocales (EU)", () => {
  const quests = [quest(10001, EU_SLOTS), quest(1001, { ...EU_SLOTS, spa: TEXT.en })];

  test("parseQuest keeps every slot", () => {
    assert.deepEqual(Object.keys(quests[0]!.languages), [...LANG_SLOTS]);
    assert.equal(quests[0]!.strings!.title, "The Giadrome Hunt");
  });

  test("writes each language's text by quest ID, without fields equal to English", () => {
    const { sections, slots } = questLocales(quests, "eu");
    assert.deepEqual(Object.keys(sections).sort(), ["de", "es", "fr", "it"]);
    assert.deepEqual(sections.es, {
      "10001": {
        title: TEXT.es.title,
        goal: TEXT.es.goal,
        fail: TEXT.es.fail,
        details: TEXT.es.details,
      },
    });
    assert.equal(sections.de!["1001"]!.goal, "Jage 1 Giadrome");
    const spa = slots.find((s) => s.slot === "spa")!;
    assert.equal(spa.translated, 1, "quest 1001's Spanish slot is English");
    assert.equal(spa.identicalFields, 5 + 1, "5 fields of 1001, client of 10001");
    assert.equal(spa.guess.language, "es");
    const eng2 = slots.find((s) => s.slot === "eng2")!;
    assert.equal(eng2.locale, null);
    assert.equal(eng2.translated, 0);
  });

  test("skips placeholders and unused quests", () => {
    const none = Object.fromEntries(
      Object.keys(TEXT.en).map((k) => [k, "none"]),
    ) as unknown as QuestStrings;
    const { sections } = questLocales(
      [
        quest(10001, { ...EU_SLOTS, ita: { ...TEXT.it, details: "none" } }),
        quest(40001, { eng1: none, ita: TEXT.it }),
      ],
      "eu",
    );
    assert.equal(sections.it!["10001"]!.details, undefined);
    assert.equal(sections.it!["40001"], undefined);
  });

  test("text that isn't UTF-8 (decoded with U+FFFD) is counted and left out", () => {
    const latin1 = { ...TEXT.es, title: "La caza del Giadrome peque\uFFFDo" };
    const { sections, slots } = questLocales([quest(10001, { ...EU_SLOTS, spa: latin1 })], "eu");
    assert.equal(sections.es!["10001"]!.title, undefined);
    assert.equal(sections.es!["10001"]!.goal, TEXT.es.goal);
    assert.equal(slots.find((s) => s.slot === "spa")!.invalidUtf8Fields, 1);
  });

  test("English slots are guessed from all their text", () => {
    const { slots } = questLocales([quest(10001, EU_SLOTS)], "eu");
    assert.equal(slots.find((s) => s.slot === "eng1")!.guess.language, "en");
  });

  test("a slot that reads as another language is skipped, and --slots fixes it", () => {
    const swapped = [quest(10001, { ...EU_SLOTS, fre: TEXT.es, spa: TEXT.fr })];
    const { sections, slots } = questLocales(swapped, "eu");
    assert.equal(sections.es, undefined);
    assert.equal(sections.fr, undefined);
    assert.match(slots.find((s) => s.slot === "spa")!.skipped!, /reads as French/);
    const fixed = questLocales(swapped, "eu", parseSlotMap("ger=de,fre=es,spa=fr,ita=it"));
    assert.equal(fixed.sections.es!["10001"]!.title, TEXT.es.title);
    assert.equal(fixed.sections.fr!["10001"]!.title, TEXT.fr.title);
  });

  test("parseSlotMap rejects unknown slots and locales", () => {
    assert.throws(() => parseSlotMap("esp=es"), /unknown slot/);
    assert.throws(() => parseSlotMap("spa=pt"), /unknown locale/);
  });
});

describe("questLocales (JP)", () => {
  test("every slot's Japanese text becomes ja", () => {
    const ja: QuestStrings = {
      title: "強敵、ドスギアノス現る！",
      goal: "ドスギアノス１頭の狩猟",
      fail: "報酬金ゼロ\nタイムアップ",
      details: "ずる賢い肉食竜のギアノス共を束ねる、大型のボスがいる。",
      monsters: "ドスギアノス\nギアノス",
      client: "元気のいい少年",
    };
    const all = Object.fromEntries(LANG_SLOTS.map((s) => [s, ja]));
    const { sections, slots } = questLocales([quest(10001, all)], "jp");
    assert.equal(sections.ja!["10001"]!.title, ja.title);
    assert.equal(slots[0]!.guess.language, "ja");
  });
});

describe("language guesses", () => {
  for (const [lang, text] of Object.entries(TEXT)) {
    test(`quest text in ${lang}`, () => {
      assert.equal(detectLanguage(Object.values(text)).language, lang);
    });
  }
});

describe("locale files", () => {
  test("merge keeps entries this run didn't produce, replaces the ones it did, and sorts keys", async () => {
    const existing: LocaleFile = {
      $comment: "kept",
      source: null,
      item: { Potion: "Poción" },
      monster: { Rathian: "Rathian (old)", Kelbi: "Kelbi (old)" },
      quest: { "5": { title: "old" } },
    };
    const merged = mergeLocale(
      "es",
      existing,
      {
        names: { monster: { Rathalos: "Rathalos", Kelbi: "Kelbi" } },
        quest: { "10001": { goal: "b", title: "a" }, "2": { title: "c" } },
      },
      "EU disc ULES01213, extracted 2026-11-09",
    );
    assert.equal(merged.$comment, "kept");
    assert.deepEqual(merged.item, { Potion: "Poción" });
    assert.deepEqual(merged.monster, {
      Kelbi: "Kelbi",
      Rathalos: "Rathalos",
      Rathian: "Rathian (old)",
    });
    assert.deepEqual(Object.keys(merged.quest!), ["2", "5", "10001"]);
    assert.deepEqual(Object.keys(merged.quest!["10001"]!), ["title", "goal"]);
    assert.deepEqual(Object.keys(merged), [
      "$comment",
      "source",
      "weapon",
      "armor",
      "item",
      "monster",
      "skill",
      "decoration",
      "map",
      "quest",
    ]);
    assert.deepEqual(validateLocale(merged, await loadLocaleSchema(DATA)), []);
  });

  test("a new file gets the committed comment's wording", () => {
    const merged = mergeLocale("de", null, { names: {} }, "x");
    assert.match(
      merged.$comment!,
      /^German game text: .*EU disc by `pnpm --filter mhfu-extract locales`/,
    );
    assert.match(mergeLocale("ja", null, { names: {} }, "x").$comment!, /JP disc/);
  });

  test("the committed es.json passes, and the check catches bad files", async () => {
    const schema = await loadLocaleSchema(DATA);
    const committed = JSON.parse(await readFile(path.join(DATA, "locales", "es.json"), "utf-8"));
    assert.deepEqual(validateLocale(committed, schema), []);
    const bad = { nope: 1, item: { Potion: "" }, quest: { x1: { title: "t", monsters: "m" } } };
    assert.deepEqual(validateLocale(bad as LocaleFile, schema), [
      'unknown key "nope"',
      'item["Potion"]: not a non-empty string',
      'quest["x1"]: ID isn\'t a number',
      'quest["x1"].monsters: unknown field',
    ]);
  });

  test("source names the disc and date", () => {
    assert.equal(
      sourceLabel("eu", "ULES01213", new Date("2026-11-09T12:00:00Z")),
      "EU disc ULES01213, extracted 2026-11-09",
    );
  });
});

describe("site names for game IDs", () => {
  const keys = loadSiteKeys(DATA);
  test("each kind maps through the repo's own tables", () => {
    assert.deepEqual(keys.get("emID")!.get(1), [{ kind: "monster", names: ["Rathian"] }]);
    const skill = keys.get("SkillID")!.get(enumNames("SkillID").indexOf("Defense"))!;
    assert.ok(skill[0]!.names.includes("Defense") && skill[0]!.names.includes("Defence"));
    assert.equal(keys.get("WepBMID")!.get(1)![0]!.kind, "weapon");
    assert.equal(keys.get("HeadArmorID")!.get(1)![0]!.names[0], "Leather Helm");
  });

  test("decorations come from their item IDs", () => {
    const items = JSON.parse(dataFile("items.json")) as { items: { id: number; name: string }[] };
    const jewel = items.items.find((i) => i.name === "Attack Jewel")!;
    const kinds = keys
      .get("ItemID")!
      .get(jewel.id)!
      .map((k) => k.kind);
    assert.deepEqual(kinds.sort(), ["decoration", "item"]);
  });

  test("nameSections keys translations by site name and reports conflicts", () => {
    const texts: (string | null)[] = [];
    texts[1] = "Rathian ES";
    texts[11] = "Rathalos ES";
    const { names, written } = nameSections({ emID: texts }, keys);
    assert.equal(names.monster!.Rathian, "Rathian ES");
    assert.equal(written.emID, 2);
    // Yama Tsukami is emID 58 and 72; only 58 has a site page (monster-ids.ts).
    const conflicted: (string | null)[] = [];
    conflicted[1] = "A";
    const dup = new Map(keys);
    dup.set(
      "emID",
      new Map([...keys.get("emID")!, [2, [{ kind: "monster", names: ["Rathian"] }]]]),
    );
    conflicted[2] = "B";
    const result = nameSections({ emID: conflicted }, dup);
    assert.equal(result.names.monster!.Rathian, "A");
    assert.match(result.conflicts[0]!, /"A" kept, "B"/);
  });
});

describe("locales command on a synthetic EU disc", () => {
  test("writes quest text and confident names, merging with existing files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mhfu-locales-"));
    try {
      const unpacked = path.join(dir, "unpacked");
      const data = path.join(dir, "data");
      await mkdir(path.join(unpacked, "data-bin", "mission_jpn"), { recursive: true });
      await writeFile(
        path.join(unpacked, "manifest.json"),
        JSON.stringify({ region: "eu", discId: "ULES01213", fileList: 2, eboot: true }),
      );
      for (const id of [10001, 1001]) {
        const name = `m${String(id).padStart(5, "0")}.mib`;
        await writeFile(
          path.join(unpacked, "data-bin", "mission_jpn", name),
          encryptQuest(questPayload(id, EU_SLOTS), "eu"),
        );
      }
      await writeFile(path.join(unpacked, "eboot.bin"), monsterNameEboot());

      // A data/ with the real site files the mapping needs, and an existing es.json.
      await mkdir(path.join(data, "locales"), { recursive: true });
      await mkdir(path.join(data, "schemas"), { recursive: true });
      for (const f of ["equipment-ids.json", "items.json", "decorations.json", "skills.json"]) {
        await writeFile(path.join(data, f), dataFile(f));
      }
      await writeFile(
        path.join(data, "schemas", "locale.schema.json"),
        dataFile("schemas/locale.schema.json"),
      );
      await writeFile(
        path.join(data, "locales", "es.json"),
        serializeLocale({
          $comment: "existing",
          source: null,
          item: { Potion: "Poción" },
          quest: {},
        }),
      );

      const result = await runLocales({ unpacked, data });
      assert.deepEqual(Object.keys(result.written).sort(), ["de", "es", "fr", "it"]);

      const es = JSON.parse(await readFile(path.join(data, "locales", "es.json"), "utf-8"));
      assert.equal(es.$comment, "existing");
      assert.match(es.source, /^EU disc ULES01213, extracted \d{4}-\d\d-\d\d$/);
      assert.deepEqual(es.item, { Potion: "Poción" });
      assert.equal(es.quest["10001"].title, TEXT.es.title);
      assert.equal(es.monster.Rathian, `Rathian${MONSTER_SUFFIX.es}`);
      assert.deepEqual(validateLocale(es, await loadLocaleSchema(data)), []);

      const de = JSON.parse(await readFile(path.join(data, "locales", "de.json"), "utf-8"));
      assert.equal(de.monster.Rathalos, `Rathalos${MONSTER_SUFFIX.de}`);
      assert.equal(de.quest["1001"].goal, TEXT.de.goal);
      assert.match(de.$comment, /^German game text/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

/** Made-up translations of every monster name, as `<name><suffix>`. */
const MONSTER_SUFFIX = {
  de: ", der König für die Jäger",
  fr: ", le roi des forêts",
  es: ", el rey de la montaña",
  it: ", il re della città",
} as const;

/**
 * An EBOOT-like ELF with the `emID` names in English and the four made-up
 * translations as back-to-back pointer arrays.
 */
function monsterNameEboot(): Buffer {
  const names = enumNames("emID");
  const lists = [
    names.map((n) => n ?? ""),
    ...Object.values(MONSTER_SUFFIX).map((suffix) =>
      names.map((n, i) => (i === 0 || !n ? (n ?? "") : `${n}${suffix}`)),
    ),
  ];
  const buf = Buffer.alloc(64 * 1024);
  buf.writeUInt32LE(0x464c457f, 0);
  const base = 0x08804000 - 0x100;
  let at = 0x100;
  const offsets = lists.map((list) =>
    list.map((s) => {
      const o = at;
      at += buf.write(s, at, "utf8") + 1;
      return o;
    }),
  );
  at = Math.ceil(at / 4) * 4 + 64;
  for (const list of offsets) {
    for (const o of list) {
      buf.writeUInt32LE(o + base, at);
      at += 4;
    }
  }
  return buf.subarray(0, at + 64);
}
