import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { linkBlob } from "../src/blob/link.js";
import { HOOK, assembleHooks } from "../src/patches/game-hooks.js";
import { findKeyQuestSites, keyQuestsObjects, LABEL_WIDTH } from "../src/patches/key-quests.js";
import { hi16, jalTo } from "../src/patches/mips.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const CARD = 0x09a8ca40;
const COUNTER = 0x09b0ffc0;
const PRINTER = 0x099712c0;
const EXTERNS = {
  rf_card_record: 0x09b03f40,
  rf_card_printer: 0x08a631a8,
  rf_card_print: 0x0889198c,
  rf_key_x: 394,
  rf_key_y: 42,
};
const KEY = 1 << 26;
const URGENT = 1 << 25;
const HUNTING = 1 << 2;

const runtime = () =>
  RUNTIME_OBJECTS.map((o) => ({ name: o.name, data: Buffer.from(o.base64, "base64") }));

/** The blob and the card hook in a CPU: the card's routines record what they draw. */
function town() {
  const blob = linkBlob([...runtime(), ...keyQuestsObjects()], BLOB, EXTERNS);
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(HOOKS, BLOB, [{ hook: HOOK.questCard, target: CARD }]);
  cpu.load(HOOKS, hooks.code);
  const arg = (k: number) => cpu.reg[4 + k]! >>> 0;
  const draws: unknown[] = [];
  cpu.native.set(CARD, () => (assert.equal(arg(0), COUNTER), 0x77));
  cpu.native.set(EXTERNS.rf_card_print, () => {
    const glyph = [cpu.u8(PRINTER + 0x12c), cpu.u8(PRINTER + 0x12d), cpu.u8(PRINTER + 0x15f)];
    draws.push({
      print: [arg(0), arg(1), arg(2), arg(3), arg(4), cpu.string(arg(5)), arg(6), arg(7)],
      glyph,
    });
    return 0;
  });
  cpu.setU32(EXTERNS.rf_card_printer, PRINTER);
  // The card left the printer's glyphs 12 pixels.
  for (const at of [0x12c, 0x12d, 0x15f]) cpu.setU8(PRINTER + at, 12);
  cpu.call(blob.symbols.get("rf_init")!, [0, 0x09999c60, BLOB]);
  const frame = (questType: number) => {
    draws.length = 0;
    cpu.setU32(EXTERNS.rf_card_record, questType);
    assert.equal(cpu.call(hooks.stubs[0]!, [COUNTER]), 0x77, "the card's result is passed back");
    return [...draws];
  };
  return { cpu, frame, blob };
}

test('a key quest\'s card gets "Key Quest!" in its top right corner, drawn as "CLEAR!!" is', () => {
  const t = town();
  assert.deepEqual(t.frame(KEY | HUNTING), [
    { print: [PRINTER, 394, 42, 1, 5, "Key Quest!", 2, 2], glyph: [14, 14, 14] },
  ]);
  for (const at of [0x12c, 0x12d, 0x15f]) {
    assert.equal(t.cpu.u8(PRINTER + at), 12, "the printer's glyph size is put back");
  }
});

test("the blob's label width is the one the label is placed with", () => {
  const t = town();
  assert.equal(t.cpu.call(t.blob.symbols.get("rf_key_label_width")!), LABEL_WIDTH);
});

test("other quests' cards, the Urgent Quest's among them, get nothing", () => {
  const t = town();
  assert.deepEqual(t.frame(HUNTING), []);
  assert.deepEqual(t.frame(URGENT | HUNTING), []);
});

/** A `lobby_task` with a quest card as the EU disc's starts, its getter, layout and one call. */
function lobby() {
  const base = 0x09a5f200;
  const buf = Buffer.alloc(0x1000);
  const at = { getter: 0x100, card: 0x200, caller: 0x400, layout: 0x600 };
  const vaddr = (offset: number) => base + offset;
  const lo = (v: number) => v & 0xffff;
  const words = (offset: number, ws: number[]) =>
    ws.forEach((w, k) => buf.writeUInt32LE(w >>> 0, offset + k * 4));
  const layout = vaddr(at.layout);
  words(at.getter, [
    0x3c020000 | hi16(EXTERNS.rf_card_record),
    0x03e00008,
    0x24420000 | lo(EXTERNS.rf_card_record),
  ]);
  words(at.card, [
    0x27bdfec0,
    ...[0xafbf002c, 0xafbe0028, 0xafb70024, 0xafb60020, 0xafb5001c],
    ...[0xafb40018, 0xafb30014, 0xafb20010, 0xafb1000c, 0xafb00008],
    0x94850058,
    0x3c120000 | hi16(layout),
    0x3c110000 | hi16(layout),
    0x0080a821,
    0x26520000 | lo(layout),
    jalTo(vaddr(at.getter)),
    0x26310000 | lo(layout + 0xd0),
    // Glyph size: the printer global.
    0x3c020000 | hi16(EXTERNS.rf_card_printer),
    0x8c440000 | lo(EXTERNS.rf_card_printer),
    jalTo(0x08890de8),
    0x00a03021,
    // A line.
    jalTo(EXTERNS.rf_card_print),
    0x01405821,
  ]);
  words(at.caller, [jalTo(vaddr(at.card)), 0]);
  // The card's left and width, and "CLEAR!!".
  buf.writeInt16LE(232, at.layout + 0x18);
  buf.writeInt16LE(240, at.layout + 0x1c);
  buf.writeInt16LE(240, at.layout + 0x3c);
  buf.writeInt16LE(42, at.layout + 0x3e);
  return { buf, base, at };
}

test("the card, its call and the label's routines are found by what the card does", () => {
  const { buf, base, at } = lobby();
  const found = findKeyQuestSites(buf, base);
  assert.ok(typeof found !== "string", String(found));
  assert.equal(found.card, base + at.card);
  assert.equal(found.call, at.caller);
  assert.deepEqual(found.externs, EXTERNS);
});

test("a card that doesn't match, or is called twice, isn't hooked", () => {
  const twice = lobby();
  twice.buf.writeUInt32LE(jalTo(twice.base + twice.at.card), twice.at.caller + 8);
  assert.equal(typeof findKeyQuestSites(twice.buf, twice.base), "string");
  const other = lobby();
  other.buf.writeUInt32LE(0, other.at.card + 0x2c);
  assert.equal(typeof findKeyQuestSites(other.buf, other.base), "string");
});
