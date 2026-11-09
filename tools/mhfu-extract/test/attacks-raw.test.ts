import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { writeAttacksRaw } from "../src/cli/attacks-raw.js";
import { OVL_HEADER_SIZE, parseOvl } from "../src/container/ovl.js";
import {
  agreedStride,
  cribAttacks,
  dumpAttacksRaw,
  findAnchors,
  tableLayout,
  type AttackCrib,
  type AttackRawDump,
  type CribAttack,
  type SearchFile,
} from "../src/emit/attacks-raw.js";
import { MONSTER_CHUNK_COUNT, MONSTER_CHUNK_SIZE } from "../src/monsters/hitzones.js";
import { monsterIdOf } from "../src/overlay/monsters.js";
import crib from "../src/overlay/attack-crib.json" with { type: "json" };
import { pac } from "./model-fixtures.js";

const GAME_TASK_BASE = 0x09a5a580;
const EM_BASE = 0x09d15140;

/** Deterministic noise of small numbers, like the tables an overlay is full of. */
function noise(buf: Buffer, from: number, to: number, seed = 1): void {
  let x = seed;
  for (let at = from; at < to; at++) {
    x = (x * 1103515245 + 12345) >>> 0;
    buf[at] = (x >>> 16) % 7 === 0 ? ((x >>> 8) % 20) * 5 : (x >>> 8) & 0xff;
  }
}

function ovl(name: string, loadBase: number, dataSize: number): Buffer {
  const buf = Buffer.alloc(OVL_HEADER_SIZE + dataSize);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(loadBase, 0x08);
  buf.writeUInt32LE(loadBase + buf.length, 0x1c);
  buf.write(name, 0x20, "latin1");
  return buf;
}

const RATHIAN: CribAttack[] = [
  { monster: "Rathian", name: "Bite", damage: 20, stun: 10, guard: 30 },
  { monster: "Rathian", name: "Charge", damage: 50, stun: 20, guard: 30 },
  { monster: "Rathian", name: "Tail Spin", damage: 35, stun: 20, guard: 30 },
  { monster: "Rathian", name: "Backflip", damage: 75, stun: 40, guard: 40 },
];
const TIGREX: CribAttack[] = [
  { monster: "Tigrex", name: "Bite", damage: 30, stun: 10, guard: 39 },
  { monster: "Tigrex", name: "Double Bite", damage: 70, stun: 30, guard: 40 },
  { monster: "Tigrex", name: "Charge", damage: 64, stun: 25, guard: 40 },
  { monster: "Tigrex", name: "Pounce", damage: 65, stun: 20, guard: 40 },
];

/** Records of `stride` bytes: damage at +2, stun at +5, guard at +9 (u8). */
const STRIDE = 0x18;
const DAMAGE_AT = 2;
const STUN_AT = 5;
const GUARD_AT = 9;

/** Row of each attack: the second row is an attack the crib doesn't know. */
const rowOf = (i: number) => (i === 0 ? 0 : i + 1);

/** Writes `attacks` as a table at `at`. */
function writeTable(buf: Buffer, at: number, attacks: CribAttack[]): void {
  buf.fill(0, at, at + (attacks.length + 1) * STRIDE);
  buf[at + STRIDE + DAMAGE_AT] = 99;
  attacks.forEach((a, i) => {
    const row = at + rowOf(i) * STRIDE;
    buf[row + DAMAGE_AT] = a.damage;
    buf[row + STUN_AT] = a.stun;
    buf[row + GUARD_AT] = a.guard;
  });
}

const patternOf = (found: ReturnType<typeof findAnchors>, stun: number, guard: number) =>
  [...found.values()].find((e) => e.pattern.stun === stun && e.pattern.guard === guard);

test("findAnchors finds an attack's numbers at their offsets from damage", () => {
  const buf = Buffer.alloc(0x100);
  writeTable(buf, 0x40, RATHIAN);
  const real = patternOf(
    findAnchors(buf, RATHIAN, "u8"),
    STUN_AT - DAMAGE_AT,
    GUARD_AT - DAMAGE_AT,
  );
  assert.ok(real);
  assert.deepEqual(
    real.anchors.map((a) => [a.attack, a.offset]),
    RATHIAN.map((_, i) => [i, 0x40 + rowOf(i) * STRIDE + DAMAGE_AT]),
  );
});

test("findAnchors reads f32 fields at their alignment", () => {
  const buf = Buffer.alloc(0x100);
  RATHIAN.forEach((a, i) => {
    const row = 0x20 + i * 0x20;
    buf.writeFloatLE(a.damage, row);
    buf.writeFloatLE(a.stun, row + 8);
    buf.writeFloatLE(a.guard, row + 4);
  });
  const real = patternOf(findAnchors(buf, RATHIAN, "f32"), 8, 4);
  assert.equal(real?.anchors.length, RATHIAN.length);
  // Bytes don't see the floats.
  assert.equal(findAnchors(buf, RATHIAN, "u8").length, 0);
});

test("tableLayout keeps the attacks that line up as rows and drops strays", () => {
  const rows = [0, 2, 3, 4].map((row, attack) => ({ attack, offset: 0x100 + row * STRIDE }));
  const stray = { attack: 1, offset: 0x111 };
  const layout = tableLayout(
    [...rows, stray].sort((a, b) => a.offset - b.offset),
    8,
  );
  assert.equal(layout?.stride, STRIDE);
  assert.deepEqual(layout?.anchors, rows);
  // Three hits that only line up on a stride far shorter than their spread.
  assert.equal(
    tableLayout(
      [
        { attack: 0, offset: 0x10 },
        { attack: 1, offset: 0x13 },
        { attack: 2, offset: 0x10 + 0x7f * 50 },
      ],
      3,
    ),
    null,
  );
  // Too few attacks.
  assert.equal(tableLayout(rows.slice(0, 2), 8), null);
});

test("agreedStride takes the stride most monsters' clusters are multiples of", () => {
  const cluster = (monster: string, stride: number) =>
    ({ monster, stride }) as Parameters<typeof agreedStride>[0][number];
  assert.deepEqual(
    agreedStride([cluster("A", 0x30), cluster("B", 0x60), cluster("C", 0x14), cluster("A", 0x18)]),
    { stride: 0x30, monsters: 2 },
  );
});

test("dumpAttacksRaw ranks the shared layout first and names the chunk slot pointing at it", () => {
  const RATHIAN_ID = monsterIdOf("Rathian")!;
  const TIGREX_ID = monsterIdOf("Tigrex")!;
  // game_task.ovl: noise, then the chunk array, then Tigrex's table.
  const chunks = OVL_HEADER_SIZE + 0x800;
  const tigrexAt = chunks + MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE + 0x100;
  const task = ovl("game_task.ovl", GAME_TASK_BASE, tigrexAt - OVL_HEADER_SIZE + 0x400);
  noise(task, OVL_HEADER_SIZE, task.length, 7);
  task.fill(0, chunks, chunks + MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE);
  writeTable(task, tigrexAt, TIGREX);
  task.writeUInt32LE(GAME_TASK_BASE + tigrexAt, chunks + TIGREX_ID * MONSTER_CHUNK_SIZE + 0x160);

  // em01.ovl: noise, a two-entry pointer list, Rathian's table.
  const em = ovl("em01.ovl", EM_BASE, 0x800);
  noise(em, OVL_HEADER_SIZE, em.length, 3);
  const listAt = OVL_HEADER_SIZE + 0x100;
  const rathianAt = OVL_HEADER_SIZE + 0x200;
  writeTable(em, rathianAt, RATHIAN);
  em.fill(0, listAt - 0x10, listAt + 0x10);
  em.writeUInt32LE(EM_BASE + rathianAt, listAt);
  em.writeUInt32LE(EM_BASE + rathianAt + 2 * STRIDE, listAt + 4);
  // Rathian's chunk points at the list.
  task.writeUInt32LE(EM_BASE + listAt, chunks + RATHIAN_ID * MONSTER_CHUNK_SIZE + 0x164);

  const gameTask = parseOvl(task);
  const em01 = parseOvl(em);
  const files: SearchFile[] = [
    { name: "game_task.ovl", buf: task, ovl: gameTask },
    { name: "overlay/em01.ovl", buf: em, ovl: em01, emId: 1 },
  ];
  const dump = dumpAttacksRaw(files, [...RATHIAN, ...TIGREX], { ovl: gameTask, offset: chunks });

  assert.deepEqual(dump.crib, { monsters: 2, attacks: 8 });
  const [best] = dump.patterns;
  assert.deepEqual(best!.pattern, {
    kind: "u8",
    stun: STUN_AT - DAMAGE_AT,
    guard: GUARD_AT - DAMAGE_AT,
  });
  assert.equal(best!.stride, STRIDE);
  assert.equal(best!.monstersAtStride, 2);

  const byMonster = new Map(best!.clusters.map((c) => [c.monster, c]));
  const tigrex = byMonster.get("Tigrex")!;
  assert.equal(tigrex.file, "game_task.ovl");
  assert.equal(tigrex.monsterEmId, TIGREX_ID);
  assert.equal(tigrex.monsterAttacks, 4);
  assert.equal(tigrex.start, tigrexAt + DAMAGE_AT);
  assert.deepEqual(
    tigrex.refs.map((r) => r.chunk),
    [{ emId: TIGREX_ID, at: "0x160" }],
  );
  assert.equal(tigrex.rows[4]!.offset, tigrexAt + DAMAGE_AT);

  const rathian = byMonster.get("Rathian")!;
  assert.equal(rathian.file, "overlay/em01.ovl");
  assert.equal(rathian.fileEmId, 1);
  // Both list entries point into the table; the list's start is in Rathian's chunk.
  assert.equal(rathian.refs.length, 2);
  for (const ref of rathian.refs) {
    assert.equal(ref.file, "overlay/em01.ovl");
    assert.equal(ref.list?.offset, listAt);
    assert.equal(ref.list?.length, 2);
    assert.deepEqual(
      ref.list?.refs.map((r) => r.chunk),
      [{ emId: RATHIAN_ID, at: "0x164" }],
    );
  }
});

test("the committed crib names site monsters and has attacks to search", () => {
  const attacks = cribAttacks(crib as AttackCrib);
  assert.ok(attacks.length >= 200, `${attacks.length} attacks`);
  for (const monster of Object.keys((crib as AttackCrib).monsters)) {
    assert.notEqual(monsterIdOf(monster), null, monster);
  }
  // Attacks without all three numbers are left out.
  assert.deepEqual(
    cribAttacks({
      monsters: {
        X: [
          { name: "a", damage: 1, stun: 2, guard: 3 },
          { name: "b", damage: 1 },
        ],
      },
    }),
    [{ monster: "X", name: "a", damage: 1, stun: 2, guard: 3 }],
  );
});

test("writeAttacksRaw searches the emNN.ovl files and model package entries with the crib", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "attacks-raw-"));
  try {
    // em01.ovl holds Rathian's table, em03.pac's second entry Tigrex's: the crib's own numbers.
    const em = ovl("em01.ovl", EM_BASE, 0x400);
    writeTable(em, OVL_HEADER_SIZE + 0x100, RATHIAN);
    const motions = Buffer.alloc(0x400);
    writeTable(motions, 0x80, TIGREX);
    await mkdir(path.join(dir, "data-bin", "overlay"), { recursive: true });
    await mkdir(path.join(dir, "data-bin", "emmodel"), { recursive: true });
    await writeFile(path.join(dir, "data-bin", "overlay", "em01.ovl"), em);
    await writeFile(
      path.join(dir, "data-bin", "emmodel", "em03.pac"),
      pac([Buffer.alloc(0x10), motions]),
    );
    const chunks = OVL_HEADER_SIZE;
    const task = ovl("game_task.ovl", GAME_TASK_BASE, MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE);
    const sub = ovl("game_sub.ovl", 0x09c14280, 0x40);

    await writeAttacksRaw(
      dir,
      dir,
      Buffer.alloc(0x40),
      { gameTask: parseOvl(task), gameSub: parseOvl(sub) },
      chunks,
    );
    const dump = JSON.parse(
      await readFile(path.join(dir, "raw", "attacks.json"), "utf-8"),
    ) as AttackRawDump;
    assert.deepEqual(
      dump.files.map((f) => f.name),
      [
        "eboot.bin",
        "game_task.ovl",
        "game_sub.ovl",
        "overlay/em01.ovl",
        "emmodel/em03.pac#0",
        "emmodel/em03.pac#1",
      ],
    );
    const [best] = dump.patterns;
    assert.deepEqual(best!.pattern, {
      kind: "u8",
      stun: STUN_AT - DAMAGE_AT,
      guard: GUARD_AT - DAMAGE_AT,
    });
    assert.deepEqual(best!.clusters.map((c) => [c.monster, c.file, c.stride]).sort(), [
      ["Rathian", "overlay/em01.ovl", STRIDE],
      ["Tigrex", "emmodel/em03.pac#1", STRIDE],
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
