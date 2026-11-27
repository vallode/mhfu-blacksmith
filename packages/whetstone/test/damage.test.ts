import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { decodeObjects, linkBlob } from "../src/blob/link.js";
import { damageObjects, MODE } from "../src/patches/damage.js";
import { HOOK, assembleHooks } from "../src/patches/game-hooks.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const HUD_UPDATE = 0x0883f270;
const GAUGES = 0x088405e4;
const STATUS_BUILDUP = 0x09c44f08;
const HUD = 0x09a04ba0;
const HUNTER = 0x090b3440;
const OTHER_HUNTER = 0x090b8000;
const MONSTER = 0x090bd2e0;
const ATTACK = 0x090c0000;
const HITBOX = 0x090c1000;
const ZONE = 0x090c2000;
const PRINTER = 0x08b10000;
const CAMERA = 0x08b20000;
const EXTERNS = {
  rf_game_task: 0x09a5f200,
  rf_printer: 0x08a631a8,
  rf_print: 0x088920a8,
  rf_camera: 0x089cbbe4,
  rf_project: 0x08814674,
  rf_joint_pos: 0x08865f24,
};
const JOINT = 3;
const PART = 2;

const f32 = (value: number) => {
  const b = Buffer.alloc(4);
  b.writeFloatLE(value);
  return b.readUInt32LE();
};

interface Print {
  x: number;
  y: number;
  text: string;
  /** The glyphs' height and width. */
  size: number;
  width: number;
  layer: number;
}

/** The blob, the hooks and a quest with a monster in a CPU. */
function quest(mode: number) {
  const blob = linkBlob([...decodeObjects(RUNTIME_OBJECTS), ...damageObjects()], BLOB, {
    ...EXTERNS,
    rf_damage_mode: mode,
  });
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(
    HOOKS,
    BLOB,
    [
      { hook: HOOK.questFrame, target: HUD_UPDATE },
      { hook: HOOK.hud, target: GAUGES },
    ],
    undefined,
    STATUS_BUILDUP,
  );
  cpu.load(HOOKS, hooks.code);

  const arg = (k: number) => cpu.reg[4 + k]! >>> 0;
  const float = (at: number) => cpu.bytes(at, 4).readFloatLE();
  cpu.native.set(HUD_UPDATE, () => 0x1234);
  cpu.native.set(GAUGES, () => 0x5678);
  cpu.native.set(STATUS_BUILDUP, () => {
    assert.deepEqual([arg(0), arg(1)], [MONSTER, ATTACK], "the call keeps its arguments");
    return 0x77;
  });
  // A joint sits 10 units along x per joint number; the screen is the world, flipped in y.
  cpu.native.set(EXTERNS.rf_joint_pos, () => {
    cpu.load(arg(1), [f32(arg(2) * 10), f32(20), f32(0)]);
    return 0;
  });
  cpu.native.set(EXTERNS.rf_project, () => {
    assert.equal(arg(0), CAMERA);
    assert.equal(arg(1) & 15, 0, "the out vector is 16-aligned");
    assert.equal(arg(2) & 15, 0, "the in vector is 16-aligned");
    const [x, y] = [float(arg(2)), float(arg(2) + 4)];
    cpu.load(arg(1), [f32(240 + x), f32(136 - y), f32(0.5), f32(1)]);
    return 0;
  });
  const prints: Print[] = [];
  cpu.native.set(EXTERNS.rf_print, () => {
    assert.equal(arg(0), PRINTER);
    assert.equal(cpu.string(arg(3)), "%s");
    prints.push({
      x: arg(1),
      y: arg(2),
      text: cpu.string(cpu.reg[8]! >>> 0),
      size: cpu.u8(PRINTER + 0x12d),
      width: cpu.u8(PRINTER + 0x12c),
      layer: cpu.u8(PRINTER + 0x12f),
    });
    return 0;
  });
  cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from("game_task\0"));
  cpu.setU32(EXTERNS.rf_printer, PRINTER);
  cpu.setU32(EXTERNS.rf_camera, CAMERA);
  cpu.setU8(PRINTER + 0x12c, 14);
  cpu.setU8(PRINTER + 0x12d, 14);
  cpu.setU8(PRINTER + 0x15f, 16);
  cpu.setU8(PRINTER + 0x12f, 3);
  cpu.setU32(HUD + 0x530, HUNTER);
  cpu.setU32(HUD + 0x1230, 90000);
  cpu.setU16(MONSTER + 0x2e4, 1000);
  cpu.setU32(MONSTER + 0x384, f32(1));
  cpu.setU16(HITBOX, JOINT);
  cpu.setU16(HITBOX + 6, 8 + PART); // only the low three bits are the part
  const acc = () => (cpu.u16(MONSTER + 0x3b8 + PART * 2) << 16) >> 16;
  /**
   * A hit as the game's hit function makes it: it has added the damage to
   * the part's, and calls the status buildup with its registers set.
   */
  const hit = (
    damage: number,
    o: { quality?: number; element?: number; flags?: number; shot?: number; by?: number } = {},
  ) => {
    cpu.setU16(MONSTER + 0x3b8 + PART * 2, damage);
    cpu.setU8(ATTACK + 0x74, o.quality ?? 1);
    cpu.setU16(ATTACK + 0x28, o.flags ?? 0);
    cpu.setU8(ZONE + 3, o.shot ?? 0);
    const regs: [number, number][] = [
      [16, ZONE],
      [17, damage],
      [18, HITBOX],
      [19, MONSTER],
      [20, o.by ?? HUNTER],
      [21, ATTACK],
    ];
    for (const [r, v] of regs) cpu.reg[r] = v;
    cpu.fbits[26] = f32(o.element ?? 0);
    const sp = cpu.reg[29];
    assert.equal(cpu.call(hooks.hit!, [MONSTER, ATTACK]), 0x77, "the call's result is passed back");
    assert.equal(cpu.reg[29], sp, "the stack is as it was");
    for (const [r, v] of regs) assert.equal(cpu.reg[r], v, "saved registers are kept");
    return acc();
  };
  /** A frame, `ticks` of the quest clock on: the quest frame, then the HUD. */
  const frame = (ticks = 1) => {
    cpu.setU32(HUD + 0x1230, cpu.u32(HUD + 0x1230) - ticks);
    prints.length = 0;
    cpu.call(hooks.stubs[0]!, [HUD]);
    assert.equal(cpu.call(hooks.stubs[1]!, [HUD]), 0x5678);
    assert.deepEqual(
      [0x12c, 0x12d, 0x15f, 0x12f].map((k) => cpu.u8(PRINTER + k)),
      [14, 14, 16, 3],
      "the printer is put back",
    );
    // Each number is four prints: its shadow twice, then itself twice (bold).
    return prints.filter((_, k) => k % 4 === 2).map((p) => ({ ...p }));
  };
  cpu.call(blob.symbols.get("rf_init")!, [0, 0x09999c60, BLOB]);
  frame();
  return { cpu, hit, frame, prints };
}

test("a hit pops its damage at the joint it struck, big, then settling and rising", () => {
  const q = quest(MODE.total);
  q.hit(40);
  const [first] = q.frame(0);
  // The joint is at (30, 20): on screen at 270, 116, less the pop's spread and
  // rise, and half the text (two digits, each half a glyph 29 wide).
  assert.deepEqual(first, { x: 248, y: 85, text: "~C1840", size: 26, width: 29, layer: 0 });
  const sizes = [first!.size];
  const ys = [first!.y];
  for (let k = 0; k < 5; k++) {
    const [p] = q.frame();
    sizes.push(p!.size);
    ys.push(p!.y);
  }
  assert.deepEqual(sizes, [26, 23, 20, 17, 14, 14], "it settles to its size");
  assert.ok(
    ys.every((y, k) => k === 0 || y + sizes[k]! / 2 < ys[k - 1]! + sizes[k - 1]! / 2),
    "and rises",
  );
  let frames = 5;
  while (q.frame().length) frames++;
  assert.equal(frames, 35, "it's gone after its life");
});

test("weak points are orange; the defense multiplier scales what's shown", () => {
  const q = quest(MODE.total);
  q.cpu.setU32(MONSTER + 0x384, 0x3f400000); // 0.75
  q.hit(40, { quality: 3 });
  q.hit(40, { quality: 0, shot: 45 }); // a shot at a part whose shot hitzone is 45
  q.hit(40, { quality: 0, shot: 44 });
  assert.deepEqual(
    q.frame(3).map((p) => p.text),
    ["~C1130", "~C1130", "~C0030"],
  );
});

test("split, the element's share is a second, smaller number in its colour", () => {
  const q = quest(MODE.split);
  q.hit(50, { element: 12.7, flags: 0x10 }); // fire
  q.hit(50, { element: 12.7, flags: 0x80 | 1 }); // ice, with poison
  const prints = q.frame(3);
  assert.deepEqual(
    prints.map((p) => p.text),
    ["~C0038", "~C1912", "~C0038", "~C0412"],
  );
  assert.ok(prints[1]!.size < prints[0]!.size);
  assert.ok(prints[1]!.x > prints[0]!.x, "to the right of the raw number");
});

test("total shows one number a hit", () => {
  const q = quest(MODE.total);
  q.hit(50, { element: 12.7, flags: 0x10 });
  assert.deepEqual(
    q.frame(3).map((p) => p.text),
    ["~C0050"],
  );
});

test("other hunters' hits show nothing, and nothing shows off screen or behind", () => {
  const q = quest(MODE.total);
  q.hit(40, { by: OTHER_HUNTER });
  assert.deepEqual(q.frame(0), []);
  q.cpu.setU16(HITBOX, 60); // joint 60 projects to x 840
  q.hit(40);
  assert.deepEqual(q.frame(0), []);
});

test("hits only show: the part's damage is left as the game made it", () => {
  const q = quest(MODE.split);
  assert.equal(q.hit(40, { quality: 3, element: 9, flags: 0x10 }), 40);
});

test("a dead monster's hits, and a new quest's leftovers, show nothing", () => {
  const q = quest(MODE.total);
  q.hit(40);
  assert.equal(q.frame(0).length, 1);
  q.cpu.setU32(HUD + 0x1230, 90000); // the clock went up: a new quest
  assert.deepEqual(q.frame(0), []);
  q.cpu.setU16(MONSTER + 0x2e4, 0);
  q.hit(40);
  assert.deepEqual(q.frame(0), []);
});

test("numbers are bold over a drop shadow", () => {
  const q = quest(MODE.total);
  q.hit(40);
  q.frame(0);
  const at = (k: number) => [q.prints[k]!.x, q.prints[k]!.y, q.prints[k]!.text];
  // Size 26: the shadow drops two pixels.
  assert.deepEqual([0, 1, 2, 3].map(at), [
    [250, 87, "~C0140"],
    [251, 87, "~C0140"],
    [248, 85, "~C1840"],
    [249, 85, "~C1840"],
  ]);
  assert.deepEqual(
    q.prints.map((p) => [p.size, p.width]),
    Array(4).fill([26, 29]),
    "glyphs a little wider than high",
  );
});

test("numbers flash as they land: white ones yellow, coloured ones white", () => {
  const q = quest(MODE.split);
  q.hit(50, { quality: 3, element: 12.7, flags: 0x10 });
  const texts = () => q.frame().map((p) => p.text);
  assert.deepEqual(texts(), ["~C0038", "~C0012"]);
  assert.deepEqual(texts(), ["~C0038", "~C0012"]);
  assert.deepEqual(texts(), ["~C1138", "~C1912"]);
  const r = quest(MODE.total);
  r.hit(40);
  assert.deepEqual(
    r.frame(0).map((p) => p.text),
    ["~C1840"],
  );
});

test("a weak point's number shakes as it lands; others don't", () => {
  const xs = (quality: number) => {
    const q = quest(MODE.total);
    q.hit(40, { quality });
    return [q.frame(0)[0]!.x, ...Array.from({ length: 9 }, () => q.frame()[0]!.x)];
  };
  const steady = xs(1);
  assert.equal(new Set(steady.slice(4)).size, 1, "a plain hit stays put once it's settled");
  const shaking = xs(3);
  assert.ok(new Set(shaking.slice(4, 8)).size > 1, "a weak hit shakes after it settles");
  assert.equal(new Set(shaking.slice(8)).size, 1, "then stops");
});

test("the mode chosen in game, kept in Whetstone's save data, wins over the disc's", () => {
  const q = quest(MODE.split);
  const saved = 0x09999c60 + 0x666e0 + 13; // struct rf_save_data's damage_numbers
  q.cpu.setU8(saved, 1); // off
  q.hit(50, { element: 12.7, flags: 0x10 });
  assert.deepEqual(q.frame(), [], "off: nothing shows");
  q.cpu.setU8(saved, 2); // total
  q.hit(50, { element: 12.7, flags: 0x10 });
  assert.equal(q.frame().length, 1, "total: one number, element and all");
});
