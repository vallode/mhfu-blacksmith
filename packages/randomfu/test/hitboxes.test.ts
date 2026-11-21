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
  rf_hud_line: 0x0882dac0,
};
const AREA = 3;
const SLOT = 2;

const runtime = () =>
  RUNTIME_OBJECTS.map((o) => ({ name: o.name, data: Buffer.from(o.base64, "base64") }));

type Line = [number, number, number, number];

/**
 * The blob in a CPU with a quest: a camera looking down -z from the origin
 * (view the identity; a projection of scale 1, w = -z), one monster in the
 * hunter's area and one live attack object it owns. The HUD's line routine
 * records what it draws.
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
  const lines: Line[] = [];
  const reg = (k: number) => cpu.reg[k]! >>> 0;
  cpu.native.set(EXTERNS.rf_hud_line, () => {
    assert.equal(reg(4), HUD);
    assert.deepEqual([reg(9), reg(10), reg(11)], [0xff, 0x30, 0x30]);
    lines.push([reg(5), reg(6), reg(7), reg(8)]);
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
    lines.length = 0;
    assert.equal(cpu.call(hooks.stubs[1]!, [HUD]), 0x5678, "the gauges' result is passed back");
    return lines.map((l) => [...l] as Line);
  };
  cpu.call(blob.symbols.get("rf_init")!, [0, 0x09999c60, BLOB]);
  return { cpu, frame, shapes, floats };
}

/** Every end of every line lies `r` (give or take the rounding) from (x, y). */
function onCircle(lines: Line[], x: number, y: number, r: number) {
  for (const [x0, y0, x1, y1] of lines) {
    for (const [px, py] of [
      [x0, y0],
      [x1, y1],
    ]) {
      assert.ok(
        Math.abs(Math.hypot(px! - x, py! - y) - r) < 1.5,
        `(${px}, ${py}) not on the circle`,
      );
    }
  }
}

test("a sphere on a joint is a circle where the joint is, its radius times the model's scale", () => {
  const q = quest();
  q.shapes([{ joint: 3, type: 0, radius: 100, start: [0, 0, 0] }]);
  const lines = q.frame();
  assert.equal(lines.length, 12);
  // (100, 0, -1000) is at 240 + 240 × 0.1, 136; 150 units at 1000 is 136 × 0.15 pixels.
  onCircle(lines, 264, 136, 20.4);
  assert.deepEqual(lines[0], [284, 136, 281, 146]);
});

test("a capsule is a circle at each end and the two lines joining them", () => {
  const q = quest();
  // Offsets in the joint's frame: 200 left and 200 right of it.
  q.shapes([{ joint: 3, type: 1, radius: 100, start: [-200, 0, 0], end: [200, 0, 0] }]);
  const lines = q.frame();
  assert.equal(lines.length, 26);
  onCircle(lines.slice(0, 12), 216, 136, 20.4);
  onCircle(lines.slice(12, 24), 312, 136, 20.4);
  assert.deepEqual(lines.slice(24), [
    [216, 156, 312, 156],
    [216, 115, 312, 115],
  ]);
});

test("a projectile's capsule runs between the object's own two points, unscaled", () => {
  const q = quest();
  q.floats(ATTACK + 0x40, [0, 0, -1000]);
  q.floats(ATTACK + 0x50, [0, 100, -1000]);
  q.shapes([{ joint: 0x7e, type: 1, radius: 100, start: [0, 0, 0], end: [0, 0, 0] }]);
  const lines = q.frame();
  assert.equal(lines.length, 26);
  onCircle(lines.slice(0, 12), 240, 136, 13.6);
  onCircle(lines.slice(12, 24), 240, 122.4, 13.6);
});

test("a shape placed by the object adds its offsets to the object's point", () => {
  const q = quest();
  q.floats(ATTACK + 0x40, [-100, 0, -1000]);
  q.shapes([{ joint: 0x7f, type: 0, radius: 50, start: [0, 0, 500] }]);
  // (-100, 0, -500): 48 left of the middle, 50 units at 500 is 13.6 pixels.
  onCircle(q.frame(), 192, 136, 13.6);
});

test("nothing for attacks that can't hit, a hunter's, another area's, or behind the camera", () => {
  const q = quest();
  q.shapes([{ joint: 3, type: 0, radius: 100, start: [0, 0, 0] }]);
  assert.equal(q.frame().length, 12);
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

test("lines are clipped to the screen", () => {
  const q = quest();
  // Centred at (470, 260), near the bottom right corner: the circle runs off both edges.
  q.shapes([{ joint: 3, type: 0, radius: 400, start: [858, -912, 0] }]);
  const lines = q.frame();
  assert.ok(lines.length > 0 && lines.length < 12);
  for (const [x0, y0, x1, y1] of lines) {
    for (const x of [x0, x1]) assert.ok(x >= 0 && x <= 479, `x ${x}`);
    for (const y of [y0, y1]) assert.ok(y >= 0 && y <= 271, `y ${y}`);
  }
});

test("nothing outside a quest", () => {
  const q = quest();
  q.shapes([{ joint: 3, type: 0, radius: 100, start: [0, 0, 0] }]);
  q.cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from("lobby_task\0"));
  assert.deepEqual(q.frame(), []);
});
