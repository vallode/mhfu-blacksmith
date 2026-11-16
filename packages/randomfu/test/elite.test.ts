import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { decodeObjects, linkBlob } from "../src/blob/link.js";
import { HOOK, assembleHooks } from "../src/patches/game-hooks.js";
import { eliteObjects } from "../src/patches/elite.js";
import { monsterHpObjects } from "../src/patches/monster-hp.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const HUD_UPDATE = 0x0883f270;
const PAD_READ = 0x08868f50;
const HUD = 0x09a04ba0;
const PAD = 0x08a62c00;
const MANAGER = 0x09c10f20;
const QUEST = 0x08a5bc00;
const FILE = 0x09100000;
const RNG = 0x08800100;
const RAGE = 0x09bd0000;
const EXTERNS = {
  rf_game_task: 0x09a5f200,
  rf_monsters: 0x09c121b0,
  rf_em_chunks: 0x09bb89b0,
  rf_quest: 0x08a62c7c,
  rf_rng: 0x08a631a0,
  rf_rng_streams: 0x00f7a56c,
  rf_apply_size: 0x09ac7668,
};
const LARGE = 77;
const CALM = 11; // a large monster with no rage parameters
const SMALL = 35;
const ZENNY = 3000;
const POINTS = 400;
const DRAWS = 5;
const CHANCES = [40, 30, 20, 8, 2];
/** A material: diffuse RGB, alpha, ambient RGB, then its texture and more. */
const MATERIAL = Buffer.from("feffffff7f7f7f000000008000000000", "hex");

const f32 = (x: number) => new Uint32Array(new Float32Array([x]).buffer)[0]!;
const fromF32 = (bits: number) => new Float32Array(new Uint32Array([bits]).buffer)[0]!;
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} isn't ${expected}`);

/** The blob, the hooks and a quest in a CPU, with elites at `chance`%. */
function quest(chance: number) {
  const blob = linkBlob([...decodeObjects(RUNTIME_OBJECTS), ...eliteObjects()], BLOB, {
    ...EXTERNS,
    rf_elite_chance: chance,
  });
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(HOOKS, BLOB, [
    { hook: HOOK.questFrame, target: HUD_UPDATE },
    { hook: HOOK.pad, target: PAD_READ },
  ]);
  cpu.load(HOOKS, hooks.code);

  const arg = (k: number) => cpu.reg[4 + k]! >>> 0;
  cpu.native.set(HUD_UPDATE, () => 0);
  cpu.native.set(PAD_READ, () => 0);
  // The game's size function: the model's scale from the size (here just a record of the call).
  const resized: number[] = [];
  cpu.native.set(EXTERNS.rf_apply_size, () => (resized.push(arg(0)), 0));

  const task = (name: string) => cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from(`${name}\0`));
  task("game_task");
  cpu.setU32(EXTERNS.rf_monsters, MANAGER);
  for (const em of [LARGE, CALM]) cpu.setU8(EXTERNS.rf_em_chunks + em * 0x1d0 + 0x14f, 1);
  cpu.setU32(EXTERNS.rf_em_chunks + LARGE * 0x1d0 + 0x1ac, RAGE);
  cpu.setU16(RAGE, 300);
  cpu.setU32(EXTERNS.rf_rng, RNG);

  // The quest: its clocks (the quest state's and the HUD's), and its file with a main
  // reward table and another after it.
  cpu.setU32(EXTERNS.rf_quest, QUEST);
  const clock = (left: number) => {
    cpu.setU32(QUEST + 0x10, left);
    cpu.setU32(HUD + 0x1230, left);
  };
  const load = (left = 90000) => {
    clock(left);
    cpu.setU32(QUEST + 0x50, FILE);
    cpu.setU32(QUEST + 0x5c, FILE + 0x200);
    cpu.setU32(FILE + 0x3c, POINTS);
    cpu.setU32(FILE + 0x54, ZENNY);
    cpu.load(FILE + 0x200, [((DRAWS << 24) | 0x8000) >>> 0, 0x300, 0x00008001, 0x340, 0xffff]);
    CHANCES.forEach((c, k) => cpu.setU16(FILE + 0x300 + k * 6, c));
    cpu.setU16(FILE + 0x300 + CHANCES.length * 6, 0xffff);
  };
  load();

  const monster = (slot: number, em = LARGE, hp = 480, max = 480) => {
    const at = 0x090bd2e0 + slot * 0x53b0;
    cpu.setU32(MANAGER + 0x1220 + slot * 4, at);
    cpu.setU32(at + 4, 3);
    cpu.setU8(at + 0x1e8, em);
    cpu.setU16(at + 0x2e4, hp);
    cpu.setU16(at + 0x41e, max);
    cpu.setU16(at + 0x274, 100);
    cpu.setU32(at + 0x380, f32(1.0));
    cpu.setU16(at + 0x570, em === LARGE ? 300 : 0);
    // Its own materials, as Giadrome's: 12 of them inside the entity.
    cpu.setU32(at + 0x58, at + 0x830);
    cpu.setU32(at + 0x5c, at + 0x830 + 12 * 16);
    for (let k = 0; k < 12; k++) cpu.write(at + 0x830 + k * 16, MATERIAL);
    return at;
  };
  // A frame: the main loop reads the pad, then game_task runs the quest.
  const frame = () => {
    cpu.call(hooks.stubs[1]!, [PAD]);
    cpu.call(hooks.stubs[0]!, [HUD]);
    clock(cpu.u32(QUEST + 0x10) - 1);
  };
  cpu.call(blob.symbols.get("rf_init")!, [0, 0x09999c60, BLOB]);
  const draws = () => cpu.u8(FILE + 0x203);
  const chances = () => CHANCES.map((_, k) => cpu.u16(FILE + 0x300 + k * 6));
  return { cpu, frame, monster, load, clock, task, resized, draws, chances };
}

test("an elite has more HP, attack, speed and size, and a shorter fuse for longer rage", () => {
  const q = quest(100);
  const m = q.monster(0, LARGE, 300, 480);
  q.frame();
  assert.equal(q.cpu.u16(m + 0x41e), 720);
  assert.equal(q.cpu.u16(m + 0x2e4), 450, "HP keeps its share of the gauge");
  near(fromF32(q.cpu.u32(m + 0x380)), 1.3);
  assert.equal(q.cpu.u8(m + 0x769), 10);
  assert.equal(q.cpu.u16(m + 0x570), 180);
  assert.equal(q.cpu.u16(m + 0x274), 115);
  assert.deepEqual(q.resized, [m]);

  // Rage starts: it lasts half again as long, once.
  q.cpu.setU32(m + 0x638, 0x20);
  q.cpu.setU16(m + 0x56c, 600);
  q.frame();
  assert.equal(q.cpu.u16(m + 0x56c), 900);
  q.cpu.setU16(m + 0x56c, 899);
  q.frame();
  assert.equal(q.cpu.u16(m + 0x56c), 899);
});

test("the boosts hold when the game rewrites the fields, and leave a move's own speed", () => {
  const q = quest(100);
  const m = q.monster(0);
  q.frame();
  // Rage start writes the attack anew (row × rage), a reset puts the size back to 100.
  q.cpu.setU32(m + 0x380, f32(1.2));
  q.cpu.setU16(m + 0x274, 100);
  q.cpu.setU8(m + 0x769, 50);
  q.frame();
  q.frame();
  near(fromF32(q.cpu.u32(m + 0x380)), 1.2 * 1.3);
  assert.equal(q.cpu.u16(m + 0x274), 115);
  assert.deepEqual(q.resized, [m, m]);
  assert.equal(q.cpu.u8(m + 0x769), 50);
  assert.equal(q.cpu.u16(m + 0x41e), 720, "max HP isn't raised twice");
  // A change of move clears the bonus; the elite's comes back.
  q.cpu.setU8(m + 0x769, 0);
  q.frame();
  assert.equal(q.cpu.u8(m + 0x769), 10);
});

test("elites' quests pay more: a draw, zenny and points each, rarer items once", () => {
  const q = quest(100);
  q.monster(0);
  q.frame();
  assert.equal(q.cpu.u32(FILE + 0x54), ZENNY * 1.5);
  assert.equal(q.cpu.u32(FILE + 0x3c), POINTS * 1.5);
  assert.equal(q.draws(), DRAWS + 1);
  assert.deepEqual(q.chances(), [40, 30, 20, 12, 3], "below-average chances rise by half");
  q.monster(1);
  q.frame();
  assert.equal(q.cpu.u32(FILE + 0x54), ZENNY * 2);
  assert.equal(q.draws(), DRAWS + 2);
  assert.deepEqual(q.chances(), [40, 30, 20, 12, 3]);
  assert.equal(q.cpu.u32(FILE + 0x208), 0x8001, "other tables are left alone");
});

test("at 0% nothing changes, and small monsters never roll", () => {
  const q = quest(0);
  const m = q.monster(0);
  const small = q.monster(1, SMALL, 50, 50);
  const before = [q.cpu.bytes(m, 0x800), q.cpu.bytes(small, 0x800), q.cpu.bytes(FILE, 0x400)];
  q.frame();
  assert.deepEqual(
    [q.cpu.bytes(m, 0x800), q.cpu.bytes(small, 0x800), q.cpu.bytes(FILE, 0x400)],
    before,
  );
  const always = quest(100);
  const tiny = always.monster(0, SMALL, 50, 50);
  always.frame();
  assert.equal(always.cpu.u16(tiny + 0x41e), 50);
});

test("a monster without rage gets the rest", () => {
  const q = quest(100);
  const m = q.monster(0, CALM);
  q.frame();
  assert.equal(q.cpu.u16(m + 0x41e), 720);
  assert.equal(q.cpu.u16(m + 0x570), 0);
});

test("each monster rolls once a quest; a new quest or a new monster in its place rolls again", () => {
  const q = quest(100);
  const m = q.monster(0);
  q.frame();
  q.frame();
  assert.equal(q.cpu.u32(FILE + 0x54), ZENNY * 1.5, "paid once");
  // Dead: no more boosts. Then the struct is used for another monster.
  q.cpu.setU16(m + 0x2e4, 0);
  q.frame();
  q.monster(0);
  q.frame();
  assert.equal(q.cpu.u16(m + 0x41e), 720);

  // A new quest from the same file, still as the blob left it: put back, then paid again once.
  q.monster(0);
  q.clock(100000);
  q.frame();
  assert.equal(q.cpu.u32(FILE + 0x54), ZENNY * 1.5);
  assert.equal(q.draws(), DRAWS + 1);
  assert.deepEqual(q.chances(), [40, 30, 20, 12, 3]);
  // A new quest read afresh.
  q.load(120000);
  q.monster(0);
  q.frame();
  assert.equal(q.cpu.u32(FILE + 0x54), ZENNY * 1.5);
});

test("a shorter quest after the village is a new quest too", () => {
  const q = quest(100);
  q.monster(0);
  q.frame();
  // Back to the village (lobby_task where game_task was), then a quest with less time.
  q.task("lobby_task");
  q.frame();
  q.task("game_task");
  q.clock(5000);
  q.monster(0);
  q.frame();
  assert.equal(q.cpu.u32(FILE + 0x54), ZENNY * 1.5, "put back, then paid once");
  assert.equal(q.draws(), DRAWS + 1);
});

test("a monster rolls once it's set up", () => {
  const q = quest(100);
  const m = q.monster(0, LARGE, 0, 0);
  q.frame();
  assert.equal(q.cpu.u32(FILE + 0x54), ZENNY, "nothing yet");
  q.cpu.setU16(m + 0x2e4, 480);
  q.cpu.setU16(m + 0x41e, 480);
  q.frame();
  assert.equal(q.cpu.u16(m + 0x41e), 720);
  assert.equal(q.cpu.u32(FILE + 0x54), ZENNY * 1.5);
});

test("about the chance's share of monsters are elites", () => {
  const q = quest(12);
  let elites = 0;
  const runs = 800;
  for (let k = 0; k < runs; k++) {
    q.cpu.setU16(RNG + 0xf7a56c, (k * 7919) & 0xffff); // the game's generator moves on
    q.clock(200000 + k * 10);
    const m = q.monster(k % 20);
    q.frame();
    if (q.cpu.u16(m + 0x41e) === 720) elites++;
  }
  assert.ok(elites > runs * 0.07 && elites < runs * 0.17, `${elites} of ${runs}`);
});

test("an elite's own materials pulse a little redder; the game's alpha, textures and other monsters stay", () => {
  const q = quest(100);
  const m = q.monster(0);
  const other = q.monster(1, SMALL, 50, 50);
  const colours = (at: number) => [0, 1, 2, 4, 5, 6].map((c) => q.cpu.u8(at + c));
  const seen: number[][] = [];
  for (let k = 0; k < 150; k++) {
    q.frame();
    seen.push(colours(m + 0x830));
  }
  const reds = seen.map((c) => c[0]!);
  const greens = seen.map((c) => c[1]!);
  assert.ok(
    reds.every((r) => r === 255),
    "red goes full",
  );
  assert.ok(Math.min(...greens) < 200 && Math.max(...greens) > 220, `greens ${greens}`);
  const ambient = seen.map((c) => c[3]!);
  assert.ok(Math.max(...ambient) > 140, "the ambient red brightens");
  for (let k = 0; k < 12; k++) {
    const at = m + 0x830 + k * 16;
    assert.equal(q.cpu.u8(at + 3), 0xff, "alpha");
    assert.deepEqual(q.cpu.bytes(at + 7, 9), MATERIAL.subarray(7), "texture and the rest");
  }
  assert.deepEqual(q.cpu.bytes(other + 0x830, 16), MATERIAL);

  // The game sets a colour of its own (say, fading out): the tint follows it.
  q.cpu.setU8(m + 0x830 + 1, 40);
  q.frame();
  assert.ok(q.cpu.u8(m + 0x830 + 1) <= 40);
});

test("monster health alone links without elites", () => {
  const blob = linkBlob([...decodeObjects(RUNTIME_OBJECTS), ...monsterHpObjects()], BLOB, {
    ...EXTERNS,
    rf_hud_frame: 0x0882ac18,
    rf_hud_cap: 0x0882a9dc,
    rf_hud_fill: 0x0882d6f0,
    rf_map_shows: 0x08844578,
    rf_hud_sprite: 0x0882af70,
    rf_hud_sprites: 0x089391a8,
    rf_monster_hp_mode: 2,
  });
  assert.equal(blob.symbols.get("rf_add_booster"), undefined);
});
