import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { linkBlob } from "../src/blob/link.js";
import { HOOK, assembleHooks } from "../src/patches/game-hooks.js";
import { codeSegment } from "../src/patches/mips.js";
import {
  EQUIPMENT_ICON_SIGNATURE,
  FILL_SIGNATURE,
  ITEM_ICON_SIGNATURE,
  ITEM_ICON_SIGNATURE_AT,
  TEXT_SETTERS,
  WINDOW_SIGNATURE,
  encodePactPool,
  findTextExterns,
  pactObjects,
  pactPool,
  type PactPool,
} from "../src/patches/pact.js";
import { Rng } from "../src/rng.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const HUD_UPDATE = 0x0883f270;
const GAUGES = 0x088405e4;
const CTRL_READ = 0x0890e120;
const REWARD_ROLL = 0x0886f894;
const CTRL = 0x09fffe00;
const HUD = 0x09a04ba0;
const QUEST = HUD + 0x1220;
const HEADER = 0x08a5c440;
const HUNTER = 0x090b3440;
const MANAGER = 0x09c10f20;
const PAD = 0x08b206dc;
const TABLES = HEADER + 0x780;
const PRINTER = 0x099712c0;
const SAVE = 0x09999c60;
const REWARD_BOX = SAVE + 0x390;
const EQUIPMENT_BOX = SAVE + 0x548;
const EXTERNS = {
  rf_game_task: 0x09a5f200,
  rf_monsters: 0x09c121b0,
  rf_em_chunks: 0x09bb89b0,
  rf_window: 0x0882fc50,
  rf_fill: 0x0882d8dc,
  rf_item_icon: 0x0882e2c0,
  rf_equipment_icon: 0x08831338,
  rf_pad: 0x08a62c64,
  rf_printer: 0x08a631a8,
  rf_print: 0x088920a8,
};
const LARGE = 77;
const SETTLE = 20;

const B = { start: 0x8, up: 0x10, down: 0x40, circle: 0x2000, cross: 0x4000 } as const;

/** Low Rank has one of each kind; High Rank only equipment; G Rank nothing. */
const POOL: PactPool = [
  [
    [{ id: 202, type: 0xff, amount: 10, name: "Iron Ore" }],
    [{ id: 203, type: 0xff, amount: 5, name: "Machalite Ore" }],
    [{ id: 204, type: 0xff, amount: 2, name: "Dragonite Ore" }],
    [{ id: 40, type: 5, amount: 1, name: "Bone Kris" }],
  ],
  [[], [], [], [{ id: 300, type: 1, amount: 1, name: "Rathalos Cap" }]],
  [[], [], [], []],
];

const runtime = () =>
  RUNTIME_OBJECTS.map((o) => ({ name: o.name, data: Buffer.from(o.base64, "base64") }));

/** The blob, the hooks and a quest in a CPU; the printer records the lines drawn. */
function quest(pool: PactPool = POOL) {
  const blob = linkBlob([...runtime(), ...pactObjects()], BLOB, EXTERNS, Infinity, {
    rf_pact_pool: encodePactPool(pool),
  });
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(HOOKS, BLOB, [
    { hook: HOOK.questFrame, target: HUD_UPDATE },
    { hook: HOOK.hud, target: GAUGES },
    { hook: HOOK.pad, target: CTRL_READ },
    { hook: HOOK.rewards, target: REWARD_ROLL },
  ]);
  cpu.load(HOOKS, hooks.code);
  const arg = (k: number) => cpu.reg[4 + k]! >>> 0;

  let lines: string[] = [];
  let windows: number[][] = [];
  let fills: number[][] = [];
  let icons: number[][] = [];
  let pieces: number[][] = [];
  let buttons = 0;
  let stickY = 0x80;
  const layers = () => [cpu.u8(HUD + 0x534), cpu.u8(PRINTER + 0x12f)];
  cpu.native.set(HUD_UPDATE, () => 0);
  cpu.native.set(GAUGES, () => 0);
  cpu.native.set(REWARD_ROLL, () => 0);
  // The system's controller read, into a SceCtrlData: buttons at +4, the stick at +8.
  cpu.native.set(CTRL_READ, () => {
    cpu.setU32(arg(0) + 4, buttons);
    cpu.setU8(arg(0) + 8, 0x80);
    cpu.setU8(arg(0) + 9, stickY);
    return 1;
  });
  cpu.native.set(EXTERNS.rf_window, () => {
    assert.equal(arg(0), HUD);
    assert.equal(arg(2), 0, "no text of its own");
    assert.deepEqual(layers(), [14, 5], "on top of the HUD");
    const r = arg(1);
    windows.push([
      cpu.u16(r),
      cpu.u16(r + 2),
      cpu.u16(r + 4),
      cpu.u16(r + 6),
      cpu.u8(r + 8),
      cpu.u8(r + 11),
    ]);
    return 0;
  });
  // fill(hud, x, y, w, h, r, g, b, alpha): the ninth on the stack.
  cpu.native.set(EXTERNS.rf_fill, () => {
    assert.equal(arg(0), HUD);
    assert.deepEqual(layers(), [14, 5]);
    fills.push([...[1, 2, 3, 4, 5, 6, 7].map(arg), cpu.u32(cpu.reg[29]! >>> 0)]);
    return 0;
  });
  // itemIcon(hud, item, x, y, w, h, marks, alpha)
  cpu.native.set(EXTERNS.rf_item_icon, () => {
    assert.equal(arg(0), HUD);
    assert.deepEqual(layers(), [14, 5]);
    icons.push([1, 2, 3, 4, 5, 6, 7].map(arg));
    return 0;
  });
  // equipmentIcon(hud, type, id, x, y, w, h, alpha, dim): the ninth on the stack.
  cpu.native.set(EXTERNS.rf_equipment_icon, () => {
    assert.equal(arg(0), HUD);
    assert.deepEqual(layers(), [14, 5]);
    pieces.push([...[1, 2, 3, 4, 5, 6, 7].map(arg), cpu.u32(cpu.reg[29]! >>> 0)]);
    return 0;
  });
  cpu.native.set(EXTERNS.rf_print, () => {
    assert.equal(arg(0), PRINTER);
    assert.equal(cpu.string(arg(3)), "%s");
    assert.deepEqual(layers(), [14, 5]);
    // Without the colour (~Cnn) and button icon (~Bnn) codes.
    lines.push(
      Buffer.from(cpu.bytes(cpu.reg[8]! >>> 0, 80))
        .toString("utf8")
        .split("\0")[0]!
        .replace(/~[CB]\d\d/g, ""),
    );
    return 0;
  });

  cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from("game_task\0"));
  cpu.setU32(EXTERNS.rf_printer, PRINTER);
  cpu.setU32(EXTERNS.rf_pad, PAD);
  cpu.setU32(EXTERNS.rf_monsters, MANAGER);
  cpu.setU8(EXTERNS.rf_em_chunks + LARGE * 0x1d0 + 0x14f, 1);
  cpu.setU32(HUD + 0x530, HUNTER);
  cpu.setU8(HUD + 0x534, 9);
  cpu.setU8(PRINTER + 0x12f, 1);
  cpu.setU16(HUNTER + 0x2e4, 100);
  cpu.setU16(HUNTER + 0x41e, 100);
  cpu.setU16(HUNTER + 0x41c, 100);
  cpu.setU16(HUNTER + 0x55a, 300);
  cpu.setU16(HUNTER + 0x62e, 300);

  /**
   * The quest: 50 minutes, 900z (300z a faint), 50 HRP, a supply box, Low
   * Rank, and a large monster to hunt. `kind` makes it a delivery of 10 of
   * item 300 with no large monster, or a gathering quest: deliver the Paw
   * Pass Ticket (item 101) from the supply box.
   */
  const setUpQuest = (
    time = 90000,
    rank = 1,
    kind: "hunt" | "delivery" | "gathering" = "hunt",
    hrp = 50,
  ) => {
    cpu.write(HEADER, Buffer.alloc(0x900));
    cpu.setU32(QUEST + 0x10, time);
    cpu.setU32(QUEST + 0x14, 900);
    cpu.setU32(QUEST + 0x18, 300);
    cpu.setU32(QUEST + 0x4c, HEADER);
    // The reward tables, as the quest object points at them: the main one draws 3 times.
    cpu.setU32(QUEST + 0x5c, TABLES);
    cpu.load(TABLES, [0x0300_8000, 0x7a0, 0x0000_ffff]);
    cpu.setU16(QUEST + 0x714, 0x13be);
    cpu.setU32(HEADER + 0x08, 0x700);
    cpu.setU32(HEADER + 0x3c, hrp);
    cpu.setU8(HEADER + 0x44, rank);
    cpu.load(HEADER + 0x700, [0x0002_0064, 0x000a_0065, 0x01f4_0000]); // 2× 100, 10× 101, end (quest 500)
    if (kind === "hunt") {
      // One large monster table, its list: emID 77, then the end.
      cpu.setU32(HEADER + 0x14, 0x600);
      cpu.setU16(HEADER + 0x600, 1);
      cpu.setU32(HEADER + 0x60c, 0x640);
      cpu.setU16(HEADER + 0x640, LARGE);
      cpu.setU16(HEADER + 0x640 + 60, 0xffff);
      cpu.setU8(HEADER + 0x4c, 4);
    } else {
      const item = kind === "delivery" ? 300 : 101;
      const count = kind === "delivery" ? 10 : 1;
      cpu.setU8(HEADER + 0x4c, 2);
      cpu.setU16(HEADER + 0x70, item);
      cpu.setU16(HEADER + 0x72, count);
      cpu.load(HEADER + 0x28, [2, item | (count << 16)]);
    }
  };
  setUpQuest();

  const monster = (slot: number, hp: number, attack: number) => {
    const at = 0x090bd2e0 + slot * 0x53b0;
    cpu.setU32(MANAGER + 0x1220 + slot * 4, at);
    cpu.setU32(at + 4, 3);
    cpu.setU8(at + 0x1e8, LARGE);
    cpu.setU16(at + 0x2e4, hp);
    cpu.setU16(at + 0x41e, hp);
    const f = Buffer.alloc(4);
    f.writeFloatLE(attack);
    cpu.setU32(at + 0x380, f.readUInt32LE());
    return at;
  };
  const attackOf = (at: number) => {
    const f = Buffer.alloc(4);
    f.writeUInt32LE(cpu.u32(at + 0x380));
    return f.readFloatLE();
  };

  /** A frame: the pad, then game_task's HUD update and the gauges inside it. */
  const frame = (pressed = 0, hud = true, stick = 0x80) => {
    lines = [];
    windows = [];
    fills = [];
    icons = [];
    pieces = [];
    buttons = pressed;
    stickY = stick;
    cpu.call(hooks.stubs[2]!, [CTRL]);
    cpu.call(hooks.stubs[0]!, [HUD]);
    if (hud) cpu.call(hooks.stubs[1]!, [HUD]);
    return lines;
  };
  /** Presses a button for a frame, then lets go. */
  const press = (button: number) => {
    frame(button);
    return frame();
  };
  /** The frames a new quest waits before it draws its pacts. */
  const settle = () => {
    for (let k = 0; k < SETTLE; k++) frame();
  };
  cpu.call(blob.symbols.get("rf_init")!, [0, SAVE, BLOB]);
  settle();
  return {
    settle,
    cpu,
    frame,
    press,
    monster,
    attackOf,
    setUpQuest,
    windows: () => windows,
    fills: () => fills,
    icons: () => icons,
    pieces: () => pieces,
    layers,
    /** The quest is completed: the game rolls its rewards. */
    complete: () => cpu.call(hooks.stubs[3]!, [0x09a10000]),
    /** What the game gets: nothing while its input lock (`+0x17`) is set. */
    pad: () => (cpu.u8(PAD + 0x17) ? [0, 0] : [buttons, stickY]),
  };
}

type Quest = ReturnType<typeof quest>;

/**
 * The window's offers: each a box (□ or ■), its penalty, then its reward,
 * after a star unless it's an item or piece, which gets its icon instead.
 */
function offers(lines: string[]) {
  const out: { penalty: string; reward: string; star: boolean }[] = [];
  lines.forEach((line, k) => {
    if (line !== "□" && line !== "■") return;
    const star = lines[k + 2] === "★";
    out.push({ penalty: lines[k + 1]!, reward: lines[k + (star ? 3 : 2)]!, star });
  });
  return out;
}

test("a quest opens the window: three pacts, each a penalty and its reward, and a way out", () => {
  const q = quest();
  const lines = q.frame();
  assert.equal(lines[0], "Hunter's Pact");
  const o = offers(lines);
  assert.equal(o.length, 3);
  assert.equal(new Set(o.map((x) => x.penalty)).size, 3);
  for (const { reward } of o) {
    assert.match(
      reward,
      /^(Zenny \+\d+z|Quest rewards \+[123]|Iron Ore x10|Machalite Ore x5|Dragonite Ore x2|Bone Kris)$/,
    );
  }
  assert.ok(lines.includes("Hunt without a pact"));
  assert.equal(lines[1], "□", "no subtitle: the offers come next");
  assert.equal(lines.filter((l) => l === "□").length, 3, "three empty boxes");
});

test("while it's open the game gets no buttons, no stick, and the clock stands still", () => {
  const q = quest();
  q.frame();
  q.cpu.setU32(QUEST + 0x10, 89990); // the game ticks the clock
  q.frame(B.down);
  assert.deepEqual(q.pad(), [0, 0]);
  assert.equal(q.cpu.u32(QUEST + 0x10), 90000);
});

/** Moves from row `from` to the last row ("Seal the pact" / "Hunt without a pact") and presses it. */
function seal(q: Quest, from: number) {
  q.press(from === 0 ? B.up : B.down);
  q.press(B.circle);
}

test("taking no penalty changes nothing", () => {
  const q = quest();
  const m = q.monster(0, 3000, 1.5);
  q.frame();
  const state = () => [
    q.cpu.bytes(QUEST, 0x720),
    q.cpu.bytes(HEADER, 0x900),
    q.cpu.bytes(HUNTER, 0x700),
    q.cpu.bytes(SAVE, 0x2000),
  ];
  const before = state();
  // START does nothing here: the window stays, and the game doesn't get it.
  q.frame(B.start);
  assert.deepEqual(q.pad(), [0, 0]);
  assert.equal(q.frame()[0], "Hunter's Pact");
  seal(q, 0);
  // Circle is held back until it's let go; then the game gets the pad again.
  for (let k = 0; k < 5; k++) q.frame();
  q.frame(B.circle);
  assert.equal(q.pad()[0], B.circle);
  q.complete();
  assert.deepEqual(state(), before);
  assert.equal(q.cpu.u16(m + 0x41e), 3000);
  assert.equal(q.attackOf(m), 1.5);
  assert.deepEqual(q.frame(), [], "the window is closed");
});

/** Takes the offers that match, then seals; returns the offers. */
function take(q: Quest, wanted: (o: { penalty: string; reward: string }) => boolean) {
  const list = offers(q.frame());
  list.forEach((o, k) => {
    if (k > 0) q.press(B.down);
    if (wanted(o)) q.press(B.cross);
  });
  seal(q, 2);
  q.frame();
  return list;
}

type Kind = "hunt" | "delivery" | "gathering";

/** A new quest (its clock is fuller than the last one's), and its offers. */
function next(q: Quest, n: number, rank = 1, kind: Kind = "hunt", hrp = 50) {
  q.setUpQuest(90000 + n, rank, kind, hrp);
  q.settle();
  return offers(q.frame());
}

/** A quest whose offers include one matching `wanted` (the draw is random); its clock. */
function questOffering(
  wanted: (o: { penalty: string; reward: string }) => boolean,
  rank = 1,
  kind: Kind = "hunt",
) {
  const q = quest();
  for (let n = 1; n < 2000; n++) {
    if (next(q, n, rank, kind).some(wanted)) return { q, time: 90000 + n };
  }
  throw new Error("no offer matched");
}

const penalty = (re: RegExp) => (o: { penalty: string }) => re.test(o.penalty);
const reward = (re: RegExp) => (o: { reward: string }) => re.test(o.reward);

test("taking a pact shows it, and the last row seals", () => {
  const q = quest();
  q.frame();
  const lines = q.press(B.circle);
  assert.equal(lines.filter((l) => l === "■").length, 1);
  assert.ok(lines.includes("Seal the pact"));
  const off = q.press(B.circle);
  assert.ok(off.includes("Hunt without a pact"));
});

/** What a zenny or draws offer shows: the amount it adds. */
const amount = (o: { reward: string }) => Number(o.reward.match(/\d+/)![0]);
/** The penalty's weight, from the names in pact.c. */
const weightOf = (o: { penalty: string }) =>
  /\+30%|No supply|Weary/.test(o.penalty) ? 1 : /\+100%|One cart|twice/.test(o.penalty) ? 3 : 2;

test("a zenny reward pays the amount it shows", () => {
  const { q } = questOffering(reward(/^Zenny/));
  const list = take(q, reward(/^Zenny/));
  const zenny = list.find(reward(/^Zenny/))!;
  // Low Rank: half, all or twice the quest's 900z, but at least 600, 1200 or 2400.
  assert.equal(amount(zenny), [600, 1200, 2400][weightOf(zenny) - 1]);
  assert.equal(q.cpu.u32(QUEST + 0x14), 900 + amount(zenny));
  assert.equal(q.cpu.u32(QUEST + 0x18), Math.floor((300 * (900 + amount(zenny))) / 900));
  assert.equal(q.cpu.u32(HEADER + 0x3c), 50, "HRP as it was");
});

test("no HRP, and no two pacts in a window give the same thing", () => {
  // Iron Ore in every grade: it may come up once a window, never twice.
  const ore = (amount: number) => [{ id: 202, type: 0xff, amount, name: "Iron Ore" }];
  const q = quest([
    [ore(10), ore(5), ore(2), [{ id: 40, type: 5, amount: 1, name: "Bone Kris" }]],
    [[], [], [], []],
    [[], [], [], []],
  ]);
  let ores = 0;
  for (let n = 1; n < 300; n++) {
    const list = next(q, n);
    const here = list.filter(reward(/^Iron Ore/)).length;
    assert.ok(here <= 1, list.map((o) => o.reward).join(", "));
    ores += here;
    for (const o of list) assert.doesNotMatch(o.reward, /^HRP/);
    assert.equal(new Set(list.map((o) => o.reward.replace(/\d+/g, ""))).size, 3);
  }
  assert.ok(ores > 50, "it does come up");
});

test("a gathering quest offers no monster, delivery or time penalties", () => {
  const q = quest();
  const seen = new Set<string>();
  for (let n = 1; n < 200; n++) {
    for (const o of next(q, n, 1, "gathering")) seen.add(o.penalty);
  }
  assert.deepEqual([...seen].sort(), [
    "Frail: health capped at 50",
    "No supply box",
    "One cart: a faint fails",
    "Weary: stamina capped at half",
  ]);
});

test("a delivery asks for more: its target and its item objective", () => {
  const { q } = questOffering(penalty(/^Deliver twice/), 1, "delivery");
  take(q, penalty(/^Deliver twice/));
  assert.equal(q.cpu.u16(HEADER + 0x72), 20);
  assert.equal(q.cpu.u8(HEADER + 0x2e), 20);
  const half = questOffering(penalty(/^Deliver 50%/), 1, "delivery").q;
  take(half, penalty(/^Deliver 50%/));
  assert.equal(half.cpu.u16(HEADER + 0x72), 15);
  assert.equal(half.cpu.u8(HEADER + 0x2e), 15);
  // A delivery without a large monster never offers monster penalties.
  for (let n = 1; n < 100; n++) {
    for (const o of next(q, 5000 + n, 1, "delivery")) assert.doesNotMatch(o.penalty, /^Monsters/);
  }
});

test("the window waits for the quest to settle, and for its file", () => {
  const q = quest();
  q.setUpQuest(95000);
  for (let k = 0; k < SETTLE - 1; k++) assert.deepEqual(q.frame(), []);
  q.cpu.setU32(QUEST + 0x4c, 0); // not loaded yet
  for (let k = 0; k < 5; k++) assert.deepEqual(q.frame(), []);
  q.cpu.setU32(QUEST + 0x4c, HEADER);
  q.frame();
  assert.equal(q.frame()[0], "Hunter's Pact");
});

test("rewards match the penalty: light ones pay little, hard ones equipment", () => {
  const q = quest();
  for (let n = 1; n < 400; n++) {
    for (const o of next(q, n)) {
      if (/^Bone Kris$|^Dragonite/.test(o.reward)) {
        assert.match(o.penalty, /\+100%|One cart/);
      }
      if (/^Iron Ore/.test(o.reward)) assert.match(o.penalty, /\+30%|No supply|Weary/);
    }
  }
});

test("half the time", () => {
  const { q, time } = questOffering(penalty(/^Half the time$/));
  take(q, penalty(/^Half the time$/));
  assert.equal(q.cpu.u32(QUEST + 0x10), Math.floor(time / 2));
  assert.equal(q.cpu.u16(QUEST + 0x714), 0xffff, "the quest file is read again next time");
  assert.deepEqual(q.frame(), [], "sealed");
});

test("one cart: the first faint takes the whole reward", () => {
  const { q } = questOffering(penalty(/^One cart/));
  take(q, penalty(/^One cart/));
  assert.equal(q.cpu.u32(QUEST + 0x18), q.cpu.u32(QUEST + 0x14));
});

/**
 * Quest text: an English block (Japanese, English and Korean point at it,
 * as on the EU disc) and a German one for the rest, with only their fail
 * conditions and details set. Returns each language's details, as the
 * game reads them: the file's start plus the block's offset.
 */
function questText(q: Quest) {
  const strings = { en: 0x800, de: 0x830 };
  const blocks = { en: 0x860, de: 0x880 };
  const table = 0x8a0;
  q.cpu.write(HEADER + strings.en, Buffer.from("Reward Zero\nTime Over\0It seems that\0"));
  q.cpu.write(HEADER + strings.de, Buffer.from("Belohnung null\0Es scheint\0"));
  q.cpu.fill(HEADER + blocks.en, 0x40, 0);
  q.cpu.setU32(HEADER + blocks.en + 8, strings.en);
  q.cpu.setU32(HEADER + blocks.en + 12, strings.en + 22);
  q.cpu.setU32(HEADER + blocks.de + 8, strings.de);
  q.cpu.setU32(HEADER + blocks.de + 12, strings.de + 15);
  const slots = [blocks.en, blocks.en, blocks.de, blocks.de, blocks.de, blocks.de, blocks.en];
  slots.forEach((b, k) => q.cpu.setU32(table + HEADER + k * 4, b));
  q.cpu.setU32(HEADER + 0x60, table);
  const read = (address: number) => {
    const bytes = q.cpu.bytes(address, 400);
    return bytes.subarray(0, bytes.indexOf(0)).toString("utf8");
  };
  return {
    details: () =>
      slots.map((_, k) => {
        const block = q.cpu.u32(HEADER + table + k * 4);
        return read((HEADER + q.cpu.u32(HEADER + block + 12)) >>> 0);
      }),
    /** Everything but the details' offsets. */
    rest: () => [
      q.cpu.bytes(HEADER + strings.en, 0x60),
      q.cpu.bytes(HEADER + table, 28),
      [0, 4, 8, 16, 20].map((at) => q.cpu.u32(HEADER + blocks.en + at)),
      [0, 4, 8, 16, 20].map((at) => q.cpu.u32(HEADER + blocks.de + at)),
    ],
  };
}

test("the quest's details list the sealed pact in every language, in place of its description", () => {
  const { q } = questOffering(reward(/^Zenny/));
  const text = questText(q);
  const rest = text.rest();
  const list = take(q, () => true);
  const pact = list.map((o) => `${o.penalty}\n★ ${o.reward}`).join("\n");
  assert.deepEqual(text.details(), Array(7).fill(pact));
  assert.deepEqual(text.rest(), rest, "the fail conditions, other strings and tables as they were");
  // The zenny it lists is what the window showed and the quest now pays on top.
  assert.equal(q.cpu.u32(QUEST + 0x14), 900 + amount(list.find(reward(/^Zenny/))!));
  assert.equal(q.cpu.u16(QUEST + 0x714), 0xffff, "the quest file is read again next time");
});

test("the details list only the pacts taken, and stay as they were without one", () => {
  const { q } = questOffering(penalty(/^One cart/));
  const text = questText(q);
  const list = take(q, penalty(/^One cart/));
  const taken = list.find(penalty(/^One cart/))!;
  assert.equal(text.details()[1], `${taken.penalty}\n★ ${taken.reward}`);
  const none = quest();
  const before = questText(none).details();
  assert.equal(before[1], "It seems that");
  none.frame();
  seal(none, 0);
  none.frame();
  assert.deepEqual(questText(none).details(), before);
});

test("monsters' health and attack go up once each, and attack again after rage resets it", () => {
  const { q } = questOffering(penalty(/^Monsters' attack/));
  const m = q.monster(0, 3000, 1.5);
  const list = take(q, penalty(/^Monsters' (attack|health)/));
  const hp = list.find(penalty(/health/))?.penalty.match(/\+(\d+)%/)?.[1];
  const atk = Number(list.find(penalty(/attack/))!.penalty.match(/\+(\d+)%/)![1]);
  for (let k = 0; k < 3; k++) q.frame();
  const expectHp = hp ? Math.floor((3000 * (100 + Number(hp))) / 100) : 3000;
  assert.equal(q.cpu.u16(m + 0x41e), expectHp);
  assert.equal(q.cpu.u16(m + 0x2e4), expectHp);
  assert.ok(Math.abs(q.attackOf(m) - (1.5 * (100 + atk)) / 100) < 1e-5);
  // Rage sets the multiplier again.
  const f = Buffer.alloc(4);
  f.writeFloatLE(2);
  q.cpu.setU32(m + 0x380, f.readUInt32LE());
  q.frame();
  assert.ok(Math.abs(q.attackOf(m) - (2 * (100 + atk)) / 100) < 1e-5);
  q.frame();
  assert.ok(Math.abs(q.attackOf(m) - (2 * (100 + atk)) / 100) < 1e-5, "once per change");
});

test("no supply box empties the list, keeping its end marker", () => {
  const { q } = questOffering(penalty(/^No supply box$/));
  take(q, penalty(/^No supply box$/));
  assert.equal(q.cpu.u16(HEADER + 0x700), 0);
  assert.equal(q.cpu.u16(HEADER + 0x702), 500);
});

test("frail and weary cap the hunter's health and stamina", () => {
  const { q } = questOffering(penalty(/^Frail/));
  take(q, penalty(/^Frail|^Weary/));
  assert.equal(q.cpu.u16(HUNTER + 0x41e), 50);
  assert.equal(q.cpu.u16(HUNTER + 0x2e4), 50);
});

test("more quest rewards: the main table draws as many more times", () => {
  const draws = reward(/^Quest rewards/);
  const { q } = questOffering(draws);
  const list = take(q, draws);
  const more = list.find(draws)!;
  assert.equal(amount(more), weightOf(more), "one more draw per weight");
  assert.equal(q.cpu.u8(TABLES + 3), 3 + amount(more));
  assert.equal(q.cpu.u16(QUEST + 0x714), 0xffff, "the file is read afresh next time");
});

test("more quest rewards are offered only where all of them fit in 9 draws", () => {
  const q = quest();
  for (const base of [7, 9]) {
    const seen = new Set<number>();
    for (let n = 1; n < 300; n++) {
      q.setUpQuest(90000 + n);
      q.cpu.setU8(TABLES + 3, base);
      q.settle();
      for (const o of offers(q.frame()).filter(reward(/^Quest rewards/))) seen.add(amount(o));
    }
    // 7 draws: room for +1 and +2, not +3; 9: none.
    assert.deepEqual([...seen].sort(), base === 7 ? [1, 2] : []);
  }
});

test("a quest with no reward tables offers no more of them", () => {
  const q = quest();
  for (let n = 1; n < 100; n++) {
    q.setUpQuest(90000 + n);
    q.cpu.setU32(QUEST + 0x5c, 0);
    q.settle();
    for (const o of offers(q.frame())) assert.doesNotMatch(o.reward, /^Quest rewards/);
  }
});

test("a penalty with nothing left to pay gives way to one that has", () => {
  // One item a grade and no reward tables: once zenny and a grade's item are
  // offered, a third penalty of that weight has nothing left, so another
  // penalty takes its place instead of paying zenny again.
  const q = quest();
  for (let n = 1; n < 300; n++) {
    q.setUpQuest(90000 + n);
    q.cpu.setU32(QUEST + 0x5c, 0);
    q.settle();
    const list = offers(q.frame());
    assert.equal(list.length, 3);
    assert.equal(new Set(list.map((o) => o.reward)).size, 3, list.map((o) => o.reward).join(", "));
  }
});

test("item and equipment rewards are paid when the quest is completed", () => {
  const { q } = questOffering(reward(/^Bone Kris$/));
  // What the quest's own roll left: two items, then a sorted box.
  q.cpu.load(REWARD_BOX, [0x0001_00c8, 0x0003_00c9]);
  // Two pieces of equipment already in the box.
  q.cpu.load(EQUIPMENT_BOX, [0x00030501, 0, 0, 0x00070101, 0, 0]);
  const list = take(q, (o) => /x\d+$|^Bone Kris$/.test(o.reward));
  assert.equal(q.cpu.u32(EQUIPMENT_BOX + 24), 0, "nothing until the quest is done");
  q.complete();
  const items = list.filter(reward(/x\d+$/));
  items.forEach((o, k) => {
    const [, amount] = o.reward.match(/x(\d+)$/)!;
    const id = { "Iron Ore": 202, "Machalite Ore": 203, "Dragonite Ore": 204 }[
      o.reward.replace(/ x\d+$/, "")
    ];
    assert.equal(q.cpu.u16(REWARD_BOX + 8 + k * 4), id);
    assert.equal(q.cpu.u16(REWARD_BOX + 10 + k * 4), Number(amount));
  });
  assert.equal(q.cpu.u16(REWARD_BOX + 8 + items.length * 4), 0);
  assert.deepEqual(
    [...q.cpu.bytes(EQUIPMENT_BOX + 24, 12)],
    [1, 5, 40, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "Bone Kris, a melee weapon, in the first free slot",
  );
  q.complete();
  assert.equal(q.cpu.u32(EQUIPMENT_BOX + 36), 0, "paid once");
});

test("a failed quest pays nothing: the next quest forgets the pact", () => {
  const { q } = questOffering(reward(/^Bone Kris$/));
  take(q, reward(/^Bone Kris$/));
  // Back to the village without completing it, then another quest.
  q.cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from("lobby_task"));
  q.frame(0, false);
  q.cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from("game_task\0"));
  q.setUpQuest(30000);
  q.settle();
  q.frame();
  seal(q, 0);
  q.frame();
  q.complete();
  assert.equal(q.cpu.u32(EQUIPMENT_BOX), 0);
});

test("rewards come from the quest's rank", () => {
  const { q } = questOffering(reward(/^Rathalos Cap$/), 2);
  for (let n = 1; n < 200; n++) {
    for (const o of next(q, 3000 + n, 2)) {
      assert.doesNotMatch(o.reward, /Ore|Bone Kris/, "nothing from Low Rank");
    }
  }
  // G Rank's pool is empty: bonuses only.
  for (let n = 1; n < 50; n++) {
    for (const o of next(q, 6000 + n, 5)) {
      assert.match(o.reward, /^Zenny \+\d+z$|^Quest rewards \+\d$/);
    }
  }
});

test("the next quest starts afresh, and a hidden HUD lets go of the pad", () => {
  const q = quest();
  q.frame();
  q.press(B.circle);
  seal(q, 0);
  q.frame();
  q.setUpQuest(90000);
  // The new quest's clock is full again.
  q.cpu.setU32(QUEST + 0x10, 80000);
  q.frame();
  q.setUpQuest(90000);
  q.settle();
  const lines = q.frame();
  assert.equal(lines.filter((l) => l === "□").length, 3);
  for (let k = 0; k < 4; k++) q.frame(0, false);
  q.frame(B.circle, false);
  assert.equal(q.pad()[0], B.circle);
});

test("the text externs are found in an EBOOT with the game's own words", () => {
  const VADDR = 0x08804000;
  const CODE = 0x100;
  const elf = Buffer.alloc(CODE + 0x2000);
  elf.writeUInt32LE(0x464c457f, 0);
  elf.writeUInt32LE(0x34, 0x1c);
  elf.writeUInt16LE(1, 0x2c);
  elf.writeUInt32LE(1, 0x34);
  elf.writeUInt32LE(CODE, 0x38);
  elf.writeUInt32LE(VADDR, 0x3c);
  elf.writeUInt32LE(0x2000, 0x44);
  const put = (vaddr: number, words: readonly number[]) =>
    words.forEach((w, k) => elf.writeUInt32LE(w >>> 0, CODE + vaddr - VADDR + k * 4));
  const setters = VADDR + 0x100;
  const fill = VADDR + 0x400;
  const pad = VADDR + 0xc00;
  const print = VADDR + 0x1800;
  const itemIcon = VADDR + 0x1400;
  const equipmentIcon = VADDR + 0x1c00;
  // Unmasked, as on the disc: `li a1, 5` and the stores' offsets are real.
  put(setters, TEXT_SETTERS);
  put(fill, FILL_SIGNATURE);
  put(itemIcon, [0x27bdffb0]);
  put(itemIcon + ITEM_ICON_SIGNATURE_AT, ITEM_ICON_SIGNATURE);
  put(equipmentIcon, EQUIPMENT_ICON_SIGNATURE);
  const window = VADDR + 0x1000;
  put(window, WINDOW_SIGNATURE);
  put(window + 0xfc, [0x0c000000 | ((print >>> 2) & 0x3ffffff)]);
  // `lui v0, hi; jal padRead; lw a0, lo(pad)(v0); lui v0, hi; jal reset; lw a0, lo(printer)(v0)`
  put(pad - 4, [0x3c020000 | 0x08a6, 0x0c000000, 0x8c440000 | 0x2c64]);
  put(pad + 8, [0x3c020000 | 0x08a6, 0x0c000000, 0x8c440000 | 0x31a8]);
  const found = findTextExterns(elf, { segment: codeSegment(elf)!, pad } as never);
  assert.deepEqual(found, {
    rf_printer: 0x08a631a8,
    rf_print: print,
    rf_window: window,
    rf_fill: fill,
    rf_item_icon: itemIcon,
    rf_equipment_icon: equipmentIcon,
    rf_pad: 0x08a62c64,
  });
});

test("a quest after the village starts afresh even with less time on its clock", () => {
  const { q } = questOffering(penalty(/^Monsters' health/));
  const m = q.monster(0, 3000, 1.5);
  const list = take(q, penalty(/^Monsters' health/));
  const hp = Number(list.find(penalty(/health/))!.penalty.match(/\+(\d+)%/)![1]);
  const boosted = Math.floor((3000 * (100 + hp)) / 100);
  assert.equal(q.cpu.u16(m + 0x41e), boosted);

  // Back to the village, where lobby_task loads in game_task's place.
  q.cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from("lobby_task"));
  q.frame(0, false);
  q.cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from("game_task\0"));
  // A shorter quest; its monster in the same memory, as tough as the last one ended.
  q.setUpQuest(30000);
  q.cpu.setU16(m + 0x2e4, boosted);
  q.settle();
  assert.equal(offers(q.frame()).length, 3, "the window opens");
  assert.equal(q.cpu.u16(m + 0x41e), boosted, "no pact yet: left as the game has it");
  assert.equal(q.cpu.u32(QUEST + 0x10), 30000);
});

test("the window is the item card's frame over a shaded screen, above the HUD", () => {
  const q = quest();
  const lines = q.frame();
  const [[x, y, w, h, glyph, style]] = q.windows() as [number[]];
  assert.equal(glyph, 14);
  assert.equal(style, 0, "the card's frame");
  assert.ok(x! + w! <= 480 && y! + h! <= 272, "on screen");
  const [shade, bar] = q.fills();
  assert.deepEqual(shade, [0, 0, 480, 272, 0, 0, 0, 0x90], "the screen, darkened");
  assert.ok(bar![0]! > x! && bar![1]! > y! && bar![7]! < 0x90, "the cursor's bar");
  assert.ok(lines.at(-1)!.includes("Choose"), "the controls");
  assert.deepEqual(q.layers(), [9, 1], "the HUD's own layers back after");
});

test("item and equipment rewards show their own icons; the others a star", () => {
  const item = reward(/ x\d+$/);
  const piece = reward(/^Bone Kris$/);
  const { q } = questOffering((o) => item(o));
  const list = offers(q.frame());
  const icons = q.icons();
  const items = list.filter(item);
  assert.equal(icons.length, items.length, "an icon for each item, none for the rest");
  for (const o of list) assert.equal(o.star, !item(o) && !piece(o), o.reward);

  // Bone Kris: a melee weapon (type 5), ID 40, by the game's routine in its rarity's colour.
  const kris = questOffering(piece).q;
  offers(kris.frame());
  const [[type, id, x, y, w, h, alpha, dim]] = kris.pieces() as [number[]];
  assert.deepEqual([type, id, w, h, alpha, dim], [5, 40, 16, 16, 0xff, 0]);
  assert.ok(x! > 0 && y! > 0 && x! + w! <= 480 && y! + h! <= 272, "on screen");
  const ids: Record<string, number> = {
    "Iron Ore": 202,
    "Machalite Ore": 203,
    "Dragonite Ore": 204,
  };
  items.forEach((o, k) => {
    const [id, x, y, w, h, marks, alpha] = icons[k]!;
    assert.equal(id, ids[o.reward.replace(/ x\d+$/, "")]);
    assert.deepEqual([w, h, marks, alpha], [16, 16, 0, 0xff], "the small icon, without overlays");
    assert.ok(x! > 0 && y! > 0 && x! + w! <= 480 && y! + h! <= 272, "on screen");
  });
});

test("the game's input lock holds while the window is open, and is handed back after", () => {
  const q = quest();
  q.frame();
  assert.equal(q.cpu.u8(PAD + 0x17), 1);
  // The stick moves the cursor too: down to the last row, then Circle.
  for (let k = 0; k < 3; k++) {
    q.frame(0, true, 0xff);
    q.frame();
  }
  q.frame(B.circle);
  assert.equal(q.cpu.u8(PAD + 0x17), 1, "held while Circle is down");
  assert.deepEqual(q.frame(), [], "the window is closed");
  assert.equal(q.cpu.u8(PAD + 0x17), 0);
});

test("a lock the game holds itself is left alone", () => {
  const q = quest();
  seal(q, 0);
  q.frame();
  assert.equal(q.cpu.u8(PAD + 0x17), 0);
  q.cpu.setU8(PAD + 0x17, 1); // say, a dialogue, as the next quest starts
  q.setUpQuest(95000);
  q.settle();
  q.frame();
  q.frame(B.up);
  q.frame(B.circle);
  q.frame();
  assert.equal(q.cpu.u8(PAD + 0x17), 1);
  q.cpu.setU8(PAD + 0x17, 0); // the dialogue closes
  q.frame();
  assert.equal(q.cpu.u8(PAD + 0x17), 0, "not set again: the pact was sealed with nothing");
});

test("the pool: items by rank and worth, equipment by rarity, wearable by anyone", () => {
  const tiers = new Map([
    [1, { band: "low" as const, stars: 3 }],
    [2, { band: "low" as const, stars: 2 }],
    [3, { band: "low" as const, stars: 1 }],
    [4, { band: "high" as const, stars: 4 }],
    [5, { band: "low" as const, stars: 1 }],
    [6, { band: "low" as const, stars: 1 }],
    [7, { band: "low" as const, stars: 1 }],
  ]);
  const values = new Map([
    [1, { price: 300, carry: 99 }], // a handful is worth grade 1, never more
    [2, { price: 2500, carry: 99 }], // four make grade 2
    [3, { price: 25000, carry: 99 }], // one is grade 3
    [4, { price: 3000, carry: 99 }],
    [5, { price: 0, carry: 10 }], // a supply item: worth nothing
    [6, { price: 12000, carry: 1 }], // an egg: doesn't stack
    [7, { price: 20, carry: 99 }], // a Herb: never worth a pact
  ]);
  const equipment = [
    { type: 5, id: 7, name: "Bone Kris", rarity: 0 },
    { type: 6, id: 9, name: "Hunter's Bow", rarity: 6 }, // rarity 7: High Rank
    { type: 1, id: 3, name: "Male Cap", rarity: 0, bits: 1 | 4 | 8 },
    { type: 1, id: 4, name: "Leather Cap", rarity: 0, bits: 1 | 2 | 4 | 8 },
  ];
  const pool = pactPool(tiers, values, equipment, new Rng("pool"));
  const ids = (b: number, k: number) => pool[b]![k]!.map((e) => e.id);
  assert.deepEqual(
    [0, 1, 2].map((g) => ids(0, g)),
    [[1], [2], [3]],
  );
  assert.deepEqual(
    pool[0]!.slice(0, 3).map((g) => g[0]!.amount),
    [10, 4, 1],
  );
  assert.deepEqual(ids(1, 0), [4], "High Rank's own items");
  assert.deepEqual(ids(0, 3), [4, 7], "armor first, and no male-only cap");
  assert.deepEqual(ids(1, 3), [9]);
  assert.deepEqual(pool[2], [[], [], [], []]);

  const bytes = encodePactPool(pool);
  // Low Rank's equipment: its span, then its first entry and that entry's name.
  const first = bytes.readUInt16LE(3 * 4);
  assert.equal(bytes.readUInt16LE(3 * 4 + 2), 2);
  const entry = 48 + first * 8;
  assert.equal(bytes.readUInt16LE(entry), 4);
  assert.equal(bytes[entry + 2], 1);
  const name = bytes.readUInt16LE(entry + 4);
  assert.equal(bytes.toString("latin1", name, bytes.indexOf(0, name)), "Leather Cap");
});
