import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { decodeObjects, linkBlob } from "../src/blob/link.js";
import { damageObjects } from "../src/patches/damage.js";
import {
  HOOK,
  MENU,
  MENU_ENTRIES,
  assembleHooks,
  type MenuSites,
} from "../src/patches/game-hooks.js";
import { menuObjects } from "../src/patches/menu.js";
import { monsterHpObjects } from "../src/patches/monster-hp.js";
import { R } from "../src/patches/mips.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const HUD_UPDATE = 0x0883f270;
const GAUGES = 0x088405e4;
const STATUS_BUILDUP = 0x09c44f08;
const HUD = 0x09a04ba0;
const PRINTER = 0x08b10000;
const SAVE = 0x09999c60;
/** `struct rf_save_data`'s damage_numbers (`blob/rf.h`). */
const SAVED_MODE = SAVE + 0x666e0 + 13;
const MESSAGE = 0x09b00000;
const COLOURS = 0x09ff0020;
const S2 = 18;
/** The village's label IDs, in lobby_task: the placeholder's is the 14th. */
const VILLAGE_IDS = 0x09b051a0;
const EXTERNS = {
  rf_game_task: 0x09a5f200,
  rf_printer: 0x08a631a8,
  rf_print: 0x088920a8,
  rf_camera: 0x089cbbe4,
  rf_project: 0x08814674,
  rf_joint_pos: 0x08865f24,
  rf_window: 0x0882fc50,
  rf_box: 0x0882f580,
  rf_arrows: 0x0882e6f0,
  rf_damage_mode: 2, // total (its mode + 1)
  // Monster health's, which only draws on hook 1 (not called here).
  rf_monsters: 0x09c121b0,
  rf_em_chunks: 0x09bb89b0,
  rf_hud_frame: 0x0882ac18,
  rf_hud_cap: 0x0882a9dc,
  rf_hud_fill: 0x0882d6f0,
  rf_map_shows: 0x08844578,
  rf_hud_sprite: 0x0882af70,
  rf_hud_sprites: 0x089391a8,
  rf_crowns: 0x08930bdc,
  rf_crown_groups: 0x0899bf40,
  rf_monster_hp_mode: 1, // off
  rf_quest_menu_id: 0x78,
  rf_village_menu_id: VILLAGE_IDS + 13 * 2,
};
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
  {
    menu: MENU.village,
    entry: MENU_ENTRIES.village - 1,
    label: { call: 0x08834a9c, target: 0x09a7b790 },
    placeholder: VILLAGE_IDS + 13 * 2,
    select: { call: 0x08834b84, target: 0x08834d3c },
    run: { call: 0x08834c4c, target: 0x08835098 },
    draw: { call: 0x088346c0, target: 0x08834730 },
  },
];
/** Each menu's open flag, state and cursor in the HUD object. */
const FIELDS = [
  { open: 0x52d, state: 0x57c, cursor: 0x57d },
  { open: 0x111d, state: 0x1118, cursor: 0x111c },
];
const B = { right: 0x20, left: 0x80, down: 0x40, cross: 0x4000, circle: 0x2000, start: 0x8 };

/** The blob (with damage numbers, unless `bare`, and monster health), the hooks and a HUD in a CPU, for `menu`. */
function game(menu: number, o: { bare?: boolean; loaded?: boolean; hp?: boolean } = {}) {
  const sites = SITES[menu]!;
  const fields = FIELDS[menu]!;
  const objects = [...decodeObjects(RUNTIME_OBJECTS), ...menuObjects()];
  if (!o.bare) objects.push(...damageObjects());
  if (o.hp) objects.push(...monsterHpObjects());
  const blob = linkBlob(objects, BLOB, EXTERNS);
  const cpu = new Cpu();
  if (o.loaded !== false) cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(
    HOOKS,
    BLOB,
    [
      { hook: HOOK.questFrame, target: HUD_UPDATE },
      { hook: HOOK.hud, target: GAUGES },
    ],
    undefined,
    STATUS_BUILDUP,
    SITES,
  );
  cpu.load(HOOKS, hooks.code);
  const stubs = hooks.menus[menu]!;
  const arg = (k: number) => cpu.reg[4 + k]! >>> 0;
  const calls: { fn: string; args: number[] }[] = [];
  cpu.native.set(HUD_UPDATE, () => 0);
  cpu.native.set(GAUGES, () => 0);
  cpu.native.set(sites.label.target, () => {
    // The game's getter: the label for the ID in $a1. It may use the temporaries.
    for (const r of [R.t0, R.t1, R.t2, R.t3]) cpu.reg[r] = 0x55555555;
    return MESSAGE + arg(1);
  });
  cpu.native.set(sites.select.target, () => {
    calls.push({ fn: "select", args: [arg(0), arg(1)] });
    return 0;
  });
  cpu.native.set(sites.run.target, () => {
    calls.push({ fn: "run", args: [arg(0), arg(1), arg(2)] });
    return 0x2000;
  });
  cpu.native.set(sites.draw.target, () => {
    calls.push({ fn: "draw", args: [arg(0)] });
    return 0x1234;
  });
  const prints: string[] = [];
  const windows: number[] = [];
  cpu.native.set(EXTERNS.rf_print, () => {
    prints.push(cpu.string(cpu.reg[8]! >>> 0));
    return 0;
  });
  /** The rows' y, where box() lays them out. */
  const rows: number[] = [];
  const arrows: number[] = [];
  cpu.native.set(EXTERNS.rf_box, () => {
    const list = arg(1);
    windows.push(cpu.u8(list + 11)); // the frame style
    assert.equal(cpu.u8(HUD + 0x534), 14, "the window draws above the HUD");
    assert.equal(arg(3) | 0, -1, "no cursor bar: the arrows are the cursor");
    assert.equal(cpu.reg[9], 3, "names as string pointers");
    prints.push(cpu.string(arg(2)));
    const names = cpu.u32(list + 0x14);
    rows.length = 0;
    for (let k = 0; k < cpu.u16(list + 0x12); k++) {
      prints.push(cpu.string(cpu.u32(names + k * 4)));
      rows.push(cpu.u16(list + 0xe) + k * cpu.u16(list + 0x10));
    }
    return 0;
  });
  cpu.native.set(EXTERNS.rf_arrows, () => {
    arrows.push(arg(2));
    return 0;
  });
  cpu.native.set(EXTERNS.rf_window, () => {
    windows.push(cpu.u8(arg(1) + 11));
    prints.push(cpu.string(arg(2)));
    return 0;
  });
  cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from("game_task\0"));
  cpu.setU32(EXTERNS.rf_printer, PRINTER);
  cpu.setU8(PRINTER + 0x12f, 3);
  cpu.setU8(HUD + 0x534, 10);
  cpu.setU32(HUD + 0x1230, 90000);
  if (o.loaded !== false) cpu.call(blob.symbols.get("rf_init")!, [0, SAVE, BLOB]);

  /** The list draw's label call for row `entry`, with its colour byte greyed. */
  const label = (entry: number) => {
    cpu.setU8(COLOURS, 0xa);
    cpu.reg[16] = COLOURS;
    // The quest names a row by its ID in $a1; the village by where the ID is, in $s2.
    const id = menu === MENU.quest ? (entry === sites.entry ? 0x78 : 0x6d + entry) : 0x1bb + entry;
    cpu.reg[S2] = VILLAGE_IDS + entry * 2;
    const v0 = cpu.call(stubs.label, [0x09a44000, id]) >>> 0;
    assert.equal(cpu.reg[16], COLOURS, "$s0 is kept");
    assert.equal(cpu.reg[S2], VILLAGE_IDS + entry * 2, "$s2 is kept");
    return { text: v0 === MESSAGE + id ? "game's" : cpu.string(v0), grey: cpu.u8(COLOURS) };
  };
  const select = (entry: number) => cpu.call(stubs.select, [HUD, entry]) | 0;
  /** A frame of an entry running: the menu's run call, then its layer's draw. */
  const run = (entry: number, buttons: number) => {
    const result = cpu.call(stubs.run, [HUD, entry, buttons]) | 0;
    prints.length = 0;
    windows.length = 0;
    arrows.length = 0;
    assert.equal(cpu.call(stubs.draw, [HUD]), 0x1234, "the draw's result is passed back");
    assert.equal(cpu.u8(HUD + 0x534), 10, "the HUD's layer is put back");
    assert.equal(cpu.u8(PRINTER + 0x12f), 3, "the printer's too");
    return result;
  };
  /** The menu as the game keeps it, with `entry` running. */
  const open = (entry = sites.entry) => {
    cpu.setU8(HUD + fields.open, 1);
    cpu.setU8(HUD + fields.state, 1);
    cpu.setU8(HUD + fields.cursor, entry);
  };
  return {
    ...{ cpu, hooks, label, select, run, open, calls, prints, windows, rows, arrows, blob },
    entry: sites.entry,
  };
}

const both = (name: string, fn: (menu: number) => void) => {
  for (const [key, menu] of Object.entries(MENU)) test(`${key} menu: ${name}`, () => fn(menu));
};

both("the placeholder entry is randomfu's: its label, not greyed", (menu) => {
  const g = game(menu);
  assert.deepEqual(g.label(0), { text: "game's", grey: 0xa }, "other rows are the game's");
  assert.deepEqual(g.label(g.entry), { text: "randomfu", grey: 0 });
});

both("without the blob, or with nothing to set, the menu is the game's", (menu) => {
  for (const g of [game(menu, { loaded: false }), game(menu, { bare: true })]) {
    assert.deepEqual(g.label(g.entry), { text: "game's", grey: 0xa });
    g.select(g.entry);
    g.open();
    g.run(g.entry, B.cross);
    assert.deepEqual(g.calls, [
      { fn: "select", args: [HUD, g.entry] },
      { fn: "run", args: [HUD, g.entry, B.cross] },
      { fn: "draw", args: [HUD] },
    ]);
    assert.deepEqual(g.windows, []);
  }
});

both("other entries go to the game's select and run, arguments and all", (menu) => {
  const g = game(menu);
  assert.equal(g.select(9), 0);
  g.open(9);
  assert.equal(g.run(9, B.down), 0x2000);
  assert.deepEqual(g.calls, [
    { fn: "select", args: [HUD, 9] },
    { fn: "run", args: [HUD, 9, B.down] },
    { fn: "draw", args: [HUD] },
  ]);
  assert.deepEqual(g.windows, [], "no window of ours");
});

both("the entry opens a window of settings; ○ goes back and START closes", (menu) => {
  const g = game(menu);
  g.cpu.setU8(HUD + 0x5e8, 0x4 | 0x1);
  assert.equal(g.select(g.entry), 0, "it's taken");
  assert.equal(g.cpu.u8(HUD + 0x5e8), 0x1, "its empty help bar goes");
  g.open();
  assert.equal(g.run(g.entry, 0), 0, "it stays open");
  assert.deepEqual(g.windows, [3, 0], "the START menu's frame, and the help's");
  assert.deepEqual(g.arrows, [g.rows[0]], "arrows on the setting's row");
  assert.ok(
    g.prints.some((p) => p.startsWith("Show the damage")),
    "its help",
  );
  assert.ok(g.prints.some((p) => p.includes("randomfu")));
  assert.ok(g.prints.some((p) => p.includes("Damage numbers")));
  assert.ok(
    g.prints.some((p) => p.includes("TOTAL")),
    "the disc's mode until it's changed",
  );
  assert.equal(g.run(g.entry, B.circle), 0x2000);
  assert.equal(g.select(g.entry), 0);
  assert.equal(g.run(g.entry, B.start), 0x8);
  assert.ok(
    g.calls.every((c) => c.fn === "draw"),
    "the game's select and run never see it",
  );
});

both("the window goes when the menu does", (menu) => {
  const g = game(menu);
  g.select(g.entry);
  g.open();
  g.cpu.setU8(HUD + FIELDS[menu]!.open, 0); // closed by the game
  g.run(g.entry, 0);
  assert.deepEqual(g.windows, []);
});

test("one menu's window doesn't draw in the other's layer", () => {
  const g = game(MENU.quest);
  g.select(g.entry);
  g.open();
  g.windows.length = 0;
  g.cpu.setU8(HUD + FIELDS[MENU.village]!.open, 1);
  g.cpu.native.set(SITES[MENU.village]!.draw.target, () => 0x1234);
  assert.equal(g.cpu.call(g.hooks.menus[MENU.village]!.draw, [HUD]), 0x1234);
  assert.deepEqual(g.windows, []);
  g.cpu.call(g.hooks.menus[MENU.quest]!.draw, [HUD]);
  assert.deepEqual(g.windows, [3, 0], "but does in its own");
});

both("changing damage numbers keeps the choice in the save and is used at once", (menu) => {
  const g = game(menu);
  g.select(g.entry);
  g.open();
  g.run(g.entry, B.right);
  assert.equal(g.cpu.u8(SAVED_MODE), 3, "split, kept as its choice + 1");
  assert.ok(g.prints.some((p) => p.includes("Split")));
  g.run(g.entry, B.cross);
  assert.equal(g.cpu.u8(SAVED_MODE), 1, "off, after split");
  g.run(g.entry, B.left);
  assert.equal(g.cpu.u8(SAVED_MODE), 3, "left goes back round");
  // Loaded again (another save load): the choice holds over the disc's.
  g.cpu.call(g.blob.symbols.get("rf_init")!, [0, SAVE, BLOB]);
  g.select(g.entry);
  g.run(g.entry, 0);
  assert.ok(g.prints.some((p) => p.includes("Split")));
});

both("each feature's setting is a row; up and down move the arrows and the help", (menu) => {
  const g = game(menu, { hp: true });
  g.select(g.entry);
  g.open();
  g.run(g.entry, 0);
  const names = g.prints.filter((p) => p === "Monster health" || p === "Damage numbers");
  assert.deepEqual(names, ["Monster health", "Damage numbers"], "in the web app's order");
  assert.equal(g.rows.length, 2);
  assert.deepEqual(g.arrows, [g.rows[0]]);
  assert.ok(
    g.prints.some((p) => p.startsWith("A health gauge")),
    "with its help",
  );
  assert.ok(g.prints.includes("OFF"), "the disc's monster health");
  g.run(g.entry, B.right);
  assert.equal(g.cpu.u8(SAVE + 0x666e0 + 14), 2, "on the map, kept as its choice + 1");
  assert.equal(g.cpu.u8(SAVED_MODE), 0, "damage numbers untouched");
  assert.ok(g.prints.includes("ON MAP"));
  g.run(g.entry, B.down);
  assert.deepEqual(g.arrows, [g.rows[1]], "on damage numbers");
  assert.ok(
    g.prints.some((p) => p.startsWith("Show the damage")),
    "with its help",
  );
});
