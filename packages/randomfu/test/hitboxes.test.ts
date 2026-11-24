import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { linkBlob } from "../src/blob/link.js";
import { HOOK, assembleHooks } from "../src/patches/game-hooks.js";
import { hitboxObjects } from "../src/patches/hitboxes.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const HUD_UPDATE = 0x0883f270;
const GAUGES = 0x088405e4;
const HUD = 0x09a04ba0;
const HUNTER = 0x090b3440;
const MANAGER = 0x09c10f20;
const POOL = 0x09c12730;
const RENDERER = 0x09998d30;
const MONSTER = 0x090bdc90;
const JOINTS = 0x090be620;
const ATTACK = 0x09c128a0;
const SHAPES = 0x09bff7a0;
const EXTERNS = {
  rf_game_task: 0x09a5f200,
  rf_monsters: 0x09c121b0,
  rf_attacks: 0x09c18fd0,
  rf_camera: 0x089cbbe4,
  rf_fill: 0x0882d8dc,
  rf_hitboxes_mode: 2, // on (+ 1)
};
const AREA = 3;
const SLOT = 2;

const runtime = () =>
  RUNTIME_OBJECTS.map((o) => ({ name: o.name, data: Buffer.from(o.base64, "base64") }));

/** A strip of the translucent fill: x, y, w, h. */
type Strip = [number, number, number, number];

/**
 * The blob in a CPU with a quest: a camera looking down -z from the origin
 * (view the identity; a projection of scale 1, w = -z), one monster in the
 * hunter's area and one live attack object it owns. The HUD's translucent
 * fill records what it draws.
 */
function quest() {
  const blob = linkBlob([...runtime(), ...hitboxObjects()], BLOB, EXTERNS);
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(HOOKS, BLOB, [
    { hook: HOOK.questFrame, target: HUD_UPDATE },
    { hook: HOOK.hud, target: GAUGES },
  ]);
  cpu.load(HOOKS, hooks.code);
  cpu.native.set(HUD_UPDATE, () => 0);
  cpu.native.set(GAUGES, () => 0x5678);
  const strips: Strip[] = [];
  const reg = (k: number) => cpu.reg[k]! >>> 0;
  cpu.native.set(EXTERNS.rf_fill, () => {
    assert.equal(reg(4), HUD);
    // Colour in $t1-$t3, alpha the ninth argument, on the stack.
    assert.deepEqual([reg(9), reg(10), reg(11), cpu.u32(reg(29))], [0xff, 0x40, 0x30, 0x50]);
    strips.push([reg(5), reg(6), reg(7), reg(8)]);
    return 0;
  });

  const floats = (at: number, values: number[]) =>
    values.forEach((v, k) => {
      const b = Buffer.alloc(4);
      b.writeFloatLE(v);
      cpu.setU32(at + k * 4, b.readUInt32LE());
    });
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from("game_task\0"));
  cpu.setU32(HUD + 0x530, HUNTER);
  cpu.setU16(HUNTER + 0x29a, AREA);
  cpu.setU32(EXTERNS.rf_monsters, MANAGER);
  cpu.setU32(EXTERNS.rf_attacks, POOL);
  cpu.setU32(EXTERNS.rf_camera, RENDERER);
  floats(RENDERER + 0xb80, identity);
  floats(RENDERER + 0xc00, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, -60, 0]);
  cpu.setU32(MANAGER + 0x1220 + SLOT * 4, MONSTER);
  cpu.setU32(MONSTER + 0x190, JOINTS);
  floats(MONSTER + 0x220, [1.5]);
  // Joint 3 sits 100 to the right and 1000 in front of the camera.
  floats(JOINTS + 3 * 0x250 + 0xd0, [...identity.slice(0, 12), 100, 0, -1000, 1]);

  cpu.setU32(POOL + 0x502c, ATTACK);
  cpu.setU32(ATTACK + 4, 0);
  cpu.setU8(ATTACK + 0xe, 0);
  cpu.setU8(ATTACK + 0xf, 1);
  cpu.setU8(ATTACK + 0x14, 2);
  cpu.setU8(ATTACK + 0x15, SLOT);
  cpu.setU16(ATTACK + 0x18, AREA);
  cpu.setU32(ATTACK + 0x34, SHAPES);
  const shapes = (
    list: { joint: number; type: number; radius: number; start: number[]; end?: number[] }[],
  ) => {
    list.forEach((s, k) => {
      const at = SHAPES + k * 0x28;
      cpu.setU16(at, s.joint);
      cpu.setU16(at + 2, s.type);
      floats(at + 0xc, [s.radius, ...s.start, ...(s.end ?? s.start)]);
    });
    cpu.setU16(SHAPES + list.length * 0x28, 0xffff);
  };

  const frame = () => {
    strips.length = 0;
    assert.equal(cpu.call(hooks.stubs[1]!, [HUD]), 0x5678, "the gauges' result is passed back");
    return strips.map((l) => [...l] as Strip);
  };
  cpu.call(blob.symbols.get("rf_init")!, [0, 0x09999c60, BLOB]);
  return { cpu, frame, shapes, floats };
}

/**
 * The strips stack without gaps or overlaps, and together cover the box
 * (left, top) to (right, bottom), give or take the rounding.
 */
function covers(strips: Strip[], left: number, top: number, right: number, bottom: number) {
  assert.ok(strips.length > 0, "no strips");
  for (let k = 1; k < strips.length; k++) {
    assert.equal(strips[k]![1], strips[k - 1]![1] + strips[k - 1]![3], `strip ${k} follows on`);
  }
  const near = (a: number, b: number, what: string) =>
    assert.ok(Math.abs(a - b) <= 1.5, `${what}: ${a}, not ${b.toFixed(1)}`);
  near(Math.min(...strips.map(([x]) => x)), left, "left");
  near(Math.max(...strips.map(([x, , w]) => x + w)), right, "right");
  near(strips[0]![1], top, "top");
  near(strips.at(-1)![1] + strips.at(-1)![3], bottom, "bottom");
}

/** The strips' widths, row by row. */
const widths = (strips: Strip[]) => strips.map(([, , w]) => w);

test("a sphere on a joint is filled where the joint is, its radius times the model's scale", () => {
  const q = quest();
  q.shapes([{ joint: 3, type: 0, radius: 100, start: [0, 0, 0] }]);
  const strips = q.frame();
  // (100, 0, -1000) is at 240 + 240 × 0.1, 136; 150 units at 1000 is 136 × 0.15 pixels.
  covers(strips, 264 - 20.4, 136 - 20.4, 264 + 20.4, 136 + 20.4);
  assert.ok(
    strips.slice(0, -1).every(([, , , h]) => h === 2),
    "2 pixels tall, the last maybe less",
  );
  // Round: narrow at the top and bottom, widest in the middle.
  const w = widths(strips);
  assert.ok(w[0]! < 20 && w.at(-1)! < 20 && Math.max(...w) >= 40);
});

test("a capsule fills both end circles and the band between them", () => {
  const q = quest();
  // Offsets in the joint's frame: 200 left and 200 right of it.
  q.shapes([{ joint: 3, type: 1, radius: 100, start: [-200, 0, 0], end: [200, 0, 0] }]);
  const strips = q.frame();
  covers(strips, 216 - 20.4, 136 - 20.4, 312 + 20.4, 136 + 20.4);
  // The band is as wide as the gap between the centres, even at its edge rows.
  assert.ok(widths(strips).every((w) => w >= 96));
});

test("a projectile's capsule runs between the object's own two points, unscaled", () => {
  const q = quest();
  q.floats(ATTACK + 0x40, [0, 0, -1000]);
  q.floats(ATTACK + 0x50, [0, 100, -1000]);
  q.shapes([{ joint: 0x7e, type: 1, radius: 100, start: [0, 0, 0], end: [0, 0, 0] }]);
  covers(q.frame(), 240 - 13.6, 122.4 - 13.6, 240 + 13.6, 136 + 13.6);
});

test("a shape placed by the object adds its offsets to the object's point", () => {
  const q = quest();
  q.floats(ATTACK + 0x40, [-100, 0, -1000]);
  q.shapes([{ joint: 0x7f, type: 0, radius: 50, start: [0, 0, 500] }]);
  // (-100, 0, -500): 48 left of the middle, 50 units at 500 is 13.6 pixels.
  covers(q.frame(), 192 - 13.6, 136 - 13.6, 192 + 13.6, 136 + 13.6);
});

test("nothing for attacks that can't hit, a hunter's, another area's, or behind the camera", () => {
  const q = quest();
  q.shapes([{ joint: 3, type: 0, radius: 100, start: [0, 0, 0] }]);
  assert.ok(q.frame().length > 0);
  for (const [at, value, restore] of [
    [ATTACK + 0x14, 1, 2],
    [ATTACK + 0xf, 0, 1],
    [ATTACK + 0xe, 0xff, 0],
    [ATTACK + 0x15, 20, SLOT],
  ] as const) {
    q.cpu.setU8(at, value);
    assert.deepEqual(q.frame(), [], `+${(at - ATTACK).toString(16)} = ${value}`);
    q.cpu.setU8(at, restore);
  }
  q.cpu.setU16(ATTACK + 0x18, AREA + 1);
  assert.deepEqual(q.frame(), []);
  q.cpu.setU16(ATTACK + 0x18, AREA);
  q.shapes([{ joint: 3, type: 0, radius: 100, start: [0, 0, 1100] }]);
  assert.deepEqual(q.frame(), []);
  q.shapes([{ joint: 0x7d, type: 0, radius: 100, start: [0, 0, 0] }]);
  assert.deepEqual(q.frame(), []);
});

test("strips are clipped to the screen", () => {
  const q = quest();
  // Centred at (470, 260), near the bottom right corner: the fill runs off both edges.
  q.shapes([{ joint: 3, type: 0, radius: 400, start: [858, -912, 0] }]);
  const strips = q.frame();
  assert.ok(strips.length > 0);
  for (const [x, y, w, h] of strips) {
    assert.ok(x >= 0 && w > 0 && x + w <= 480, `x ${x} w ${w}`);
    assert.ok(y >= 0 && h > 0 && y + h <= 272, `y ${y} h ${h}`);
  }
  assert.equal(strips.at(-1)![1] + strips.at(-1)![3], 272);
});

test("a shape tall on screen takes taller strips, not more of them", () => {
  const q = quest();
  // Right in front of the camera: far taller than the screen.
  q.shapes([{ joint: 3, type: 0, radius: 1000, start: [-100, 0, 700] }]);
  const strips = q.frame();
  assert.ok(strips.length <= 65, `${strips.length} strips`);
  covers(strips, 0, 0, 480, 272);
});

test("nothing outside a quest", () => {
  const q = quest();
  q.shapes([{ joint: 3, type: 0, radius: 100, start: [0, 0, 0] }]);
  q.cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from("lobby_task\0"));
  assert.deepEqual(q.frame(), []);
});

test("off in the START menu's setting draws nothing, and on again draws", () => {
  const q = quest();
  q.shapes([{ joint: 3, type: 0, radius: 100, start: [0, 0, 0] }]);
  // `struct rf_save_data`'s hitboxes (`blob/rf.h`): the menu's choice + 1.
  const saved = 0x09999c60 + 0x666e0 + 15;
  q.cpu.setU8(saved, 1);
  assert.deepEqual(q.frame(), []);
  q.cpu.setU8(saved, 2);
  assert.ok(q.frame().length > 0);
});
