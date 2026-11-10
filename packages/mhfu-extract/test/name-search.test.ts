/**
 * The name table search (strings/name-search.ts) on synthetic files with
 * known layouts: the real enum names as the English table, made-up
 * translations (a language-typical prefix on each English name, so lengths
 * and markers line up the way real translations do) as the others.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { elfLoadSegments } from "../src/container/elf.js";
import {
  enumNames,
  FileIndex,
  findEnglishTables,
  inferBase,
  namesMatch,
  searchNameTable,
  stringAt,
  translatedNames,
  type ScanFile,
} from "../src/strings/name-search.js";

const PREFIX = {
  es: "Pequeña caza del ",
  de: "Großes Jagdschwert für ",
  fr: "Grande épée du ",
  it: "Spada città della ",
} as const;
type Lang = keyof typeof PREFIX;

/** A made-up translation; entry 0 stays "None" in every language. */
function translate(names: (string | null)[], lang: Lang): string[] {
  return names.map((n, i) => (i === 0 || !n ? (n ?? "") : `${PREFIX[lang]}${n}`));
}

/** A growable little-endian buffer with a write cursor. */
class Builder {
  buf = Buffer.alloc(1 << 20);
  at = 0;

  align(n = 4): this {
    this.at = Math.ceil(this.at / n) * n;
    return this;
  }

  /** NUL-terminated strings back to back; returns each one's offset. */
  strings(list: string[], encode: (s: string) => Buffer = (s) => Buffer.from(s, "utf8")): number[] {
    return list.map((s) => {
      const at = this.at;
      const bytes = encode(s);
      bytes.copy(this.buf, at);
      this.at += bytes.length + 1;
      return at;
    });
  }

  u32s(values: number[]): number {
    this.align();
    const at = this.at;
    values.forEach((v, i) => this.buf.writeUInt32LE(v >>> 0, at + i * 4));
    this.at += values.length * 4;
    return at;
  }

  /** Pseudo-random words, like code between tables. */
  noise(words: number, seed = 1): this {
    this.align();
    let x = seed;
    for (let i = 0; i < words; i++) {
      x = (Math.imul(x, 1103515245) + 12345) >>> 0;
      this.buf.writeUInt32LE(x, this.at);
      this.at += 4;
    }
    return this;
  }

  done(): Buffer {
    return this.buf.subarray(0, this.at + 16);
  }
}

/** A minimal ELF header with one PT_LOAD segment (offset 0x100 -> vaddr 0x08804000). */
function elfHeader(b: Builder): void {
  b.buf.writeUInt32LE(0x464c457f, 0);
  b.buf.writeUInt16LE(2, 0x10); // ET_EXEC
  b.buf.writeUInt32LE(0x34, 0x1c); // e_phoff
  b.buf.writeUInt16LE(0x20, 0x2a); // e_phentsize
  b.buf.writeUInt16LE(1, 0x2c); // e_phnum
  b.buf.writeUInt32LE(1, 0x34); // PT_LOAD
  b.buf.writeUInt32LE(0x100, 0x38); // p_offset
  b.buf.writeUInt32LE(0x08804000, 0x3c); // p_vaddr
  b.buf.writeUInt32LE(0x80000, 0x44); // p_filesz
  b.at = 0x100;
}

const BASE = 0x08804000 - 0x100;
const LANGS: Lang[] = ["de", "fr", "es", "it"];

describe("stringAt / namesMatch", () => {
  test("reads NUL-terminated text and rejects control bytes", () => {
    const buf = Buffer.from("\0Iron Sword\0bad\x01x\0", "latin1");
    assert.equal(stringAt(buf, 1)!.toString(), "Iron Sword");
    assert.equal(stringAt(buf, 12), null);
    assert.equal(stringAt(buf, -1), null);
  });
  test("allows the enums' spelling differences", () => {
    assert.equal(namesMatch("Iron Sword", "Iron Sword"), "exact");
    assert.equal(namesMatch("Hornetaur Helm", "Hornet Helm"), false);
    assert.equal(namesMatch("Kut-Ku Scale", "Kutku Scale"), "close");
    assert.equal(namesMatch("Diablos Shel", "Diablos Shell"), "close");
    assert.equal(namesMatch("Rathalos", "Rathian"), false);
  });
});

describe("[table][lang]: arrays back to back in an EBOOT-like file", () => {
  const names = enumNames("emID");
  const b = new Builder();
  elfHeader(b);
  b.noise(4000, 7);
  const en = b.strings(names.map((n) => n ?? ""));
  const other = Object.fromEntries(LANGS.map((l) => [l, b.strings(translate(names, l))])) as Record<
    Lang,
    number[]
  >;
  b.noise(2000, 9);
  const enTable = b.u32s(en.map((o) => o + BASE));
  for (const l of LANGS) b.u32s(other[l].map((o) => o + BASE));
  b.noise(2000, 11);
  const file: ScanFile = { name: "eboot.bin", buf: b.done() };

  test("the ELF segment gives the base", () => {
    assert.deepEqual(
      elfLoadSegments(file.buf).map((s) => s.base),
      [BASE],
    );
  });

  test("finds the English table, its base and an exact match", () => {
    const found = findEnglishTables(new FileIndex(file), names);
    assert.equal(found.bases[0]!.base, BASE);
    const best = found.tables[0]!;
    assert.equal(best.offset, enTable);
    assert.equal(best.stride, 4);
    assert.equal(best.matchRatio, 1);
    // Yama Tsukami is in the enum twice; both point at its first string.
    assert.ok(found.cluster!.inEnumOrder >= 0.95);
  });

  test("finds each language's table back to back, classifies it and writes it", () => {
    const result = searchNameTable("emID", [new FileIndex(file)]);
    for (const [k, l] of LANGS.entries()) {
      const t = result.confident[l];
      assert.ok(
        t,
        `${l} confident (${JSON.stringify(result.languages.map((x) => [x.offset, x.guess.language, x.alignment]))})`,
      );
      assert.equal(t.offset, enTable + (k + 1) * names.length * 4);
      assert.match(t.via, /back to back/);
      assert.equal(t.encoding.encoding, "utf-8");
    }
    const es = translatedNames(result, "es")!;
    assert.equal(es[1], "Pequeña caza del Rathian");
    assert.equal(es[0], null, "entry 0 is the same in every language");
  });
});

describe("a table shorter than its enum, at the end of its file", () => {
  // Like ArmArmorID on the EU disc: the voted table runs past the file's end
  // if it is assumed to be as long as the enum.
  const names = enumNames("emID");
  const kept = names.length - 20;
  const b = new Builder();
  elfHeader(b);
  b.noise(4000, 5);
  const en = b.strings(names.slice(0, kept).map((n) => n ?? ""));
  b.noise(500, 6);
  const enTable = b.u32s(en.map((o) => o + BASE));
  const file: ScanFile = { name: "eboot.bin", buf: b.done() };

  test("keeps the entries that fit, and the search completes", () => {
    assert.ok(enTable + names.length * 4 > file.buf.length, "the enum-length table would overrun");
    const result = searchNameTable("emID", [new FileIndex(file)]);
    const best = result.english[0]!;
    assert.equal(best.offset, enTable);
    assert.ok(best.count < names.length && best.count >= kept, `count ${best.count}`);
    assert.equal(result.enumCount, names.length);
    // Scored against the whole enum: the missing entries count as misses.
    assert.equal(best.exact, kept);
    assert.ok(
      result.notes.some((n) => /cut off/.test(n)),
      result.notes.join("; "),
    );
  });
});

describe("[lang][table]: per-language lists of table pointers", () => {
  const tables = ["emID", "SkillID"] as const;
  const names = Object.fromEntries(tables.map((t) => [t, enumNames(t)])) as Record<
    (typeof tables)[number],
    (string | null)[]
  >;
  const b = new Builder();
  elfHeader(b);
  b.noise(3000, 3);
  const arrays: Record<string, number> = {};
  for (const lang of ["en", ...LANGS] as const) {
    for (const t of tables) {
      const list = lang === "en" ? names[t].map((n) => n ?? "") : translate(names[t], lang);
      const offs = b.strings(list);
      b.noise(50, list.length);
      arrays[`${lang}:${t}`] = b.u32s(offs.map((o) => o + BASE));
      b.noise(100, 17);
    }
  }
  // langTables[lang][table]
  const list = b.u32s(
    (["en", ...LANGS] as const).flatMap((lang) =>
      tables.map((t) => arrays[`${lang}:${t}`]! + BASE),
    ),
  );
  b.noise(500, 5);
  const file: ScanFile = { name: "eboot.bin", buf: b.done() };

  test("finds the other languages through the table pointer list", () => {
    const result = searchNameTable("SkillID", [new FileIndex(file)]);
    assert.equal(result.english[0]!.offset, arrays["en:SkillID"]);
    for (const l of LANGS) {
      const t = result.confident[l];
      assert.ok(t, `${l} confident`);
      assert.equal(t.offset, arrays[`${l}:SkillID`]);
    }
    assert.ok(Object.values(result.confident).some((t) => /pointer list at 0x/.test(t.via)));
    assert.ok(list > 0);
  });
});

describe("MH2-style main table: per-language tables of offsets relative to themselves", () => {
  test("finds the English table with a negative base and the others through the main table", () => {
    const names = enumNames("emID");
    const b = new Builder();
    const langs = ["en", ...LANGS] as const;
    const main = b.u32s(new Array(langs.length * 2).fill(0)); // (id, offset) pairs
    const tables: Record<string, number> = {};
    langs.forEach((lang, k) => {
      b.noise(16, k + 1);
      const table = b.u32s(new Array(names.length).fill(0));
      const list = lang === "en" ? names.map((n) => n ?? "") : translate(names, lang);
      b.strings(list).forEach((o, i) => b.buf.writeUInt32LE(o - table, table + i * 4));
      b.align();
      b.buf.writeUInt32LE(0x55 + k, main + k * 8);
      b.buf.writeUInt32LE(table, main + k * 8 + 4);
      tables[lang] = table;
    });
    const result = searchNameTable("emID", [new FileIndex({ name: "message.bin", buf: b.done() })]);
    assert.equal(result.english[0]!.offset, tables.en);
    assert.equal(result.english[0]!.base, -tables.en!);
    for (const l of LANGS) {
      assert.equal(result.confident[l]?.offset, tables[l], l);
      assert.equal(result.confident[l]!.base, -tables[l]!);
    }
  });
});

describe("one file per language, file-relative pointers", () => {
  const names = enumNames("emID");
  const fileFor = (lang: "en" | Lang, encode?: (s: string) => Buffer): ScanFile => {
    const b = new Builder();
    b.at = 0x40; // a small header
    const list = lang === "en" ? names.map((n) => n ?? "") : translate(names, lang);
    const table = b.u32s(new Array(list.length).fill(0));
    const offs = b.strings(list, encode);
    offs.forEach((o, i) => b.buf.writeUInt32LE(o, table + i * 4));
    return { name: `data-bin/_unindexed/${lang}.bin`, buf: b.done() };
  };

  test("finds siblings at the same offset, with base 0", () => {
    const files = (["en", ...LANGS] as const).map((l) => fileFor(l));
    const result = searchNameTable(
      "emID",
      files.map((f) => new FileIndex(f)),
    );
    assert.equal(result.english[0]!.base, 0);
    assert.equal(result.english[0]!.file, "data-bin/_unindexed/en.bin");
    for (const l of LANGS) {
      assert.equal(result.confident[l]?.file, `data-bin/_unindexed/${l}.bin`);
      assert.match(result.confident[l]!.via, /same offset/);
    }
  });

  test("reports a Latin-1 table as latin1 and decodes it", () => {
    const files = [fileFor("en"), fileFor("es", (s) => Buffer.from(s, "latin1"))];
    const result = searchNameTable(
      "emID",
      files.map((f) => new FileIndex(f)),
    );
    const es = result.languages.find((l) => l.file.endsWith("es.bin"))!;
    assert.equal(es.encoding.encoding, "latin1");
    assert.equal(es.texts[1], "Pequeña caza del Rathian");
  });

  test("a custom single-byte encoding is reported but never written", () => {
    // German with ü/ß moved to made-up bytes 0x81/0x82.
    const custom = (s: string) =>
      Buffer.from(s.replace(/ü/g, "\x81").replace(/ß/g, "\x82"), "latin1");
    const files = [fileFor("en"), fileFor("de", custom)];
    const result = searchNameTable(
      "emID",
      files.map((f) => new FileIndex(f)),
    );
    const de = result.languages.find((l) => l.file.endsWith("de.bin"))!;
    assert.equal(de.encoding.encoding, "unknown-8bit");
    assert.ok(de.encoding.highBytes.some((h) => h.byte === "81"));
    assert.equal(result.confident.de, undefined);
  });

  test("inferBase recovers offsets relative to another block", () => {
    const f = fileFor("fr");
    const idx = new FileIndex(f);
    // Rewrite the pointers as offsets from 0x40 (the table itself).
    for (let i = 0; i < names.length; i++) {
      const at = 0x40 + i * 4;
      f.buf.writeUInt32LE(f.buf.readUInt32LE(at) - 0x40, at);
    }
    assert.equal(inferBase(idx, 0x40, 4, names.length), -0x40);
  });
});

describe("no table", () => {
  test("strings without pointers give a cluster and a note, not a table", () => {
    const names = enumNames("emID");
    const b = new Builder();
    b.noise(100, 2);
    b.strings(names.map((n) => n ?? ""));
    const result = searchNameTable("emID", [new FileIndex({ name: "x.bin", buf: b.done() })]);
    assert.equal(result.english.length, 0);
    // All but "None", which follows the noise without a NUL.
    assert.equal(result.clusters[0]!.names, names.length - 1);
    assert.match(result.notes[0]!, /no pointer table/);
  });
});
