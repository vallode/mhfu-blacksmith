/**
 * The EU message files (strings/string-pack.ts): a table of block offsets,
 * then blocks of string offsets relative to each block, packed with no
 * padding. Synthetic files in that layout, one per language, with the
 * same made-up translations as name-search.test.ts (a language-typical
 * prefix on each English name).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  enumNames,
  FileIndex,
  searchNameTable,
  translatedNames,
  type ScanFile,
} from "../src/strings/name-search.js";
import { parseStringPack, placeInPack } from "../src/strings/string-pack.js";

const PREFIX = {
  es: "Pequeña caza del ",
  de: "Großes Jagdschwert für ",
  fr: "Grande épée du ",
  it: "Spada città della ",
} as const;
type Lang = keyof typeof PREFIX;
const LANGS: Lang[] = ["de", "fr", "es", "it"];

/** A message file: the table of block offsets, then each block (entry array + strings), unpadded. */
function messageFile(blocks: string[][]): Buffer {
  const parts: Buffer[] = [];
  let at = blocks.length * 4;
  const toc = Buffer.alloc(blocks.length * 4);
  blocks.forEach((strings, k) => {
    toc.writeUInt32LE(at, k * 4);
    const entries = Buffer.alloc(strings.length * 4);
    const texts: Buffer[] = [];
    let rel = entries.length;
    strings.forEach((s, i) => {
      entries.writeUInt32LE(rel, i * 4);
      const bytes = Buffer.concat([Buffer.from(s, "utf8"), Buffer.alloc(1)]);
      texts.push(bytes);
      rel += bytes.length;
    });
    const block = Buffer.concat([entries, ...texts]);
    parts.push(block);
    at += block.length;
  });
  return Buffer.concat([toc, ...parts]);
}

const filler = (n: number, word: string) => Array.from({ length: n }, (_, i) => `${word} ${i}`);

function tableIn(names: (string | null)[], lang: Lang | "en"): string[] {
  return names.map((n, i) =>
    lang === "en" || i === 0 || !n ? (n ?? "dummy") : `${PREFIX[lang]}${n}`,
  );
}

const monsters = enumNames("emID");
const arms = enumNames("ArmArmorID");

/** The five files: block 0 has other text then the monster names, block 2 the arm armor. */
function files(): ScanFile[] {
  const names: Record<Lang | "en", string> = {
    en: "_unindexed/19.bin",
    fr: "_unindexed/20.bin",
    de: "_unindexed/21.bin",
    it: "_unindexed/22.bin",
    es: "message_jpn/str_tbl.pac",
  };
  return (["en", ...LANGS] as const).map((lang) => ({
    name: `data-bin/${names[lang]}`,
    buf: messageFile([
      [...filler(103, "Menu text"), ...tableIn(monsters, lang)],
      filler(57, "Description of"),
      tableIn(arms, lang),
      filler(11, "Ending"),
    ]),
  }));
}

describe("parseStringPack", () => {
  const [en] = files();

  test("reads the table of contents and each block's entry count", () => {
    const pack = parseStringPack(en!.buf)!;
    assert.deepEqual(
      pack.blocks.map((b) => b.count),
      [103 + monsters.length, 57, arms.length, 11],
    );
    assert.equal(pack.blocks[0]!.offset, 16);
    assert.ok(
      pack.blocks.some((b) => b.offset % 4 !== 0),
      "some blocks start unaligned, as on the disc",
    );
  });

  test("isn't fooled by files without one", () => {
    assert.equal(parseStringPack(Buffer.alloc(64)), null);
    const noise = Buffer.alloc(4096);
    let x = 1;
    for (let i = 0; i < noise.length; i += 4) {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      noise.writeUInt32LE(x, i);
    }
    assert.equal(parseStringPack(noise), null);
  });

  test("places an enum's names at their block and entry", () => {
    const pack = parseStringPack(en!.buf)!;
    assert.deepEqual(placeInPack(en!.buf, pack, arms)[0], {
      block: 2,
      entry: 0,
      votes: arms.filter(Boolean).length,
    });
    assert.equal(placeInPack(en!.buf, pack, monsters)[0]!.entry, 103);
  });
});

describe("searchNameTable through message files", () => {
  const indexes = files().map((f) => new FileIndex(f));

  for (const [table, names] of [
    ["ArmArmorID", arms],
    ["emID", monsters],
  ] as const) {
    test(`${table}: English found exactly, every language confident`, () => {
      const result = searchNameTable(table, indexes);
      const best = result.english[0]!;
      assert.equal(best.file, "data-bin/_unindexed/19.bin");
      assert.equal(best.matchRatio, 1);
      assert.ok(best.pack, "found through the message file");
      for (const lang of LANGS) {
        const t = result.confident[lang];
        assert.ok(
          t,
          `${lang}: ${JSON.stringify(result.languages.map((l) => [l.file, l.guess.language, l.alignment, l.via]))}`,
        );
        assert.match(t.via, /message file block/);
      }
      const es = translatedNames(result, "es")!;
      const i = names.findIndex((n, k) => k > 0 && n);
      assert.equal(es[i], `${PREFIX.es}${names[i]}`);
    });
  }
});
