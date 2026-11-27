import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { decodeObjects, linkBlob } from "../src/blob/link.js";
import { HOOK, assembleHooks } from "../src/patches/game-hooks.js";
import { eliteObjects } from "../src/patches/elite.js";
import {
  aggressionExterns,
  aggressionObjects,
  encodeMotionTails,
  idleCapProblem,
  tailSpeedProblem,
} from "../src/patches/aggression.js";
import { MOTION_TAILS } from "../src/patches/monster-motions.js";
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

/**
 * The blob, the hooks and a quest in a CPU, with elites at `chance`% (their
 * idle cap `eliteIdle` frames, 0 for none) and Monster aggression's pauses
 * if `aggression` is on. `tails` is the moves' last hits (MOTION_TAILS'
 * format), none by default.
 */
function quest(
  chance: number,
  {
    eliteIdle = 20,
    aggression,
    tails,
  }: {
    eliteIdle?: number;
    aggression?: "more" | "relentless";
    tails?: Record<number, string>;
  } = {},
) {
  const objects = [...decodeObjects(RUNTIME_OBJECTS), ...eliteObjects()];
  if (aggression) objects.push(...aggressionObjects());
  const blob = linkBlob(
    objects.filter((o, k) => objects.findIndex((x) => x.name === o.name) === k),
    BLOB,
    {
      ...EXTERNS,
      rf_elite_chance: chance,
      rf_elite_idle: eliteIdle + 1,
      ...(aggression && aggressionExterns(aggression)),
    },
    Infinity,
    tails ? { rf_motion_tails: encodeMotionTails(tails) } : {},
  );
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

test("elites add to zenny and points, keeping what another feature added", () => {
  const q = quest(100);
  q.monster(0);
  q.frame();
  assert.equal(q.cpu.u32(FILE + 0x3c), POINTS * 1.5);
  // Say the Hunter's Pact is sealed now: 500 more points, 1000 more zenny.
  q.cpu.setU32(FILE + 0x3c, POINTS * 1.5 + 500);
  q.cpu.setU32(FILE + 0x54, ZENNY * 1.5 + 1000);
  q.monster(1);
  q.frame();
  assert.equal(q.cpu.u32(FILE + 0x3c), POINTS * 2 + 500);
  assert.equal(q.cpu.u32(FILE + 0x54), ZENNY * 2 + 1000);
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
  const runs = 300;
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
    rf_crowns: 0x08930bdc,
    rf_crown_groups: 0x0899bf40,
    rf_monster_hp_mode: 3, // always (its mode + 1)
  });
  assert.equal(blob.symbols.get("rf_add_booster"), undefined);
});

/** Stands the monster in its idle: action group 0, motion record 1. */
const idle = (q: ReturnType<typeof quest>, m: number) => {
  q.cpu.setU8(m + 0x298, 0);
  q.cpu.setU16(m + 0x324, 1001);
};
/** Frames until the monster is told to pick its next move (its "think now" flag), up to `most`. */
function framesToThink(q: ReturnType<typeof quest>, m: number, most = 200): number | null {
  for (let n = 1; n <= most; n++) {
    q.frame();
    if (q.cpu.u8(m + 0x4b5)) return n;
  }
  return null;
}

test("an elite stands in its idle 20 frames at most, then picks its next move", () => {
  const q = quest(100);
  const m = q.monster(0);
  idle(q, m);
  assert.equal(framesToThink(q, m), 20);
  // The game clears the flag as its AI runs; the next idle gets its own 20 frames.
  q.cpu.setU8(m + 0x4b5, 0);
  assert.equal(framesToThink(q, m), 20);
});

test("only the idle is cut: other moves and motions, and a dead monster, run as the game has them", () => {
  const q = quest(100);
  const m = q.monster(0);
  idle(q, m);
  for (let k = 0; k < 15; k++) q.frame();
  // Another motion starts the count again.
  q.cpu.setU16(m + 0x324, 1021);
  assert.equal(framesToThink(q, m, 60), null);
  idle(q, m);
  q.cpu.setU8(m + 0x298, 3); // an attack's group, playing record 1 for a moment
  assert.equal(framesToThink(q, m, 60), null);
  idle(q, m);
  assert.equal(framesToThink(q, m), 20);
  q.cpu.setU8(m + 0x4b5, 0);
  q.cpu.setU16(m + 0x2e4, 0);
  assert.equal(framesToThink(q, m, 60), null);
});

test("monsters that aren't elites keep their idle; with no cap, elites keep theirs", () => {
  const q = quest(0);
  const m = q.monster(0);
  idle(q, m);
  assert.equal(framesToThink(q, m), null);
  const r = quest(100, { eliteIdle: 0 });
  const e = r.monster(0);
  idle(r, e);
  assert.equal(framesToThink(r, e), null);
});

test("aggression caps every large monster's idle, elites' at the shorter cap; small monsters keep theirs", () => {
  const q = quest(0, { aggression: "more" });
  const m = q.monster(0);
  const small = q.monster(1, SMALL, 50, 50);
  idle(q, m);
  idle(q, small);
  assert.equal(framesToThink(q, m), 30);
  assert.equal(q.cpu.u8(small + 0x4b5), 0);
  assert.equal(q.cpu.u16(m + 0x41e), 480, "aggression alone doesn't boost");

  const elite = quest(100, { aggression: "more" });
  const e = elite.monster(0);
  idle(elite, e);
  assert.equal(framesToThink(elite, e), 20, "the elite's cap is shorter");

  const relentless = quest(100, { aggression: "relentless" });
  const r = relentless.monster(0);
  idle(relentless, r);
  assert.equal(framesToThink(relentless, r), 10, "relentless is shorter still");
});

test("the idle cap goes in only where game_task's AI is the one it was made for", () => {
  // The AI gate (EU 0x09AD8284) and the AI's start (0x09AB4B68), as the EU disc has them.
  const gate = [
    0x84830778, 0x1c600008, 0x00808021, 0x920304b5, 0x50600008, 0x8fbf000c, 0x0e6ad2da, 0,
    0x10000003, 0xa20004b5, 0x2463ffff, 0xa6030778,
  ];
  const think = [
    0x27bdffe0, 0xafbf001c, 0xafb30018, 0xafb20014, 0xafb10010, 0xafb0000c, 0x90850298,
  ];
  const task = (...parts: number[][]) => {
    const words = parts.flatMap((p) => [0, ...p]);
    const buf = Buffer.alloc(words.length * 4);
    words.forEach((w, k) => buf.writeUInt32LE(w >>> 0, k * 4));
    return buf;
  };
  assert.equal(idleCapProblem(task(gate, think)), null);
  assert.match(idleCapProblem(task(think)) ?? "", /gate/);
  assert.match(idleCapProblem(task(gate)) ?? "", /AI doesn't match/);
  assert.match(idleCapProblem(task(gate, gate, think)) ?? "", /gate/);
});

/** Giadrome's moves, made up: record 2 a turn, record 5's last hit ending at frame 100. */
const TAILS = { [LARGE]: "2:0 5:100" };
/** Plays motion `record` at `frame`. */
const play = (q: ReturnType<typeof quest>, m: number, record: number, frame: number) => {
  q.cpu.setU8(m + 0x298, 3);
  q.cpu.setU16(m + 0x324, 1000 + record);
  q.cpu.setU32(m + 0x90, f32(frame));
};

test("an elite recovers from a move 50% faster past its last hit, and turns 50% faster", () => {
  const q = quest(100, { tails: TAILS });
  const m = q.monster(0);
  play(q, m, 5, 60);
  q.frame();
  assert.equal(q.cpu.u8(m + 0x769), 10, "before the last hit ends, the elite's own 10%");
  // The elite's 10% gets its motion there sooner: the tail starts at 110.
  play(q, m, 5, 108);
  q.frame();
  assert.equal(q.cpu.u8(m + 0x769), 10);
  play(q, m, 5, 110.5);
  q.frame();
  assert.equal(q.cpu.u8(m + 0x769), 50);
  // Another move: back to what was there.
  play(q, m, 7, 120);
  q.frame();
  assert.equal(q.cpu.u8(m + 0x769), 10);
  play(q, m, 2, 0);
  q.frame();
  assert.equal(q.cpu.u8(m + 0x769), 50, "a turn is faster all through");
  // A move's own bonus that's faster stays.
  play(q, m, 5, 140);
  q.cpu.setU8(m + 0x769, 70);
  q.frame();
  assert.equal(q.cpu.u8(m + 0x769), 70);
  play(q, m, 6, 0);
  q.frame();
  assert.equal(q.cpu.u8(m + 0x769), 70, "the game's 70 isn't ours to put back");
});

test("the game's new bonus wins over the one written, and a dead monster isn't sped up", () => {
  const q = quest(100, { tails: TAILS });
  const m = q.monster(0);
  play(q, m, 5, 150);
  q.frame();
  assert.equal(q.cpu.u8(m + 0x769), 50);
  // A move change clears it while still in the tail: the elite's 10 comes back, then ours.
  q.cpu.setU8(m + 0x769, 0);
  q.frame();
  assert.equal(q.cpu.u8(m + 0x769), 50);
  play(q, m, 8, 0);
  q.frame();
  assert.equal(q.cpu.u8(m + 0x769), 10, "what the elite wrote is put back, not the cleared 0");
  q.cpu.setU16(m + 0x2e4, 0);
  play(q, m, 5, 150);
  q.frame();
  assert.notEqual(q.cpu.u8(m + 0x769), 50);
});

test("aggression speeds every large monster's recoveries, the faster of it and an elite's winning", () => {
  const more = quest(0, { aggression: "more", tails: TAILS });
  const m = more.monster(0);
  const small = more.monster(1, SMALL, 50, 50);
  play(more, m, 5, 150);
  play(more, small, 5, 150);
  more.frame();
  assert.equal(more.cpu.u8(m + 0x769), 50);
  assert.equal(more.cpu.u8(small + 0x769), 0);

  const relentless = quest(100, { aggression: "relentless", tails: TAILS });
  const r = relentless.monster(0);
  play(relentless, r, 5, 150);
  relentless.frame();
  assert.equal(relentless.cpu.u8(r + 0x769), 100, "relentless is faster than the elite's 50");

  const untabled = quest(0, { aggression: "relentless" });
  const u = untabled.monster(0);
  play(untabled, u, 5, 150);
  untabled.frame();
  assert.equal(untabled.cpu.u8(u + 0x769), 0, "without the table nothing is sped up");
});

test("the moves' last hits pack as monsters.c reads them", () => {
  const out = encodeMotionTails({ 3: "7:0 2:41", 5: "1:600" });
  const at = (k: number) => out.readUInt16LE(k * 2);
  assert.equal(out.length, (91 + 3) * 2);
  assert.deepEqual([at(0), at(3), at(4), at(5), at(6), at(90)], [0, 0, 2, 2, 3, 3]);
  assert.deepEqual([at(91), at(92), at(93)], [2 | (11 << 8), 7, 1 | (150 << 8)]);
  assert.throws(() => encodeMotionTails({ 1: "256:10" }), /doesn't fit/);
  encodeMotionTails(); // every species' table fits
  // Tigrex: its turns all through, its tail swipe's recovery past frame 186.
  assert.match(MOTION_TAILS[75] ?? "", /^2:0 7:0 8:0 .*\b43:186\b/);
});

test("recoveries are sped up only where game_task's speed code is the one they were made for", () => {
  // The monster update's speed (EU 0x09AC667C), as the EU disc has it.
  const speed = [
    0x92430769, 0x3c0242c8, 0x44820000, 0x24620064, 0x44820800, 0x46800860, 0xc64204b0, 0x3c034000,
    0x24020001, 0x46000803, 0x46001042, 0x44830000, 0x46010002, 0xe6400094,
  ];
  const task = (...parts: number[][]) => {
    const words = parts.flatMap((p) => [0, ...p]);
    const buf = Buffer.alloc(words.length * 4);
    words.forEach((w, k) => buf.writeUInt32LE(w >>> 0, k * 4));
    return buf;
  };
  assert.equal(tailSpeedProblem(task(speed)), null);
  assert.match(tailSpeedProblem(task()) ?? "", /speed code/);
  assert.match(tailSpeedProblem(task(speed, speed)) ?? "", /speed code/);
});
