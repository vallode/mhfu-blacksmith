import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { decodeObjects, linkBlob } from "../src/blob/link.js";
import {
  HOOK,
  MENU,
  MENU_ENTRIES,
  assembleHooks,
  type HookSites,
} from "../src/patches/game-hooks.js";
import { menuObjects } from "../src/patches/menu.js";
import { BOX_SIGNATURE } from "../src/patches/menu.js";
import { hi16, jalTo } from "../src/patches/mips.js";
import {
  HELP_DRAW_SIGNATURE,
  REWARD_DRAW_SIGNATURE,
  REWARD_UPDATE_SIGNATURE,
  prepareSendAll,
  sendAllObjects,
} from "../src/patches/send-all.js";
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

test("the comrade's items are the first 16 slots; rewards past them keep the screen open", () => {
  const s = screen();
  s.rewards(Array.from({ length: 20 }, (_, k) => [0x100 + k, 1] as [number, number]));
  s.menu(2, true);
  s.frame();
  s.frame(CROSS);
  for (let k = 0; k < 16; k++) assert.deepEqual(s.slot(k), [0, 0]);
  for (let k = 16; k < 20; k++) assert.deepEqual(s.slot(k), [0x100 + k, 1]);
  assert.deepEqual(s.sounds, [25], "sent");
  assert.equal(s.cpu.u8(HUD + 0x120a), 0, "the menu stays, as End would ask to sell them");
});

test("a slot past the comrade's with an item but none of it counts as empty, as End's check", () => {
  const s = screen();
  s.rewards([
    [0x100, 1],
    ...Array.from({ length: 16 }, () => [0, 0] as [number, number]),
    [0x200, 0],
  ]);
  s.menu(2, true);
  s.frame();
  s.frame(CROSS);
  assert.equal(s.cpu.u8(HUD + 0x120a), 6);
});

test("the comrade's items all sent, it ends", () => {
  const s = screen();
  s.rewards(Array.from({ length: 16 }, (_, k) => [0x100 + k, 1] as [number, number]));
  s.menu(2, true);
  s.frame();
  s.frame(CROSS);
  assert.equal(s.cpu.u8(HUD + 0x120a), 6);
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

/**
 * A made-up EBOOT segment with the reward screen's code as `prepareSendAll`
 * reads it: the signatures, the words it checks and the addresses it takes.
 */
function rewardEboot(o: { drawArg?: number; namesWord?: number } = {}) {
  const vaddr = 0x08804000;
  const offset = 0x100;
  const size = 0x10000;
  const elf = Buffer.alloc(offset + size);
  const put = (at: number, word: number) => elf.writeUInt32LE(word >>> 0, offset + at - vaddr);
  const half = (at: number, value: number) => elf.writeUInt16LE(value, offset + at - vaddr);
  const words = (at: number, list: readonly number[]) => list.forEach((w, k) => put(at + k * 4, w));
  const lo = (address: number) => address & 0xffff;
  const at = {
    update: vaddr + 0x1000,
    draw: vaddr + 0x2000,
    box: vaddr + 0x3000,
    help: vaddr + 0x4000,
    caller: vaddr + 0x5000,
    template: vaddr + 0x8000,
    rewardNames: vaddr + 0x8100,
    comradeNames: vaddr + 0x8108,
    helpRect: vaddr + 0x8200,
    soundObject: vaddr + 0x8300,
    canStoreObject: vaddr + 0x8304,
    sound: 0x08880000,
    canStore: 0x08881000,
    addToBox: 0x08882000,
    itemSeen: 0x08883000,
    label: 0x09a63198,
  };
  words(at.update, REWARD_UPDATE_SIGNATURE);
  put(at.update + 0x6c, 0x3c020000 | hi16(at.soundObject));
  put(at.update + 0x70, 0x8c440000 | lo(at.soundObject));
  put(at.update + 0x8c, jalTo(at.sound));
  put(at.update + 0xf4, 0x3c020000 | hi16(at.canStoreObject));
  put(at.update + 0x14c, 0x8c440000 | lo(at.canStoreObject));
  put(at.update + 0x150, jalTo(at.canStore));
  put(at.update + 0x1a0, jalTo(0x08884000)); // nav
  put(at.update + 0x1a4, 0x24070003);
  put(at.update + 0x1c0, 0x30624000);
  put(at.update + 0x1c8, 0x30622000);
  put(at.update + 0x260, 0x9283120b);
  put(at.update + 0x264, 0x24020002);
  put(at.update + 0x268, 0x10620003);
  put(at.update + 0x270, 0xa282120b);
  put(at.update + 0x72c, jalTo(at.addToBox));
  put(at.update + 0x74c, jalTo(at.itemSeen));
  words(at.draw, REWARD_DRAW_SIGNATURE);
  put(at.draw + 0x464, 0x3c030000 | hi16(at.comradeNames));
  put(at.draw + 0x468, 0x24630000 | lo(at.comradeNames));
  put(at.draw + 0x480, 0x3c050000 | hi16(at.template));
  put(at.draw + 0x48c, 0x24a50000 | lo(at.template));
  put(at.draw + 0x498, jalTo(0x08885000));
  put(at.draw + 0x49c, 0x24090004);
  put(at.draw + 0x4ac, 0x3c030000 | hi16(at.rewardNames));
  put(at.draw + 0x4f4, 0x24630000 | lo(at.rewardNames));
  // Each list's row height: after its names, `li $v1, height; lui $v0; sh $v1, +8`.
  for (const [branch, height] of [
    [0x474, 24],
    [0x4c0, 22],
    [0x500, 22],
  ] as const) {
    put(at.draw + branch - 8, 0x3c020000 | hi16(at.template));
    put(at.draw + branch - 4, 0xac430000 | lo(at.template + 0xc));
    put(at.draw + branch, 0x24030000 | height);
    put(at.draw + branch + 4, 0x3c020000 | hi16(at.template));
    put(at.draw + branch + 8, 0xa4430000 | lo(at.template + 8));
  }
  put(at.draw + 0x524, jalTo(0x08885000));
  put(at.draw + 0x528, 0x24090004);
  words(at.box, BOX_SIGNATURE);
  put(at.box + 0x2a8, o.namesWord ?? 0x8e860014);
  put(at.box + 0x324, 0x3c0209a4);
  put(at.box + 0x328, jalTo(at.label));
  put(at.box + 0x32c, 0x8c444c5c);
  words(at.help, HELP_DRAW_SIGNATURE);
  put(at.help + 0x25c, 0x3c100000 | hi16(at.helpRect));
  put(at.help + 0x260, 0x26100000 | lo(at.helpRect));
  put(at.caller, jalTo(at.draw));
  put(at.caller + 4, o.drawArg ?? 0x00002821);
  put(at.caller + 0x10, jalTo(at.update));
  put(at.caller + 0x14, 0x24050001); // li $a1, 1: the quest's
  put(at.caller + 0x20, jalTo(at.draw));
  put(at.caller + 0x24, 0x24050001); // town's
  half(at.template + 2, 28);
  half(at.template + 0xa, 3);
  for (const [names, first] of [
    [at.rewardNames, 0xa7],
    [at.comradeNames, 0xaa],
  ] as const) {
    [first, first + 1, first + 2, 0xffff].forEach((id, k) => half(names + k * 2, id));
  }
  const sites = { segment: { offset, vaddr, size } } as HookSites;
  const read = (address: number, bytes: 2 | 4) =>
    bytes === 2
      ? elf.readUInt16LE(offset + address - vaddr)
      : elf.readUInt32LE(offset + address - vaddr);
  return { elf, sites, at, read };
}

test("prepareSendAll finds the reward screen's addresses and the label call", () => {
  const { elf, sites, at } = rewardEboot();
  const found = prepareSendAll(elf, sites);
  assert.ok(typeof found !== "string", String(found));
  assert.deepEqual(found.externs, {
    rf_add_to_box: at.addToBox,
    rf_item_seen: at.itemSeen,
    rf_can_store: at.canStore,
    rf_can_store_object: at.canStoreObject,
    rf_sound: at.sound,
    rf_sound_object: at.soundObject,
    rf_reward_names: at.rewardNames,
    rf_comrade_names: at.comradeNames,
    rf_reward_confirm: 0x4000,
    rf_help_rect: at.helpRect,
  });
  assert.deepEqual(found.calls, [{ call: at.box + 0x328, target: at.label }]);
});

test("its patch makes the menu four rows, End's ID the fourth, 20 pixels a row and 14 higher", () => {
  const { elf, sites, at, read } = rewardEboot();
  const found = prepareSendAll(elf, sites);
  assert.ok(typeof found !== "string");
  const eboot = Buffer.from(elf);
  found.patch(eboot);
  const after = (address: number, bytes: 2 | 4) =>
    bytes === 2
      ? eboot.readUInt16LE(sites.segment.offset + address - sites.segment.vaddr)
      : eboot.readUInt32LE(sites.segment.offset + address - sites.segment.vaddr);
  assert.equal(after(at.template + 0xa, 2), 3, "each list writes its own rows");
  assert.equal(after(at.template + 2, 2), 14);
  assert.equal(after(at.rewardNames + 6, 2), 0xa9);
  assert.equal(after(at.comradeNames + 6, 2), 0xac);
  assert.equal(after(at.update + 0x1a4, 4), 0x26e70003, "nav's rows: 3 + the second argument");
  assert.equal(after(at.update + 0x264, 4), 0x26e20002, "back goes to End: 2 + it");
  const sw = (0xac430000 | ((at.template + 8) & 0xffff)) >>> 0;
  // lui $v1, rows; ori $v1, $v1, height; sw $v1, +8: rows and height at once.
  for (const [branch, rows, height] of [
    [0x474, 4, 20],
    [0x4c0, 3, 22],
    [0x500, 4, 20],
  ] as const) {
    assert.deepEqual(
      [0, 4, 8].map((k) => after(at.draw + branch + k, 4)),
      [0x3c030000 | rows, 0x34630000 | height, sw],
      `branch ${branch.toString(16)}`,
    );
  }
  // Nothing else moves.
  let changed = 0;
  for (let k = 0; k < eboot.length; k += 2) {
    if (eboot.readUInt16LE(k) !== elf.readUInt16LE(k)) changed++;
  }
  assert.equal(changed, 20);
  assert.equal(read(at.draw + 0x474, 4), 0x24030018, "the vanilla EBOOT is left as it was");
});

test("prepareSendAll refuses a disc that runs the screen with another argument, or whose box() differs", () => {
  const other = rewardEboot({ drawArg: 0x24050002 });
  assert.match(String(prepareSendAll(other.elf, other.sites)), /runs the reward screen/);
  const names = rewardEboot({ namesWord: 0x8e860018 });
  assert.match(String(prepareSendAll(names.elf, names.sites)), /list window code/);
});

test("prepareSendAll refuses a disc that could reach the draw otherwise: an overlay, a pointer, a lui and addiu", () => {
  const { elf, sites, at } = rewardEboot();
  const overlay = Buffer.alloc(0x100);
  const refused = (code: Buffer) =>
    assert.match(
      String(prepareSendAll(elf, sites, [{ code, offset: 0, size: code.length }])),
      /runs the reward screen/,
    );
  overlay.writeUInt32LE(jalTo(at.draw), 0x40);
  overlay.writeUInt32LE(0x24050002, 0x44); // li $a1, 2
  refused(overlay);
  overlay.writeUInt32LE(0x00002821, 0x44);
  assert.ok(
    typeof prepareSendAll(elf, sites, [{ code: overlay, offset: 0, size: 0x100 }]) !== "string",
  );
  overlay.writeUInt32LE(at.draw, 0x80); // a table of functions
  refused(overlay);
  const loads = Buffer.alloc(0x100);
  loads.writeUInt32LE(0x3c190000 | hi16(at.draw), 0x10); // lui $t9
  loads.writeUInt32LE(0x27390000 | (at.draw & 0xffff), 0x18); // addiu $t9, $t9
  refused(loads);
});
