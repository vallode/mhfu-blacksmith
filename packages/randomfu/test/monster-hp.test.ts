import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { BLOB_MAGIC, HEADER, linkBlob } from "../src/blob/link.js";
import { HOOK, assembleHooks } from "../src/patches/game-hooks.js";
import { monsterHpObjects } from "../src/patches/monster-hp.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const HUD_UPDATE = 0x0883f270;
const GAUGES = 0x088405e4;
const HUD = 0x09a04ba0;
const HUNTER = 0x090b3440;
const MANAGER = 0x09c10f20;
const EXTERNS = {
  rf_game_task: 0x09a5f200,
  rf_monsters: 0x09c121b0,
  rf_em_chunks: 0x09bb89b0,
  rf_hud_frame: 0x0882ac18,
  rf_hud_cap: 0x0882a9dc,
  rf_hud_fill: 0x0882d6f0,
  rf_map_shows: 0x08844578,
  rf_hud_sprite: 0x0882af70,
  rf_hud_sprites: 0x089391a8,
};
const AREA = 0x64;
const LARGE = 77;
const SMALL = 35;

const runtime = () =>
  RUNTIME_OBJECTS.map((o) => ({ name: o.name, data: Buffer.from(o.base64, "base64") }));

interface Draw {
  what: "frame" | "cap" | "fill" | "sprite";
  x: number;
  y: number;
  w?: number;
  h?: number;
  colour?: number[];
  sprite?: number[];
}

/** The blob, the hooks and a quest in a CPU: the HUD routines record what they draw. */
function quest(mode: "painted" | "always") {
  const blob = linkBlob([...runtime(), ...monsterHpObjects()], BLOB, {
    ...EXTERNS,
    rf_monster_hp_mode: mode === "painted" ? 1 : 2,
  });
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(HOOKS, BLOB, [
    { hook: HOOK.questFrame, target: HUD_UPDATE },
    { hook: HOOK.hud, target: GAUGES },
  ]);
  cpu.load(HOOKS, hooks.code);

  const arg = (k: number) => cpu.reg[4 + k]! >>> 0;
  const draws: Draw[] = [];
  cpu.native.set(HUD_UPDATE, () => 0x1234);
  cpu.native.set(GAUGES, () => 0x5678);
  cpu.native.set(EXTERNS.rf_hud_frame, () => {
    assert.equal(arg(0), HUD);
    draws.push({ what: "frame", x: arg(1), y: arg(2), w: arg(3) });
    return 0;
  });
  cpu.native.set(EXTERNS.rf_hud_cap, () => (draws.push({ what: "cap", x: arg(1), y: arg(2) }), 0));
  cpu.native.set(EXTERNS.rf_hud_fill, () => {
    draws.push({ what: "fill", x: arg(1), y: arg(2), w: arg(3), colour: [arg(5), arg(6), arg(7)] });
    return 0;
  });
  // The stretching sprite routine reads its record as the game does: table + index × 12.
  cpu.native.set(EXTERNS.rf_hud_sprite, () => {
    const record = (EXTERNS.rf_hud_sprites + Math.imul(cpu.reg[9]!, 12)) >>> 0;
    const sprite = [0, 2, 4, 6, 8, 10].map((k) => (cpu.u16(record + k) << 16) >> 16);
    draws.push({ what: "sprite", x: arg(1), y: arg(2), w: arg(3), h: cpu.reg[8]! >>> 0, sprite });
    return 0;
  });
  const painted = new Set<number>();
  cpu.native.set(EXTERNS.rf_map_shows, () => (painted.has(arg(1)) ? 1 : 0));

  // game_task is loaded, the HUD shows the hunter, and the manager holds no one yet.
  cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from("game_task\0"));
  cpu.setU32(HUD + 0x530, HUNTER);
  cpu.setU16(HUNTER + 0x29a, AREA);
  cpu.setU32(EXTERNS.rf_monsters, MANAGER);
  cpu.setU8(EXTERNS.rf_em_chunks + LARGE * 0x1d0 + 0x14f, 1);
  cpu.setU8(EXTERNS.rf_em_chunks + SMALL * 0x1d0 + 0x14f, 0);

  const monster = (slot: number, em: number, hp: number, max: number) => {
    const at = 0x090bd2e0 + slot * 0x53b0;
    cpu.setU32(MANAGER + 0x1220 + slot * 4, at);
    cpu.setU32(at + 4, 3);
    cpu.setU16(at + 0x29a, AREA);
    cpu.setU8(at + 0x1e8, em);
    cpu.setU16(at + 0x2e4, hp);
    cpu.setU16(at + 0x41e, max);
    return at;
  };
  // A frame: game_task's HUD update, then the gauge call inside it.
  const frame = () => {
    draws.length = 0;
    cpu.call(hooks.stubs[0]!, [HUD]);
    assert.equal(cpu.call(hooks.stubs[1]!, [HUD]), 0x5678, "the gauges' result is passed back");
    return draws.map((d) => ({ ...d }));
  };
  cpu.call(blob.symbols.get("rf_init")!, [0, 0x09999c60, BLOB]);
  return { cpu, blob, hooks, frame, monster, painted, draws };
}

const fills = (draws: Draw[]) => draws.filter((d) => d.what === "fill");

test("a large monster gets a short gauge on the left, capped at both ends", () => {
  const q = quest("always");
  q.monster(0, LARGE, 300, 480);
  assert.deepEqual(q.frame(), [
    { what: "frame", x: 28, y: 92, w: 80 },
    // The stamina gauge's cap (sprite 6 at 52, 44), read right to left.
    { what: "sprite", x: 4, y: 92, w: 24, h: 12, sprite: [76, 44, -24, 12, -0x7fff, 0] },
    { what: "cap", x: 108, y: 92 },
    { what: "fill", x: 28, y: 93, w: 50, colour: [0xc0, 0x10, 0x10] },
  ]);
});

test("small monsters, dead ones, inactive ones and ones in other areas get none", () => {
  const q = quest("always");
  q.monster(0, SMALL, 50, 50);
  q.monster(1, LARGE, 0, 480);
  const inactive = q.monster(2, LARGE, 100, 480);
  q.cpu.setU32(inactive + 4, 2);
  const away = q.monster(3, LARGE, 100, 480);
  q.cpu.setU16(away + 0x29a, AREA + 1);
  assert.deepEqual(q.frame(), []);
});

test("the gauge shows only while the map shows the monster, in the painted mode", () => {
  const q = quest("painted");
  const m = q.monster(0, LARGE, 480, 480);
  assert.deepEqual(q.frame(), []);
  q.painted.add(m);
  assert.equal(fills(q.frame())[0]!.w, 80);
});

test("damage leaves a yellow trail that drains a pixel a frame", () => {
  const q = quest("always");
  const m = q.monster(0, LARGE, 480, 480);
  q.frame();
  q.cpu.setU16(m + 0x2e4, 300); // 50 of 80 px
  const yellow = [0xf0, 0xf0, 0x00];
  assert.deepEqual(fills(q.frame()), [
    { what: "fill", x: 78, y: 93, w: 30, colour: yellow },
    { what: "fill", x: 28, y: 93, w: 50, colour: [0xc0, 0x10, 0x10] },
  ]);
  assert.equal(fills(q.frame())[0]!.w, 29);
  for (let k = 0; k < 28; k++) q.frame();
  assert.deepEqual(
    fills(q.frame()).map((d) => d.colour),
    [[0xc0, 0x10, 0x10]],
  );
});

test("at most three gauges, stacked a row apart", () => {
  const q = quest("always");
  for (let slot = 0; slot < 5; slot++) q.monster(slot, LARGE, 100, 100);
  const frames = q.frame().filter((d) => d.what === "frame");
  assert.deepEqual(
    frames.map((d) => d.y),
    [92, 106, 120],
  );
});

test("nothing is drawn while the HUD hides the gauges or outside game_task", () => {
  const q = quest("always");
  q.monster(0, LARGE, 100, 100);
  q.cpu.setU32(HUD + 0x1194, 2);
  assert.deepEqual(q.frame(), []);
  q.cpu.setU32(HUD + 0x1194, 0);
  q.cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from("lobby_task\0"));
  assert.deepEqual(q.frame(), []);
});

test("the gauges only read the game: monsters and the HUD are left as they were", () => {
  const q = quest("always");
  const m = q.monster(0, LARGE, 200, 480);
  const before = [q.cpu.bytes(m, 0x500), q.cpu.bytes(HUD, 0x1200), q.cpu.bytes(MANAGER, 0x1280)];
  q.frame();
  q.cpu.setU16(m + 0x2e4, 100);
  const after = () => [
    q.cpu.bytes(m, 0x500),
    q.cpu.bytes(HUD, 0x1200),
    q.cpu.bytes(MANAGER, 0x1280),
  ];
  before[0]!.writeUInt16LE(100, 0x2e4);
  q.frame();
  assert.deepEqual(after(), before);
});

test("the hooks do nothing without the blob, and keep the caller's registers", () => {
  const q = quest("always");
  q.monster(0, LARGE, 100, 100);
  for (const r of [16, 17, 18, 19, 20, 21, 22, 23, 30]) q.cpu.reg[r] = 0x1000 + r;
  q.cpu.reg[29] = 0x09fff000;
  assert.equal(q.frame().length, 4);
  for (const r of [16, 17, 18, 19, 20, 21, 22, 23, 30]) assert.equal(q.cpu.reg[r], 0x1000 + r);
  assert.equal(q.cpu.reg[29], 0x09fff000);

  // A missing or stale blob: the loader zeroes the magic.
  q.cpu.setU32(BLOB + HEADER.magic, 0);
  assert.deepEqual(q.frame(), []);
  q.cpu.setU32(BLOB + HEADER.magic, BLOB_MAGIC);
  q.cpu.setU32(BLOB + HEADER.hooks + 4 * HOOK.hud, 0);
  assert.deepEqual(q.frame(), [], "no rf_hook1");
});

test("the runtime links without features: their inits are weak", () => {
  const blob = linkBlob(runtime(), BLOB);
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  cpu.call(blob.symbols.get("rf_init")!, [0, 0x09999c60, BLOB]);
  cpu.call(blob.symbols.get("rf_hook1")!, [HUD]);
  assert.deepEqual(cpu.calls, []);
});
