import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOvl } from "mhfu-extract/src/container/ovl.js";
import { Cpu, Memory } from "mhfu-extract/src/monsters/mips.js";
import type { Edits } from "../src/edits.js";
import {
  AFFINITY_CODE,
  ELEMENT_READS,
  assembleAffinity,
  assembleElementReads,
  findAffinityCode,
  findElementReads,
  patchElementMotion,
} from "../src/patches/element-motion.js";
import { Rng } from "../src/rng.js";

/** EU addresses: the code, the getter it calls, and the region's end. */
const CODE = 0x09b687c4;
const GETTER = 0x088da398;
const END = CODE + AFFINITY_CODE.length * 4 + 4;
/** `lbu v1,0x1e8(s1)`, the word after the region. */
const NEXT = 0x922301e8;
const HUNTER = 0x090b3440;
const ATTACK = 0x09c00000;

interface Swing {
  /** Whether the getters ran (`$s0`). */
  weapon: boolean;
  mv: number;
  element: number;
  /** What the getter gives for affinity (kind 8). */
  affinity: number;
  counter: number;
  forced: number;
  felyne: number;
  species: number;
  flags: number;
  /** The attack's element and status flags (`+0x28`). */
  kinds: number;
}

interface After {
  mv: number;
  element: number;
  flags: number;
}

const patched = (threshold: number) => [
  ...AFFINITY_CODE.slice(0, 3),
  ...assembleAffinity(threshold, AFFINITY_CODE[7]!, AFFINITY_CODE[9]!),
];

/** Runs `words` (at the EU address) on one swing, the getter giving its affinity. */
function run(words: readonly number[], swing: Swing): After {
  const memory = new Memory();
  // The game's next word too: one of its branches skips it, doing it in its delay slot.
  const code = new Uint8Array(words.length * 4 + 4);
  const view = new DataView(code.buffer);
  [...words, NEXT].forEach((w, k) => view.setUint32(k * 4, w >>> 0, true));
  memory.add(CODE, code);
  const hunter = new Uint8Array(0x800);
  hunter[0x1e8] = swing.species;
  hunter[0x5f2] = swing.felyne;
  new DataView(hunter.buffer).setUint16(0x322, swing.counter, true);
  memory.add(HUNTER, hunter);
  const attack = new Uint8Array(0x100);
  attack[0x1e] = swing.mv;
  attack[0x2a] = swing.element;
  attack[0x2b] = swing.flags;
  new DataView(attack.buffer).setUint16(0x28, swing.kinds, true);
  attack[0x89] = swing.forced;
  memory.add(ATTACK, attack);

  const cpu = new Cpu(memory);
  cpu.hooks.set(GETTER, (c) => {
    assert.equal(c.r[4], HUNTER);
    assert.equal(c.r[5], 8);
    c.r[2] = swing.affinity >>> 0;
    return true;
  });
  cpu.r[16] = swing.weapon ? 1 : 0;
  cpu.r[17] = HUNTER;
  cpu.r[18] = ATTACK;
  cpu.run(CODE, END);
  return {
    mv: memory.u8(ATTACK + 0x1e),
    element: memory.u8(ATTACK + 0x2a),
    flags: memory.u8(ATTACK + 0x2b),
  };
}

function swings(count: number): Swing[] {
  const rng = new Rng("element-motion");
  const pick = <T>(values: readonly T[]) => values[rng.int(values.length)]!;
  return Array.from({ length: count }, () => ({
    weapon: rng.int(4) !== 0,
    mv: pick([0, 1, 7, 21, 22, 23, 46, 48, 110, 200, 255, rng.int(256)]),
    element: pick([0, 1, 41, 60, 128, 255, rng.int(256)]),
    affinity: pick([0, 5, 30, 100, -10, -50, -100]),
    counter: rng.int(0x10000),
    forced: rng.int(5) === 0 ? 1 : 0,
    felyne: pick([0, 0, 1]),
    species: pick([0, 1, 5, 2]),
    flags: rng.int(256),
    kinds: pick([0, 1, 2, 4, 0x10, 0x20, 0x40, 0x80, 0x100, rng.int(0x10000)]),
  }));
}

test("element by motion value: the affinity code does what the game's did", () => {
  // A threshold no u8 motion value passes leaves the element alone.
  for (const swing of swings(3000)) {
    assert.deepEqual(run(patched(255), swing), run(AFFINITY_CODE, swing), JSON.stringify(swing));
  }
});

test("element by motion value: scales status by the motion value before a critical", () => {
  for (const threshold of [10, 22, 40]) {
    for (const swing of swings(1500)) {
      const game = run(AFFINITY_CODE, swing);
      const element =
        swing.weapon && swing.mv > threshold && (swing.kinds & 0x1f0) === 0
          ? Math.min(255, Math.floor((swing.element * swing.mv + (threshold >> 1)) / threshold))
          : swing.element;
      assert.deepEqual(run(patched(threshold), swing), { ...game, element }, JSON.stringify(swing));
    }
  }
});

test("element by motion value: game_task scales status, capped, for a level 3 charge and a Dual Blades hit at 22", () => {
  const swing = {
    kinds: 1,
    weapon: true,
    affinity: 0,
    counter: 0,
    forced: 0,
    felyne: 0,
    species: 0,
    flags: 0,
  };
  assert.equal(run(patched(22), { ...swing, mv: 110, element: 41 }).element, 205);
  assert.equal(run(patched(22), { ...swing, mv: 110, element: 60 }).element, 255);
  assert.equal(run(patched(22), { ...swing, mv: 7, element: 28 }).element, 28);
  // An element is left to game_sub.
  assert.equal(run(patched(22), { ...swing, kinds: 0x10, mv: 110, element: 41 }).element, 41);
});

/** A synthetic overlay with `words` at `at`. */
function overlay(name: string, base: number, at: number, words: readonly number[]): Buffer {
  const buf = Buffer.alloc(at + words.length * 4 + 0x40);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(base, 0x08);
  buf.write(name, 0x20, "latin1");
  words.forEach((w, k) => buf.writeUInt32LE(w, at + k * 4));
  return buf;
}

test("element by motion value: finds and patches the code in game_task and game_sub", () => {
  const at = 0x400;
  const task = overlay("game_task.ovl", 0x09a5f200, at, AFFINITY_CODE);
  // Another disc's getter address doesn't matter.
  task.writeUInt32LE(0x0e237338, at + 7 * 4);
  const sub = overlay("game_sub.ovl", 0x09c19000, at + 8, ELEMENT_READS);
  const taskOvl = parseOvl(task);
  const subOvl = parseOvl(sub);
  assert.equal(findAffinityCode(taskOvl), at);
  assert.equal(findElementReads(subOvl), at + 8);

  const taskOut = Buffer.from(task);
  const subOut = Buffer.from(sub);
  const edits = {
    overlay: (o: { index: number }) => (o.index === 0 ? taskOut : subOut),
  } as unknown as Edits;
  const report = patchElementMotion(
    { index: 0, ovl: taskOvl },
    { index: 1, ovl: subOvl },
    22,
    edits,
  );
  assert.equal(report.summary, "Element by motion value: from motion value 22");
  assert.ok(taskOut.subarray(0, at + 12).equals(task.subarray(0, at + 12)));
  const words = Array.from({ length: AFFINITY_CODE.length }, (_, k) =>
    taskOut.readUInt32LE(at + k * 4),
  );
  assert.ok(words.includes(0x0e237338), "calls this disc's getter");
  const taskEnd = at + AFFINITY_CODE.length * 4;
  assert.ok(taskOut.subarray(taskEnd).equals(task.subarray(taskEnd)));
  const subEnd = at + 8 + ELEMENT_READS.length * 4;
  assert.ok(subOut.subarray(0, at + 8).equals(sub.subarray(0, at + 8)));
  assert.ok(!subOut.subarray(at + 8, subEnd).equals(sub.subarray(at + 8, subEnd)));
  assert.ok(subOut.subarray(subEnd).equals(sub.subarray(subEnd)));

  sub.writeUInt32LE(0, at + 8 + 20 * 4);
  const unmatched = patchElementMotion(
    { index: 0, ovl: taskOvl },
    { index: 1, ovl: parseOvl(sub) },
    22,
    edits,
  );
  assert.match(unmatched.summary ?? "", /not applied \(game_sub/);
});

/** EU addresses of game_sub's element reads and the word after them. */
const READS = 0x09c4383c;
const READS_END = READS + ELEMENT_READS.length * 4;
/** `move a0,s5`, the word after the reads. */
const READS_NEXT = 0x02a02021;
const OWNER = 0x090b3440;
/** The element registers, fire, water, ice, thunder and dragon, and their flags. */
const ELEMENT_REGS = [
  [0x10, 24],
  [0x20, 22],
  [0x80, 20],
  [0x40, 23],
  [0x100, 21],
] as const;

interface Hit {
  kinds: number;
  element: number;
  mv: number;
  /** Whether the attack has an owner (`$s4`). */
  owned: boolean;
  /** The attack's `+0xF`: 0 a hunter's. */
  ownerKind: number;
  /** The owner's `+0x4E9`: 5 a Blademaster weapon. */
  weapon: number;
  /** What the element registers held before. */
  before: number;
  /** The motion row's type, `+0x1F`: 0 to 3 a weapon's, 0xB fixed damage. */
  type: number;
  /** `+0x2B`: 0x80 a critical hit, 0x40 a negative one. */
  crit: number;
  /** Whether the builder multiplied the motion value by 1.35 (`+0x31` 0, `+0x32` 0x12). */
  spirit: boolean;
}

/** Runs `words` on one hit; the element registers' bits after. */
function runReads(words: readonly number[], hit: Hit): number[] {
  const memory = new Memory();
  const code = new Uint8Array(words.length * 4 + 4);
  const view = new DataView(code.buffer);
  [...words, READS_NEXT].forEach((w, k) => view.setUint32(k * 4, w >>> 0, true));
  memory.add(READS, code);
  const attack = new Uint8Array(0x100);
  new DataView(attack.buffer).setUint16(0x28, hit.kinds, true);
  attack[0x2a] = hit.element;
  attack[0x1f] = hit.type;
  attack[0x2b] = hit.crit;
  attack[0x31] = hit.spirit ? 0 : 2;
  attack[0x32] = hit.spirit ? 0x12 : 0x12 - (hit.mv & 1) * 2;
  attack[0x1e] = hit.mv;
  attack[0x0f] = hit.ownerKind;
  memory.add(ATTACK, attack);
  const owner = new Uint8Array(0x800);
  owner[0x4e9] = hit.weapon;
  memory.add(OWNER, owner);
  const cpu = new Cpu(memory);
  cpu.r[20] = hit.owned ? OWNER : 0;
  cpu.r[21] = ATTACK;
  for (const [, reg] of ELEMENT_REGS) cpu.f[reg] = hit.before;
  // The game skips `move a0,s5`, doing it in a delay slot: stop after it.
  cpu.run(READS, READS_END + 4);
  return ELEMENT_REGS.map(([, reg]) => cpu.f[reg]! >>> 0);
}

function hits(count: number): Hit[] {
  const rng = new Rng("element-reads");
  const pick = <T>(values: readonly T[]) => values[rng.int(values.length)]!;
  return Array.from({ length: count }, () => ({
    kinds: pick([0, 1, 0x10, 0x20, 0x40, 0x80, 0x100, 0x1f0, rng.int(0x10000)]),
    element: pick([0, 1, 41, 60, 255, rng.int(256)]),
    mv: pick([0, 7, 21, 22, 23, 48, 110, 255, rng.int(256)]),
    owned: rng.int(8) !== 0,
    ownerKind: pick([0, 0, 0, 1]),
    weapon: pick([5, 5, 5, 0, 6]),
    before: pick([0, 0x3f800000, rng.int(0x40000000)]),
    type: pick([0, 1, 2, 3, 0, 1, 0xa, 0xb, rng.int(256)]),
    crit: pick([0, 0, 0x40, 0x80, rng.int(256)]),
    spirit: rng.int(4) === 0,
  }));
}

const f32 = (bits: number) => new DataView(new Uint32Array([bits]).buffer).getFloat32(0, true);
const bits = (value: number) => new Uint32Array(new Float32Array([value]).buffer)[0]!;

test("element by motion value: game_sub's element reads do what the game's did", () => {
  for (const hit of hits(3000)) {
    assert.deepEqual(
      runReads(assembleElementReads(400), hit), // no motion value, worked back from a negative critical (at most 341), passes 400
      runReads(ELEMENT_READS, hit),
      JSON.stringify(hit),
    );
  }
});

/** `value × f × √f`, `f = mv / threshold`, in the patch's float steps. */
/** The motion value before a critical hit, as the patch works it back. */
function base({ mv, crit, spirit }: Hit): number {
  const m = spirit ? Math.floor((20 * mv + 26) / 27) : mv;
  return crit & 0x80 ? Math.floor((4 * m + 4) / 5) : crit & 0x40 ? Math.floor((4 * m + 2) / 3) : m;
}

const curve = (value: number, mv: number, threshold: number) => {
  const f = Math.fround(mv / threshold);
  return Math.fround(value * Math.fround(f * Math.fround(Math.sqrt(f))));
};

test("element by motion value: a Blademaster's element grows on a curve with the motion value, uncapped", () => {
  for (const threshold of [10, 26, 40]) {
    for (const hit of hits(1500)) {
      const game = runReads(ELEMENT_READS, hit);
      const scaled =
        hit.owned &&
        hit.ownerKind === 0 &&
        hit.weapon === 5 &&
        hit.type < 4 &&
        base(hit) > threshold
          ? bits(curve(hit.element, base(hit), threshold))
          : bits(hit.element);
      const want = ELEMENT_REGS.map(([flag], k) => (hit.kinds & flag ? scaled : game[k]!));
      assert.deepEqual(
        runReads(assembleElementReads(threshold), hit),
        want,
        JSON.stringify({ threshold, hit }),
      );
    }
  }
  // A level 3 charge with 600 fire at 26: 8.7 times, past the u8's 2550.
  const charge = {
    kinds: 0x10,
    element: 60,
    mv: 110,
    owned: true,
    ownerKind: 0,
    weapon: 5,
    before: 0,
    type: 0,
    crit: 0,
    spirit: false,
  };
  assert.equal(f32(runReads(assembleElementReads(26), charge)[0]!).toFixed(1), "522.1");
  // A side slash (36) 1.6 times; a bowgun's shot keeps its element.
  assert.equal(
    f32(runReads(assembleElementReads(26), { ...charge, mv: 36 })[0]!).toFixed(1),
    "97.8",
  );
  assert.equal(f32(runReads(assembleElementReads(26), { ...charge, weapon: 6 })[0]!), 60);
  // A critical level 3 charge (137) carries what a plain one does; fixed
  // damage (type 0xB, +0x1E the damage) keeps its element.
  assert.equal(
    f32(runReads(assembleElementReads(26), { ...charge, mv: 137, crit: 0x80 })[0]!).toFixed(1),
    "522.1",
  );
  assert.equal(f32(runReads(assembleElementReads(26), { ...charge, type: 0xb })[0]!), 60);
});

test("element by motion value: game_sub works back the motion value the game's affinity code and 1.35 left", () => {
  const plain: Swing = {
    weapon: true,
    mv: 0,
    element: 0,
    affinity: 0,
    counter: 0,
    forced: 0,
    felyne: 0,
    species: 1,
    flags: 0,
    kinds: 0x10,
  };
  const modes = {
    plain: {},
    critical: { forced: 1 },
    negative: { affinity: -100 },
  } satisfies Record<string, Partial<Swing>>;
  for (const threshold of [10, 26]) {
    for (let m = 1; m <= 150; m++) {
      for (const [mode, change] of Object.entries(modes)) {
        for (const spirit of [false, true]) {
          // The game's own affinity code, then the builder's 1.35 (EU 0x09B68984).
          const after = run(AFFINITY_CODE, { ...plain, ...change, mv: m });
          const mv = spirit
            ? Math.trunc(Math.fround(Math.fround(after.mv) * Math.fround(1.35))) & 0xff
            : after.mv;
          const hit: Hit = {
            kinds: 0x10,
            element: 40,
            mv,
            owned: true,
            ownerKind: 0,
            weapon: 5,
            before: 0,
            type: 1,
            crit: after.flags,
            spirit,
          };
          const got = runReads(assembleElementReads(threshold), hit)[0]!;
          const want = (n: number) => bits(n > threshold ? curve(40, n, threshold) : 40);
          const ok = mode === "negative" ? [want(m), want(m - 1)] : [want(m)];
          assert.ok(
            ok.includes(got),
            JSON.stringify({ threshold, m, mode, spirit, mv, got: f32(got) }),
          );
        }
      }
    }
  }
});
