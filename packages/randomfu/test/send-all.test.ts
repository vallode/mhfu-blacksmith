import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { decodeObjects, linkBlob } from "../src/blob/link.js";
import { HOOK, MENU, MENU_ENTRIES, assembleHooks } from "../src/patches/game-hooks.js";
import { menuObjects } from "../src/patches/menu.js";
import { sendAllObjects } from "../src/patches/send-all.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const HUD_UPDATE = 0x0883f270;
const GAUGES = 0x088405e4;
const CTRL_READ = 0x0890e120;
const CTRL = 0x09fe0000;
const HUD = 0x09a04ba0;
const SAVE = 0x09999c60;
const REWARDS = SAVE + 0x390;
const PRINTER = 0x08b10000;
const LABEL_GETTER = 0x09a63198;
const GAME_MESSAGE = 0x09b00000;
const QUEST_DRAW = 0x0883fad4;
const S2 = 18;
const EXTERNS = {
  rf_game_task: 0x09a5f200,
  rf_printer: 0x08a631a8,
  rf_print: 0x088920a8,
  rf_window: 0x0882fc50,
  rf_box: 0x0882f580,
  rf_arrows: 0x0882e6f0,
  rf_quest_menu_id: 0x78,
  rf_village_menu_id: 0x09b051a0 + 13 * 2,
  rf_add_to_box: 0x08853abc,
  rf_item_seen: 0x08858f1c,
  rf_can_store: 0x0885c498,
  rf_can_store_object: 0x08a62c50,
  rf_sound: 0x08883988,
  rf_sound_object: 0x08a62d8c,
  rf_reward_names: 0x089b5564,
  rf_comrade_names: 0x089b556c,
  rf_reward_confirm: 0x4000,
  rf_help_rect: 0x0893b16c,
};
const CROSS = 0x4000;
const CIRCLE = 0x2000;
const ITEM_BOX = 0x09f00000;
const SOUNDS = 0x09f10000;

/** The reward screen in a CPU: the blob (send-all and the START menu), the hooks and the HUD. */
function screen(o: { loaded?: boolean } = {}) {
  const blob = linkBlob(
    [...decodeObjects(RUNTIME_OBJECTS), ...menuObjects(), ...sendAllObjects()],
    BLOB,
    EXTERNS,
  );
  const cpu = new Cpu();
  if (o.loaded !== false) cpu.write(BLOB, blob.image);
  const quest = {
    menu: MENU.quest,
    entry: MENU_ENTRIES.quest - 1,
    label: { call: 0x08818f14, target: LABEL_GETTER },
    placeholder: 0x78,
    select: { call: 0x08848f58, target: 0x08849120 },
    run: { call: 0x08849024, target: 0x08849214 },
    draw: { call: 0x0883f854, target: QUEST_DRAW },
  };
  const hooks = assembleHooks(
    HOOKS,
    BLOB,
    [
      { hook: HOOK.questFrame, target: HUD_UPDATE },
      { hook: HOOK.hud, target: GAUGES },
      { hook: HOOK.pad, target: CTRL_READ },
    ],
    undefined,
    undefined,
    [quest],
    [{ call: 0x0882f8a8, target: LABEL_GETTER }],
  );
  cpu.load(HOOKS, hooks.code);
  const arg = (k: number) => cpu.reg[4 + k]! >>> 0;
  let buttons = 0;
  cpu.native.set(HUD_UPDATE, () => 0);
  cpu.native.set(GAUGES, () => 0);
  cpu.native.set(CTRL_READ, () => {
    cpu.setU32(arg(0) + 4, buttons);
    return 1;
  });
  cpu.native.set(LABEL_GETTER, () => GAME_MESSAGE + arg(1));
  // The Item Box: room for `room` of each item, what's sent kept by item.
  const room = new Map<number, number>();
  const box = new Map<number, number>();
  const refused = new Set<number>();
  cpu.native.set(EXTERNS.rf_can_store, () => {
    assert.equal(arg(0), ITEM_BOX);
    return refused.has(arg(1)) ? 0 : 1;
  });
  cpu.native.set(EXTERNS.rf_add_to_box, () => {
    assert.equal(arg(0), SAVE);
    assert.equal(arg(3), 0xffff, "any slot");
    const item = arg(1);
    const amount = arg(2) | 0;
    const fits = Math.min(amount, room.get(item) ?? 99);
    room.set(item, (room.get(item) ?? 99) - fits);
    box.set(item, (box.get(item) ?? 0) + fits);
    return amount - fits;
  });
  const seen: number[] = [];
  cpu.native.set(EXTERNS.rf_item_seen, () => {
    assert.equal(arg(0), SAVE);
    seen.push(arg(1));
    return 0;
  });
  const sounds: number[] = [];
  cpu.native.set(EXTERNS.rf_sound, () => {
    assert.equal(arg(0), SOUNDS);
    assert.equal(arg(1), 0);
    sounds.push(arg(2));
    return 0;
  });
  /** The game's help draw, and what message it was asked for. */
  const helps: number[] = [];
  cpu.native.set(QUEST_DRAW, () => {
    assert.equal(arg(0), HUD);
    helps.push(cpu.u16(HUD + 0x5fc));
    return 0x1234;
  });
  const windows: { rect: number; text: string }[] = [];
  cpu.native.set(EXTERNS.rf_window, () => {
    windows.push({ rect: arg(1), text: cpu.string(arg(2)) });
    return 0;
  });
  cpu.setU32(EXTERNS.rf_can_store_object, ITEM_BOX);
  cpu.setU32(EXTERNS.rf_sound_object, SOUNDS);
  cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from("game_task\0"));
  cpu.setU32(EXTERNS.rf_printer, PRINTER);
  cpu.setU32(HUD + 0x1230, 90000);
  if (o.loaded !== false) cpu.call(blob.symbols.get("rf_init")!, [0, SAVE, BLOB]);

  /** box()'s label call for reward menu row `row`, from `names`. */
  const label = (row: number, names = EXTERNS.rf_reward_names) => {
    cpu.reg[S2] = row;
    const id = 0xa7 + row;
    const v0 = cpu.call(hooks.calls[0]!, [0x09a44000, id, names, 0]) >>> 0;
    assert.equal(cpu.reg[S2], row, "$s2 is kept");
    return v0 === GAME_MESSAGE + id ? "game's" : cpu.string(v0);
  };
  /** The reward screen in its menu, on `row`. */
  const menu = (row: number, comrade = false) => {
    cpu.setU8(HUD + 0x120a, 0);
    cpu.setU8(HUD + 0x120b, row);
    cpu.setU8(HUD + 0x1218, comrade ? 1 : 0);
    cpu.setU16(HUD + 0x5fe, 6);
    cpu.setU16(HUD + 0x5fc, row + 4);
    cpu.setU8(HUD + 0x5e8, 4);
  };
  /** The pad read alone: the buttons the game then sees. */
  const pad = (pressed: number) => {
    buttons = pressed;
    cpu.call(hooks.stubs[2]!, [CTRL]);
    return cpu.u32(CTRL + 4);
  };
  /** A frame: the pad read (what the game then sees), the menu's labels and the HUD's draw. */
  const frame = (pressed = 0) => {
    const seen = pad(pressed);
    for (let row = 0; row < 4; row++) label(row);
    helps.length = 0;
    windows.length = 0;
    assert.equal(cpu.call(hooks.menus[0]!.draw, [HUD]), 0x1234, "the draw's result is passed back");
    return seen;
  };
  const rewards = (slots: [number, number][]) => {
    cpu.fill(REWARDS, 32 * 4, 0);
    slots.forEach(([item, amount], k) => {
      cpu.setU16(REWARDS + k * 4, item);
      cpu.setU16(REWARDS + k * 4 + 2, amount);
    });
  };
  const slot = (k: number) => [cpu.u16(REWARDS + k * 4), cpu.u16(REWARDS + k * 4 + 2)];
  return {
    cpu,
    label,
    menu,
    pad,
    frame,
    rewards,
    slot,
    room,
    box,
    refused,
    seen,
    sounds,
    helps,
    windows,
  };
}

test("row 2 of either reward menu is Send All to Item Box; the rest are the game's", () => {
  const s = screen();
  assert.equal(s.label(0), "game's");
  assert.equal(s.label(1), "game's");
  assert.equal(s.label(2), "Send All to Item Box");
  assert.equal(s.label(3), "game's", "End, its ID written into the list's fourth");
  assert.equal(s.label(2, EXTERNS.rf_comrade_names), "Send All to Item Box");
  assert.equal(s.label(2, 0x089b6000), "game's", "another list's row 2");
});

test("the confirm button on the row sends every reward and ends the screen, the game never seeing it", () => {
  const s = screen();
  s.rewards([
    [0x10, 3],
    [0x20, 1],
    [0x30, 5],
  ]);
  s.menu(2);
  s.frame();
  assert.equal(s.frame(CROSS), 0, "the press is taken");
  assert.deepEqual(
    [...s.box],
    [
      [0x10, 3],
      [0x20, 1],
      [0x30, 5],
    ],
  );
  assert.deepEqual(s.seen, [0x10, 0x20, 0x30]);
  for (let k = 0; k < 32; k++) assert.deepEqual(s.slot(k), [0, 0]);
  assert.deepEqual(s.sounds, [25], "sent");
  assert.equal(s.cpu.u8(HUD + 0x120a), 6, "done, as End with nothing left");
  assert.equal(s.frame(CROSS), 0, "held, it stays taken");
  assert.equal(s.frame(CROSS | 0x10), 0x10, "only the confirm button");
  assert.equal(s.frame(0), 0);
  assert.deepEqual(s.sounds, [25], "once a press");
});

test("what doesn't fit stays, and an item the box can't take is left as it is", () => {
  const s = screen();
  s.rewards([
    [0x10, 5],
    [0x20, 2],
    [0x30, 4],
  ]);
  s.room.set(0x10, 2);
  s.refused.add(0x20);
  s.room.set(0x30, 0);
  s.menu(2);
  s.frame();
  s.frame(CROSS);
  assert.deepEqual(s.slot(0), [0x10, 3]);
  assert.deepEqual(s.slot(1), [0x20, 2]);
  assert.deepEqual(s.slot(2), [0x30, 4]);
  assert.deepEqual(s.sounds, [21], "the refusal: something's left");
  assert.equal(s.cpu.u8(HUD + 0x120a), 0, "the menu stays, for what's left");
});

test("with no rewards it ends, with End's sound", () => {
  const s = screen();
  s.rewards([]);
  s.menu(2);
  s.frame();
  s.frame(CROSS);
  assert.deepEqual(s.sounds, [19]);
  assert.equal(s.cpu.u8(HUD + 0x120a), 6);
});

test("the comrade's items are the first 16 slots", () => {
  const s = screen();
  s.rewards(Array.from({ length: 20 }, (_, k) => [0x100 + k, 1] as [number, number]));
  s.menu(2, true);
  s.frame();
  s.frame(CROSS);
  for (let k = 0; k < 16; k++) assert.deepEqual(s.slot(k), [0, 0]);
  for (let k = 16; k < 20; k++) assert.deepEqual(s.slot(k), [0x100 + k, 1]);
});

test("the confirm button goes to the game on other rows, and outside the menu", () => {
  const s = screen();
  s.rewards([[0x10, 1]]);
  for (const row of [0, 1, 3]) {
    s.menu(row);
    s.frame();
    assert.equal(s.frame(CROSS), CROSS, `row ${row}`);
    s.frame(0);
  }
  s.menu(2);
  s.cpu.setU8(HUD + 0x120a, 2); // sending item by item
  s.frame();
  assert.equal(s.frame(CROSS), CROSS, "not in the menu");
  assert.equal(s.frame(CIRCLE), CIRCLE, "not the confirm button");
  assert.deepEqual(s.slot(0), [0x10, 1]);
  assert.deepEqual(s.sounds, []);
});

test("away from the reward screen the confirm button is the game's", () => {
  const s = screen();
  s.rewards([[0x10, 1]]);
  s.menu(2);
  s.frame();
  // The menu stops being drawn (its labels not asked for): a few frames on, the press is the game's.
  for (let k = 0; k < 3; k++) s.pad(0);
  assert.equal(s.pad(CROSS), CROSS);
  assert.deepEqual(s.slot(0), [0x10, 1]);
});

test("the help bar: ours on Send All, End's on End, the game's on the rest", () => {
  const s = screen();
  for (const [row, game] of [
    [0, 4],
    [1, 5],
    [3, 6],
  ] as const) {
    s.menu(row);
    s.frame();
    assert.deepEqual(s.helps, [game], `row ${row}`);
    assert.deepEqual(s.windows, []);
  }
  s.menu(2);
  s.frame();
  assert.deepEqual(s.helps, [0xffff], "the game draws none");
  assert.equal(s.windows.length, 1);
  assert.equal(s.windows[0]!.rect, EXTERNS.rf_help_rect);
  assert.match(s.windows[0]!.text, /^Send every reward/);
  s.cpu.setU8(HUD + 0x5e8, 0);
  s.frame();
  assert.deepEqual(s.windows, [], "not while the game hides its help");
});

test("without the blob the hooks are the game's", () => {
  const s = screen({ loaded: false });
  assert.equal(s.label(2), "game's");
  s.rewards([[0x10, 1]]);
  s.menu(2);
  s.frame();
  assert.equal(s.frame(CROSS), CROSS);
  assert.deepEqual(s.helps, [6]);
  assert.deepEqual(s.slot(0), [0x10, 1]);
});
