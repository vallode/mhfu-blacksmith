import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { BinaryReader } from "../src/binary/reader.js";
import { runExportSite } from "../src/cli/export-site.js";
import { OVL_HEADER_SIZE } from "../src/container/ovl.js";
import {
  COLLISION_POINTER_OFFSET,
  COLLISION_RECORD_SIZE,
  readCollisionRecords,
  type CollisionRecord,
} from "../src/monsters/collision.js";
import { buildSiteHitboxes } from "../src/monsters/hitboxes.js";
import {
  GAME_TASK_JP,
  HITZONE_POINTER_OFFSET,
  MONSTER_CHUNK_COUNT,
  MONSTER_CHUNK_SIZE,
} from "../src/monsters/hitzones.js";
import { isSkeleton, jointPositions, readSkeleton, type Vec3 } from "../src/models/skeleton.js";
import { pac, pmo } from "./model-fixtures.js";

interface JointSpec {
  id: number;
  parent: number | null;
  translation: Vec3;
  rotation?: Vec3;
}

/** A skeleton entry as in `emmodel/emNN.pac` index 0 (see `models/skeleton.ts`). */
function skeleton(joints: JointSpec[]): Buffer {
  const size = 0x20 + joints.length * 0x10c;
  const buf = Buffer.alloc(size);
  buf.writeUInt32LE(0xc0000000, 0);
  buf.writeUInt32LE(joints.length + 1, 4);
  buf.writeUInt32LE(size, 8);
  buf.set([2, 0, 0, 0, 0x14], 0x10); // the unknown block
  joints.forEach((joint, i) => {
    const at = 0x20 + i * 0x10c;
    buf.writeUInt32LE(0x40000001, at);
    buf.writeUInt32LE(1, at + 4);
    buf.writeUInt32LE(0x10c, at + 8);
    buf.writeUInt32LE(joint.id, at + 0x0c);
    buf.writeUInt32LE(joint.parent ?? 0xffffffff, at + 0x10);
    buf.writeUInt32LE(0xffffffff, at + 0x14);
    buf.writeUInt32LE(0xffffffff, at + 0x18);
    const vec4 = (offset: number, v: Vec3) => {
      v.forEach((c, k) => buf.writeFloatLE(c, at + offset + k * 4));
      buf.writeFloatLE(1, at + offset + 12);
    };
    vec4(0x1c, [1, 1, 1]);
    vec4(0x2c, joint.rotation ?? [0, 0, 0]);
    vec4(0x3c, joint.translation);
    buf.writeUInt32LE(0xffffffff, at + 0x4c);
  });
  return buf;
}

const RATHIAN_JOINTS: JointSpec[] = [
  { id: 0, parent: null, translation: [0, 0, 0] },
  { id: 1, parent: 0, translation: [0, 0, 50] },
  { id: 2, parent: 1, translation: [100, -10, 0] },
];

test("readSkeleton reads joint records and jointPositions adds translations down the chain", () => {
  const buf = skeleton(RATHIAN_JOINTS);
  assert.ok(isSkeleton(buf));
  const joints = readSkeleton(buf);
  assert.deepEqual(
    joints.map((j) => [j.id, j.parent]),
    [
      [0, null],
      [1, 0],
      [2, 1],
    ],
  );
  assert.deepEqual(jointPositions(joints).get(2), [100, -10, 50]);
});

test("jointPositions refuses rotated joints instead of placing them wrongly", () => {
  const joints = readSkeleton(
    skeleton([
      { id: 0, parent: null, translation: [0, 0, 0] },
      { id: 1, parent: 0, translation: [0, 0, 50], rotation: [0, 1.5, 0] },
    ]),
  );
  assert.throws(() => jointPositions(joints), /Joint 1 is rotated/);
});

interface RecordSpec {
  joint: number;
  row: number;
  part?: number;
  flags?: number;
  radius: number;
  start: Vec3;
  end: Vec3;
}

/** Collision records followed by the 0xFFFF end marker. */
function collisionTable(records: RecordSpec[]): Buffer {
  const buf = Buffer.alloc((records.length + 1) * COLLISION_RECORD_SIZE);
  records.forEach((record, i) => {
    const at = i * COLLISION_RECORD_SIZE;
    buf.writeUInt16LE(record.joint, at);
    buf.writeUInt16LE(1, at + 2);
    buf.writeUInt16LE(record.row, at + 4);
    buf.writeUInt16LE(record.part ?? 0, at + 6);
    buf.writeUInt32LE(record.flags ?? 0, at + 8);
    buf.writeFloatLE(record.radius, at + 0x0c);
    [...record.start, ...record.end].forEach((v, k) => buf.writeFloatLE(v, at + 0x10 + k * 4));
  });
  buf.writeUInt16LE(0xffff, records.length * COLLISION_RECORD_SIZE);
  return buf;
}

const WING: RecordSpec = {
  joint: 2,
  row: 5,
  part: 1,
  radius: 75,
  start: [30, 2, 10],
  end: [135, -3, 0],
};

test("readCollisionRecords reads records up to the 0xFFFF joint", () => {
  const table = collisionTable([WING, { ...WING, joint: 1, row: 0, flags: 0x08000000 }]);
  const records = readCollisionRecords(new BinaryReader(table), 0);
  assert.equal(records?.length, 2);
  assert.deepEqual(records![0], {
    joint: 2,
    flag: 1,
    row: 5,
    part: 1,
    flags: 0,
    radius: 75,
    start: [30, 2, 10],
    end: [135, -3, 0],
  } satisfies CollisionRecord);
  assert.equal(records![1]!.flags, 0x08000000);
  // No end marker before the end of the buffer.
  assert.equal(readCollisionRecords(new BinaryReader(table.subarray(0, 0x28)), 0), null);
});

test("buildSiteHitboxes places capsules in model space and names them by hitzone row", () => {
  const records = readCollisionRecords(
    new BinaryReader(
      collisionTable([
        WING,
        { ...WING, joint: 125 }, // not in the skeleton
        { ...WING, row: 0, radius: 0 }, // a placeholder with no size
        { ...WING, row: 6 }, // a row no part uses
        { ...WING, joint: 1, row: 0, flags: 0x08000000 }, // the head's flag
        { ...WING, joint: 0, row: 0, flags: 5 }, // Rathian's body-centre sphere
      ]),
    ),
    0,
  )!;
  const { hitboxes, skipped } = buildSiteHitboxes(
    records,
    jointPositions(readSkeleton(skeleton(RATHIAN_JOINTS))),
    { head: [0, 0], wing: [0, 5], "wing-broken": [1, 5] },
  );
  assert.deepEqual(hitboxes.capsules[0], {
    row: 5,
    parts: ["wing", "wing-broken"],
    part: 1,
    flags: 0,
    radius: 75,
    start: [130, -8, 60],
    end: [235, -13, 50],
  });
  assert.deepEqual(hitboxes.capsules[1]!.parts, []);
  assert.deepEqual(hitboxes.capsules[2]!.parts, ["head"]);
  assert.equal(hitboxes.capsules.length, 3);
  assert.deepEqual(skipped, [
    "record 1: joint 125 isn't in the skeleton",
    "record 2: no size (radius 0)",
    "record 5: flags 0x5 aren't a damage capsule's (joint 0, row 0)",
  ]);
});

/** A `game_task.ovl` with every `MonChunk` plausible at the JP offset (as `locateMonsterChunks` needs). */
function gameTask(collisionPointers: Record<number, number>): Buffer {
  const chunks = GAME_TASK_JP.monsterChunks - GAME_TASK_JP.loadBase;
  const buf = Buffer.alloc(chunks + MONSTER_CHUNK_COUNT * MONSTER_CHUNK_SIZE + 0x100);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(GAME_TASK_JP.loadBase, 0x08);
  buf.writeUInt32LE(GAME_TASK_JP.loadBase + buf.length, 0x1c);
  buf.write("game_task.ovl", 0x20, "latin1");
  for (let id = 0; id < MONSTER_CHUNK_COUNT; id++) {
    const at = chunks + id * MONSTER_CHUNK_SIZE;
    buf.writeFloatLE(1, at + 0x40);
    buf.writeUInt32LE(GAME_TASK_JP.loadBase + 0x100, at + HITZONE_POINTER_OFFSET);
    buf.writeUInt32LE(collisionPointers[id] ?? 0, at + COLLISION_POINTER_OFFSET);
  }
  return buf;
}

const EM_BASE = 0x09d1a180;

function emOvl(table: Buffer): Buffer {
  const buf = Buffer.alloc(OVL_HEADER_SIZE + table.length);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(EM_BASE, 0x08);
  buf.writeUInt32LE(EM_BASE + buf.length, 0x1c);
  buf.write("em01.ovl", 0x20, "latin1");
  table.copy(buf, OVL_HEADER_SIZE);
  return buf;
}

test("export-site writes hitboxes next to a monster's model and removes stale ones", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hitboxes-"));
  try {
    const unpacked = path.join(root, "unpacked");
    const data = path.join(root, "data");
    const out = path.join(root, "public");
    await mkdir(path.join(unpacked, "data-bin", "emmodel"), { recursive: true });
    await mkdir(path.join(unpacked, "data-bin", "overlay"), { recursive: true });
    await mkdir(path.join(data, "monsters"), { recursive: true });
    await mkdir(path.join(out, "monsters"), { recursive: true });
    await writeFile(
      path.join(unpacked, "manifest.json"),
      JSON.stringify({ region: "jp", discId: "ULJM05500", isoPath: "", fileCount: 0 }),
    );
    await writeFile(
      path.join(data, "monsters", "test.json"),
      JSON.stringify({ monsters: [{ name: "Rathian" }, { name: "Kelbi" }] }),
    );
    const model = pac([skeleton(RATHIAN_JOINTS), pmo()]);
    await writeFile(path.join(unpacked, "data-bin", "emmodel", "em01.pac"), model);
    await writeFile(path.join(unpacked, "data-bin", "emmodel", "em03.pac"), model);
    // Rathian's table is in its own overlay; Kelbi's pointer leads nowhere.
    await writeFile(
      path.join(unpacked, "data-bin", "overlay", "game_task.ovl"),
      gameTask({ 1: EM_BASE + OVL_HEADER_SIZE }),
    );
    await writeFile(
      path.join(unpacked, "data-bin", "overlay", "em01.ovl"),
      emOvl(collisionTable([WING])),
    );
    const stale = path.join(out, "monsters", "em03.hitboxes.json");
    await writeFile(stale, "{}");

    const manifest = await runExportSite({ unpacked, data, out, lossless: true });
    assert.deepEqual(manifest.monsters, { Kelbi: 3, Rathian: 1 });
    const hitboxes = JSON.parse(
      await readFile(path.join(out, "monsters", "em01.hitboxes.json"), "utf-8"),
    );
    assert.deepEqual(hitboxes.capsules, [
      {
        row: 5,
        parts: ["wing"],
        part: 1,
        flags: 0,
        radius: 75,
        start: [130, -8, 60],
        end: [235, -13, 50],
      },
    ]);
    await assert.rejects(readFile(stale));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
