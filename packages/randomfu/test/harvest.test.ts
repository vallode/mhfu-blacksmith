import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { decodeObjects, linkBlob } from "../src/blob/link.js";
import { FIRST_CALL_SITE, assembleHooks } from "../src/patches/game-hooks.js";
import { harvestObjects } from "../src/patches/harvest.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const SAVE = 0x09999c60;
const HUD = 0x09a04ba0;
const PRINTER = 0x08b10000;
const SOUNDS = 0x09a10000;
const MESSAGES = 0x09c00000;
const STRINGS = 0x09c10000;
/** EU's addresses (src/patches/harvest.ts on the EU disc; the printer menu.ts's). */
const EXTERNS = {
  rf_add_to_box: 0x08853abc,
  rf_item_seen: 0x08858f1c,
  rf_can_store: 0x0885c498,
  rf_can_store_object: 0x08a62c50,
  rf_farm: 0x6a238,
  rf_harvest_site: FIRST_CALL_SITE,
  rf_buttons: 0x0884fb6c,
  rf_prompt_prefix: 0x09b04de0,
  rf_prompt_print: 0x08891474,
  rf_prompt_format: 0x0893b224,
  rf_prompt_width: 0x08890e48,
  rf_prompt_banner: 0x08838b08,
  rf_prompt_icon: 0x08838e0c,
  rf_printer: 0x08a631a8,
  rf_log_item: 0x08830728,
  rf_log_text: 0x088307bc,
  rf_log_object: 0x089cbbec,
  rf_item_sound: 0x088860a0,
  rf_item_sound_object: 0x08a62d90,
};
const FARM = SAVE + EXTERNS.rf_farm;
/** The farm box prompt's lookup of its text (EU), and the lookup. */
const CALL = 0x08836bf8;
const LOOKUP = 0x09a7b790;
const PREFIX_ID = 0x1e;
const TEXT_ID = 0x2c;
const TRIANGLE = 0x1000;

function farm(boxRoom = Infinity) {
  const blob = linkBlob([...decodeObjects(RUNTIME_OBJECTS), ...harvestObjects()], BLOB, EXTERNS);
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(
    HOOKS,
    BLOB,
    [],
    undefined,
    undefined,
    [],
    [{ call: CALL, target: LOOKUP }],
  );
  cpu.load(HOOKS, hooks.code);
  const reg = (k: number) => cpu.reg[k]! >>> 0;
  cpu.setU32(EXTERNS.rf_log_object, HUD);
  cpu.setU32(EXTERNS.rf_printer, PRINTER);
  cpu.setU32(EXTERNS.rf_item_sound_object, SOUNDS);
  cpu.setU32(EXTERNS.rf_can_store_object, 0x08a70000);
  cpu.setU16(EXTERNS.rf_prompt_prefix, PREFIX_ID);
  cpu.setU8(HUD + 0x535, 0xff);

  // The game's messages: the button's " :" and the box's text.
  const texts = new Map([
    [PREFIX_ID, " :"],
    [TEXT_ID, "Open Item Box"],
  ]);
  const address = new Map<number, number>();
  let at = STRINGS;
  for (const [id, s] of texts) {
    cpu.write(at, Buffer.from(s + "\0", "latin1"));
    address.set(id, at);
    at += 0x40;
  }
  cpu.native.set(LOOKUP, () => {
    assert.equal(reg(4), MESSAGES);
    return address.get(reg(5))!;
  });
  const drawn: unknown[][] = [];
  cpu.native.set(EXTERNS.rf_prompt_print, () => {
    assert.equal(reg(4), PRINTER);
    assert.equal(reg(7), EXTERNS.rf_prompt_format);
    drawn.push(["print", reg(5), reg(6), cpu.string(reg(8)) + cpu.string(reg(9))]);
    return 0;
  });
  cpu.native.set(EXTERNS.rf_prompt_width, () => {
    assert.equal(reg(4), PRINTER);
    return cpu.string(reg(5)).length;
  });
  cpu.native.set(EXTERNS.rf_prompt_banner, () => {
    assert.equal(reg(4), HUD);
    drawn.push(["banner", reg(5), reg(6), reg(7), reg(8), reg(9), reg(10)]);
    return 0;
  });
  cpu.native.set(EXTERNS.rf_prompt_icon, () => {
    assert.equal(reg(4), HUD);
    drawn.push(["icon", reg(5), reg(6), reg(7), reg(8) | 0, reg(9)]);
    return 0;
  });
  let pressed = 0;
  cpu.native.set(EXTERNS.rf_buttons, () => {
    assert.equal(reg(4), SAVE);
    return pressed;
  });

  const box = new Map<number, number>();
  let room = boxRoom;
  cpu.native.set(EXTERNS.rf_can_store, () => (reg(5) === 999 ? 0 : 1));
  cpu.native.set(EXTERNS.rf_add_to_box, () => {
    assert.equal(reg(4), SAVE);
    assert.equal(reg(7), 0xffff);
    const fits = Math.min(reg(6), room);
    room -= fits;
    box.set(reg(5), (box.get(reg(5)) ?? 0) + fits);
    return reg(6) - fits;
  });
  const seen: number[] = [];
  cpu.native.set(EXTERNS.rf_item_seen, () => (seen.push(reg(5)), 0));
  const log: (string | number)[] = [];
  cpu.native.set(EXTERNS.rf_log_item, () => {
    assert.deepEqual([reg(4), reg(5), reg(6)], [HUD, 1, 0]);
    log.push(reg(7));
    return 0;
  });
  cpu.native.set(EXTERNS.rf_log_text, () => {
    assert.equal(reg(4), HUD);
    log.push(cpu.string(reg(5)));
    return 0;
  });
  const sounds: number[] = [];
  cpu.native.set(EXTERNS.rf_item_sound, () => {
    assert.equal(reg(4), SOUNDS);
    sounds.push(reg(5));
    return 0;
  });
  cpu.call(blob.symbols.get("rf_init")!, [0, SAVE, BLOB]);

  const levels = (
    field: number,
    mining: number,
    insects: number,
    mushroom: number,
    honey: number,
  ) => {
    cpu.setU8(FARM, field);
    cpu.setU8(FARM + 2, mining);
    cpu.setU8(FARM + 3, insects);
    cpu.setU8(FARM + 4, mushroom);
    cpu.setU8(FARM + 5, honey);
  };
  const list = (at: number, items: number[]) =>
    items.forEach((it, k) => cpu.setU16(at + k * 2, it));
  const read = (at: number, n: number) => Array.from({ length: n }, (_, k) => cpu.u16(at + k * 2));
  const plot = (k: number, items: [number, number][]) =>
    items.forEach(([it, n], j) => {
      cpu.setU16(FARM + 0xb4 + k * 40 + j * 2, it);
      cpu.setU8(FARM + 0xcc + k * 40 + j, n);
    });
  return {
    cpu,
    levels,
    list,
    read,
    plot,
    box,
    seen,
    log,
    sounds,
    drawn,
    /** A frame of the farm box's prompt, with `buttons` pressed: what its lookup gave. */
    prompt: (buttons = 0) => {
      pressed = buttons;
      drawn.length = 0;
      return cpu.call(hooks.calls[0]!, [MESSAGES, TEXT_ID]) >>> 0;
    },
    text: address.get(TEXT_ID)!,
  };
}

test("the prompt gets a second line while the farm holds anything", () => {
  const f = farm();
  f.levels(0, 0, 0, 0, 0);
  assert.equal(f.prompt(), f.text, "the game's lookup, as it was");
  assert.deepEqual(f.drawn, [], "an empty farm: the game's prompt alone");

  f.list(FARM + 0x08, [100]);
  assert.equal(f.prompt(), f.text);
  const width = ("Harvest All to Item Box".length + 4) * 7 + 0x24;
  assert.deepEqual(f.drawn, [
    ["print", 0x24, 0x22, " :Harvest All to Item Box"],
    ["banner", 0, 0x20, width, 0x10, 0x801d3905, 0],
    ["icon", 0x10, 0x20, 0x34, -1, 0x14],
  ]);
  assert.equal(f.box.size, 0, "nothing sent without △");
});

test("△ sends every spot the farm has to the Item Box", () => {
  const f = farm();
  f.levels(1, 1, 0, 2, 1);
  f.list(FARM + 0x08, [100, 100, 101, 0]); // mining point 0
  f.list(FARM + 0x10, [102, 0, 0, 0]); // mining point 1
  f.list(FARM + 0x18, [103, 103, 103, 103]); // mining point 2: not built
  f.list(FARM + 0x30, [110, 111, 0, 0]); // insect thicket 0
  f.list(FARM + 0x38, [112, 0, 0, 0]); // thicket 1: not built
  f.list(FARM + 0x58, [120, 120, 0, 0, 0, 0, 0, 0]); // tree level 1: not this one
  f.list(FARM + 0x68, [121, 121, 122, 0, 0, 0, 0, 0]); // tree level 2
  f.list(FARM + 0x88, [130, 130, 0, 0, 0, 0]); // hive level 1
  f.plot(0, [
    [140, 3],
    [141, 1],
  ]);
  f.plot(1, [[142, 2]]);
  f.plot(2, [[143, 5]]); // plot 2: not dug
  assert.equal(f.prompt(TRIANGLE), f.text);
  assert.deepEqual(Object.fromEntries(f.box), {
    100: 2,
    101: 1,
    102: 1,
    110: 1,
    111: 1,
    121: 2,
    122: 1,
    130: 2,
    140: 3,
    141: 1,
    142: 2,
  });
  assert.deepEqual(f.read(FARM + 0x08, 8), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(f.read(FARM + 0x18, 4), [103, 103, 103, 103], "what isn't built stays");
  assert.deepEqual(f.read(FARM + 0x38, 1), [112]);
  assert.deepEqual(f.read(FARM + 0x58, 2), [120, 120]);
  assert.equal(f.cpu.u16(FARM + 0xb4 + 80), 143);
  assert.deepEqual(f.read(FARM + 0xb4, 2), [0, 0]);
  assert.equal(f.cpu.u8(FARM + 0xcc), 0);
  assert.deepEqual(f.log, [
    140,
    141,
    142,
    100,
    101,
    102,
    110,
    111,
    121,
    122,
    130,
    "Sent 17 items to the Item Box.",
  ]);
  assert.deepEqual(f.sounds, [140]);
  assert.equal(f.seen.length, 14, "after each send, as the game");

  // Only what isn't built is left: no second line.
  f.levels(0, 0, 0, 0, 0);
  f.list(FARM + 0x18, [0, 0, 0, 0]);
  f.list(FARM + 0x38, [0]);
  f.list(FARM + 0x58, [0, 0]);
  f.cpu.setU16(FARM + 0xb4 + 80, 0);
  f.prompt(TRIANGLE);
  assert.deepEqual(f.drawn, []);
});

test("what doesn't fit stays at the front of its spot", () => {
  const f = farm(3);
  f.levels(0, 0, 0, 0, 0);
  f.list(FARM + 0x08, [100, 999, 101, 102]);
  f.plot(0, [[140, 4]]);
  f.prompt(TRIANGLE);
  // The plot first: 3 of its 4 fit, then nothing.
  assert.deepEqual(Object.fromEntries(f.box), { 140: 3, 100: 0, 101: 0, 102: 0 });
  assert.equal(f.cpu.u16(FARM + 0xb4), 140);
  assert.equal(f.cpu.u8(FARM + 0xcc), 1);
  assert.deepEqual(f.read(FARM + 0x08, 4), [100, 999, 101, 102], "999 the box never takes");
  assert.deepEqual(f.log, [140, "Sent 3 items. Item Box full."]);
});

test("a full box: nothing taken, and the log says so", () => {
  const f = farm(0);
  f.levels(0, 0, 0, 0, 0);
  f.list(FARM + 0x08, [100, 101]);
  f.prompt(TRIANGLE);
  assert.deepEqual(f.read(FARM + 0x08, 2), [100, 101]);
  assert.deepEqual(f.log, ["Nothing fit in the Item Box."]);
  assert.deepEqual(f.sounds, []);
});
