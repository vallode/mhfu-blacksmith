import assert from "node:assert/strict";
import { test } from "node:test";
import { OVL_HEADER_SIZE, parseOvl } from "../src/container/ovl.js";
import {
  COLLISION_POINTER_OFFSET,
  dumpCollisionRaw,
  dumpEmModelRaw,
} from "../src/emit/collision-raw.js";
import { MONSTER_CHUNK_COUNT, MONSTER_CHUNK_SIZE } from "../src/monsters/hitzones.js";

const GAME_TASK_BASE = 0x09a5a580;
const EM_BASE = 0x09d00000;
const hex = (n: number) => `0x${n.toString(16).padStart(8, "0")}`;

function ovl(name: string, loadBase: number, dataSize: number): Buffer {
  const buf = Buffer.alloc(OVL_HEADER_SIZE + dataSize);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(loadBase, 0x08);
  buf.writeUInt32LE(loadBase + buf.length, 0x1c);
  buf.write(name, 0x20, "latin1");
  return buf;
}

test("dumpCollisionRaw follows CollisionPTR into game_task.ovl and the monster's emNN.ovl", () => {
  const chunks = OVL_HEADER_SIZE;
  const tableAt = chunks + MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE;
  const task = ovl("game_task.ovl", GAME_TASK_BASE, tableAt - OVL_HEADER_SIZE + 0x100);
  // emID 1: CollisionPTR -> a list of two pointers in game_task.ovl, then 1.5f.
  const chunk1 = chunks + MONSTER_CHUNK_SIZE;
  task.writeUInt32LE(GAME_TASK_BASE + tableAt, chunk1 + COLLISION_POINTER_OFFSET);
  task.writeUInt32LE(GAME_TASK_BASE + tableAt + 0x10, tableAt);
  task.writeUInt32LE(GAME_TASK_BASE + tableAt + 0x20, tableAt + 4);
  task.writeFloatLE(1.5, tableAt + 8);
  // emID 2: CollisionPTR into its own emNN.ovl.
  const em = ovl("em02.ovl", EM_BASE, 0x40);
  em.writeFloatLE(-2.25, OVL_HEADER_SIZE + 4);
  task.writeUInt32LE(
    EM_BASE + OVL_HEADER_SIZE,
    chunks + 2 * MONSTER_CHUNK_SIZE + COLLISION_POINTER_OFFSET,
  );
  // emID 3: a pointer nowhere known.
  task.writeUInt32LE(0x08900000, chunks + 3 * MONSTER_CHUNK_SIZE + COLLISION_POINTER_OFFSET);

  const dump = dumpCollisionRaw(parseOvl(task), chunks, new Map([[2, parseOvl(em)]]), (id) =>
    id === 1 ? "Rathian" : null,
  );
  assert.equal(dump.length, MONSTER_CHUNK_COUNT);

  const [none, rathian, em2, em3] = dump;
  assert.equal(none!.collision, null);
  assert.deepEqual(none!.pointers, []);
  assert.equal(none!.chunkHex.length, MONSTER_CHUNK_SIZE * 2);

  assert.equal(rathian!.name, "Rathian");
  assert.deepEqual(rathian!.pointers, [
    { at: "0x50", value: hex(GAME_TASK_BASE + tableAt), file: "game_task" },
  ]);
  assert.equal(rathian!.collision!.file, "game_task");
  assert.equal(rathian!.collision!.f32[2], 1.5);
  assert.deepEqual(
    rathian!.collision!.list.map((w) => w.fileOffset),
    [hex(tableAt + 0x10), hex(tableAt + 0x20)],
  );
  // Windows stop at the end of the file.
  assert.equal(rathian!.collision!.hex.length, 0x100 * 2);

  assert.equal(em2!.collision!.file, "em_ovl");
  assert.equal(em2!.collision!.f32[1], -2.25);
  assert.deepEqual(em2!.collision!.list, []);
  assert.equal(em2!.emOvl!.loadBase, hex(EM_BASE));

  assert.equal(em3!.collision, null);
  assert.equal(em3!.pointers[0]!.file, "other");
});

function pac(entries: Buffer[]): Buffer {
  const header = Buffer.alloc(4 + entries.length * 8);
  header.writeUInt32LE(entries.length, 0);
  let offset = header.length;
  entries.forEach((entry, i) => {
    if (entry.length === 0) return; // unused (0, 0) slot
    header.writeUInt32LE(offset, 4 + i * 8);
    header.writeUInt32LE(entry.length, 8 + i * 8);
    offset += entry.length;
  });
  return Buffer.concat([header, ...entries]);
}

/** One mesh, one weighted vertex group: a 3-vertex non-indexed triangle list. */
function weightedPmo(): Buffer {
  const buf = Buffer.alloc(0x100);
  buf.write("pmo\x001.0\x00", 0, "latin1");
  buf.writeUInt32LE(buf.length, 0x08);
  buf.writeUInt16LE(1, 0x1c); // meshes
  buf.writeUInt16LE(1, 0x1e); // materials
  buf.writeUInt32LE(0x40, 0x20); // mesh table
  buf.writeUInt32LE(0x60, 0x24); // vertex groups
  buf.writeUInt32LE(0x80, 0x28); // material map
  buf.writeUInt32LE(0x90, 0x30); // materials
  buf.writeUInt32LE(0xa0, 0x34); // display lists
  buf.writeUInt16LE(1, 0x54); // group count
  buf.writeUInt8(7, 0x61); // an unknown group byte, kept in the raw record
  // VTYPE: 2 u8 weights ((2-1) << 14 | u8 weight 1 << 9), s16 positions (2 << 7).
  const vtype = (1 << 14) | (1 << 9) | (2 << 7);
  const vertices = 0x20;
  const commands = [
    (0x01 << 24) | vertices, // VADDR
    (0x12 << 24) | vtype,
    (0x04 << 24) | (3 << 16) | 3, // PRIM triangles, 3 vertices
    0x0b << 24, // RET
  ];
  commands.forEach((c, i) => buf.writeUInt32LE(c >>> 0, 0xa0 + i * 4));
  // Stride: 2 weight bytes, then s16 xyz aligned to 2 = 8 bytes.
  const positions = [
    [0, 0, 0],
    [0x4000, 0, 0],
    [0, -0x4000, 0x7fff],
  ];
  positions.forEach((p, i) => {
    const at = 0xa0 + vertices + i * 8;
    buf.writeUInt8(0x80, at);
    p.forEach((v, j) => buf.writeInt16LE(v, at + 2 + j * 2));
  });
  return buf;
}

test("dumpEmModelRaw lists package entries and the PMO's raw mesh and vertex-group records", () => {
  const skeleton = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
  const { entry, unknown } = dumpEmModelRaw(
    "emmodel/em01.pac",
    pac([weightedPmo(), skeleton, Buffer.alloc(0)]),
  );
  assert.equal(entry.error, undefined);
  assert.deepEqual(
    entry.entries.map((e) => [e.index, e.kind, e.size]),
    [
      [0, "pmo", 0x100],
      [1, "unknown", 5],
      [2, "empty", 0],
    ],
  );
  assert.deepEqual(
    unknown.map((u) => [u.index, u.data.toString("hex")]),
    [[1, "0102030405"]],
  );

  const pmo = entry.pmo!;
  assert.equal(pmo.headerHex.length, 0x38 * 2);
  assert.deepEqual(
    pmo.meshes.map((m) => [m.firstGroup, m.groupCount]),
    [[0, 1]],
  );
  assert.equal(pmo.vertexGroups.length, 1);
  const [group] = pmo.vertexGroups;
  assert.equal(group!.hex.slice(2, 4), "07");
  assert.equal(group!.vertices, 3);
  assert.equal(group!.weights, 2);
  // s16 positions normalize by 32767.
  assert.deepEqual(group!.min, [0, -0.500015, 0]);
  assert.deepEqual(group!.max, [0.500015, 0, 1]);
});

test("dumpEmModelRaw reports non-packages instead of throwing", () => {
  const { entry, unknown } = dumpEmModelRaw("emmodel/em99.pac", Buffer.from("nope"));
  assert.equal(entry.error, "not a .pac");
  assert.deepEqual(unknown, []);
});
