import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { decodeObjects, linkBlob } from "../src/blob/link.js";
import { combineObjects } from "../src/patches/combine.js";
import {
  FIRST_CALL_SITE,
  MENU,
  MENU_ENTRIES,
  assembleHooks,
  type MenuSites,
} from "../src/patches/game-hooks.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const HUD = 0x09a04ba0;
const SAVE = 0x09999c60;
const POUCH = SAVE + 0x6aea6;
const PRINTER = 0x08b10000;
const OBJECT = 0x09c00000;
const HUNTER = 0x09b00000;
const RECIPE = 0x09bf0000;
const LOG = 0x09a10000;
/** EU's addresses (src/patches/combine.ts and menu.ts on the EU disc). */
const EXTERNS = {
  rf_combine: 0x0885b82c,
  rf_combine_site: FIRST_CALL_SITE,
  rf_combine_amounts: 0x089a5b50,
  rf_pouch_slot: 0x08856884,
  rf_pouch_room: 0x088569f8,
  rf_pouch_add: 0x088d72a4,
  rf_save_object: 0x089cc438,
  rf_log_text: 0x088307bc,
  rf_log_object: 0x089cbbec,
  rf_window: 0x0882fc50,
  rf_arrows: 0x0882e6f0,
  rf_printer: 0x08a631a8,
  rf_print: 0x088920a8,
};
/** combine_run's call of combine() (EU). */
const CALL = 0x0881e3f0;
const SITES: MenuSites[] = [
  {
    menu: MENU.quest,
    entry: MENU_ENTRIES.quest - 1,
    label: { call: 0x08818f14, target: 0x09a63198 },
    placeholder: 0x78,
    select: { call: 0x08848f58, target: 0x08849120 },
    run: { call: 0x08849024, target: 0x08849214 },
    draw: { call: 0x0883f854, target: 0x0883fad4 },
  },
];
const B = { right: 0x20, left: 0x80, up: 0x10, cross: 0x4000 };
const HERB = 0x0d;
const MUSHROOM = 0x2a;
const POTION = 0x5f;
const GARBAGE = 0x9b;

const utf8 = (s: string) => Buffer.from(s, "latin1").toString("utf8");

function pouch(o: { room?: number; each?: number } = {}) {
  const blob = linkBlob([...decodeObjects(RUNTIME_OBJECTS), ...combineObjects()], BLOB, EXTERNS);
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(HOOKS, BLOB, [], undefined, undefined, SITES, [
    { call: CALL, target: EXTERNS.rf_combine },
  ]);
  cpu.load(HOOKS, hooks.code);
  const arg = (k: number) => cpu.reg[4 + k]! >>> 0;
  const stubs = hooks.menus[MENU.quest]!;
  cpu.setU32(EXTERNS.rf_save_object, SAVE);
  cpu.setU32(EXTERNS.rf_log_object, LOG);
  cpu.setU32(EXTERNS.rf_printer, PRINTER);
  cpu.setU8(PRINTER + 0x12f, 3);
  cpu.setU8(HUD + 0x534, 10);
  // The menu has its Combine open, at "Combine?".
  cpu.setU8(HUD + 0x52d, 1);
  cpu.setU8(HUD + 0x57c, 1);
  cpu.setU8(HUD + 0x57d, 1);
  cpu.setU8(HUD + 0x5b8, 2);
  cpu.setU32(HUD + 0x5a8, RECIPE);
  cpu.setU16(RECIPE + 2, POTION);
  cpu.setU8(RECIPE + 5, 4);
  cpu.setU8(EXTERNS.rf_combine_amounts + 4, o.each ?? 1);

  const slots: [number, number][] = [];
  const put = (k: number, item: number, n: number) => {
    slots[k] = [item, n];
    cpu.setU16(POUCH + k * 4, item);
    cpu.setU16(POUCH + k * 4 + 2, n);
  };
  const ingredients = (item1: number, n1: number, item2: number, n2: number) => {
    put(0, item1, n1);
    put(3, item2, n2);
    cpu.setU16(HUD + 0x5ac, item1);
    cpu.setU16(HUD + 0x5ae, item2);
    cpu.setU8(HUD + 0x5b0, 0);
    cpu.setU8(HUD + 0x5b1, 3);
  };
  cpu.native.set(EXTERNS.rf_pouch_slot, () => {
    assert.equal(arg(0), SAVE);
    return POUCH + arg(1) * 4;
  });
  cpu.native.set(EXTERNS.rf_pouch_room, () => {
    assert.equal(arg(0), SAVE);
    assert.equal(arg(1), POTION);
    return o.room ?? 10;
  });
  /** The game's combine, succeeding or not as `outcomes` says (a success makes 1). */
  const outcomes: boolean[] = [];
  const combines: number[][] = [];
  cpu.native.set(EXTERNS.rf_combine, () => {
    combines.push([arg(0), arg(2), arg(3), cpu.reg[8]! >>> 0, cpu.reg[9]! >>> 0]);
    for (const item of [arg(3), cpu.reg[8]! >>> 0]) {
      const k = slots.findIndex((s) => s?.[0] === item);
      cpu.setU16(POUCH + k * 4 + 2, cpu.u16(POUCH + k * 4 + 2) - 1);
    }
    const ok = outcomes.shift() ?? true;
    cpu.setU8(arg(1), ok ? (o.each ?? 1) : 0);
    return ok ? POTION : -1;
  });
  const added: number[][] = [];
  cpu.native.set(EXTERNS.rf_pouch_add, () => (added.push([arg(0), arg(1), arg(2) | 0]), 0));
  const log: string[] = [];
  cpu.native.set(EXTERNS.rf_log_text, () => {
    assert.equal(arg(0), LOG);
    log.push(cpu.string(arg(1)));
    return 0;
  });
  const runs: number[] = [];
  cpu.native.set(SITES[0]!.run.target, () => (runs.push(arg(2)), 0));
  cpu.native.set(SITES[0]!.draw.target, () => 0);
  const drawn: string[] = [];
  cpu.native.set(EXTERNS.rf_window, () => {
    assert.equal(cpu.u8(HUD + 0x534), 14, "above the HUD");
    drawn.push(cpu.string(arg(2)));
    return 0;
  });
  cpu.native.set(EXTERNS.rf_print, () => (drawn.push(utf8(cpu.string(cpu.reg[8]! >>> 0))), 0));
  cpu.native.set(EXTERNS.rf_arrows, () => 0);
  cpu.call(blob.symbols.get("rf_init")!, [0, SAVE, BLOB]);

  return {
    cpu,
    ingredients,
    outcomes,
    combines,
    added,
    log,
    runs,
    drawn,
    /** A frame of the menu running Combine with `buttons`, and its draw. */
    frame: (buttons = 0) => {
      drawn.length = 0;
      cpu.call(stubs.run, [HUD, 1, buttons]);
      cpu.call(stubs.draw, [HUD]);
    },
    /** combine_run's × on Yes: the call, and the amount it leaves. */
    combine: () => {
      cpu.setU8(HUD + 0x5e5, 0xee);
      cpu.reg[8] = 0x55555555; // the stub doesn't keep $t0
      const result = cpu.call(hooks.calls[0]!, [OBJECT, HUD + 0x5e5, HUNTER, cpu.u16(HUD + 0x5ac)]);
      return { result: result | 0, amount: cpu.u8(HUD + 0x5e5) };
    },
  };
}

test("left and right pick how many, up to the ingredients; × combines that many", () => {
  const p = pouch();
  p.ingredients(HERB, 7, MUSHROOM, 5);
  p.frame();
  assert.deepEqual(p.drawn, ["How many?", "×1"]);
  for (let k = 0; k < 3; k++) p.frame(B.right | B.up);
  assert.deepEqual(p.drawn, ["How many?", "×4"]);
  assert.deepEqual(p.runs.slice(-1), [B.up], "the game gets the rest of the buttons");
  p.frame(B.right);
  p.frame(B.right); // past the 5 mushrooms: back to 1
  assert.deepEqual(p.drawn, ["How many?", "×1"]);
  p.frame(B.left);
  assert.deepEqual(p.drawn, ["How many?", "×5"]);

  assert.deepEqual(p.combine(), { result: POTION, amount: 5 });
  assert.equal(p.combines.length, 5);
  assert.deepEqual(p.combines[0], [OBJECT, HUNTER, HERB, MUSHROOM, 0]);
  assert.deepEqual(p.added, []);
  assert.deepEqual(p.log, []);
});

test("the pouch's room for the result limits it, by the most one combine makes", () => {
  const p = pouch({ room: 7, each: 3 });
  p.ingredients(HERB, 10, MUSHROOM, 10);
  p.frame(B.left);
  assert.deepEqual(p.drawn, ["How many?", "×2"]);
  assert.deepEqual(p.combine(), { result: POTION, amount: 6 });

  const same = pouch();
  same.ingredients(HERB, 7, HERB, 7);
  same.cpu.setU16(POUCH + 3 * 4, 0); // one stack of 7, picked twice
  same.cpu.setU8(HUD + 0x5b1, 0);
  same.frame(B.left);
  assert.deepEqual(same.drawn, ["How many?", "×3"], "two of the same: 7 makes 3");
});

test("one at most: the game's own Combine, untouched", () => {
  for (const [room, n1] of [
    [-1, 5],
    [10, 1],
  ] as const) {
    const p = pouch({ room });
    p.ingredients(HERB, n1, MUSHROOM, 5);
    p.frame(B.right);
    assert.deepEqual(p.drawn, [], "no count to pick");
    assert.deepEqual(p.runs, [B.right], "right moves the pouch's cursor as ever");
    assert.deepEqual(p.combine(), { result: POTION, amount: 1 });
    assert.equal(p.combines.length, 1);
  }
});

test("failures: their Garbage and a line in the log", () => {
  const p = pouch();
  p.ingredients(HERB, 5, MUSHROOM, 5);
  for (let k = 0; k < 3; k++) p.frame(B.right);
  p.outcomes.push(true, false, true, false);
  assert.deepEqual(p.combine(), { result: POTION, amount: 2 });
  assert.deepEqual(p.added, [[HUNTER, GARBAGE, 2]]);
  assert.deepEqual(p.log, ["2 of 4 combinations failed."]);

  const none = pouch();
  none.ingredients(HERB, 5, MUSHROOM, 5);
  none.frame(B.right);
  none.frame(B.right);
  none.outcomes.push(false, false, false);
  assert.deepEqual(none.combine(), { result: -1, amount: 0 }, "the game gives the first Garbage");
  assert.deepEqual(none.added, [[HUNTER, GARBAGE, 2]]);
  assert.deepEqual(none.log, ["3 of 3 combinations failed."]);
});

test("a new pair of ingredients starts again at one", () => {
  const p = pouch();
  p.ingredients(HERB, 5, MUSHROOM, 5);
  p.frame(B.right);
  p.frame(B.right);
  p.cpu.setU8(HUD + 0x5b8, 3);
  p.frame();
  assert.deepEqual(p.drawn, [], "only at Combine?");
  p.cpu.setU8(HUD + 0x5b8, 2);
  p.frame();
  assert.deepEqual(p.drawn, ["How many?", "×3"], "kept through the result, for ×'s repeat");
  p.cpu.setU8(HUD + 0x5b8, 0);
  p.frame();
  p.cpu.setU8(HUD + 0x5b8, 2);
  p.frame();
  assert.deepEqual(p.drawn, ["How many?", "×1"]);
});
