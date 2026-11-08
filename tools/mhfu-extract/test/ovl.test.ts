import assert from "node:assert/strict";
import { test } from "node:test";
import { OVL_HEADER_SIZE, OvlFormatError, parseOvl, type OvlFile } from "../src/container/ovl.js";
import { emitMonsters } from "../src/emit/monsters.js";
import {
  HITZONE_POINTER_OFFSET,
  locateMonsterChunks,
  MONSTER_CHUNK_COUNT,
  MONSTER_CHUNK_SIZE,
  readHitzoneRows,
  readMonsterChunks,
  TOLERANCE_OFFSET,
} from "../src/monsters/hitzones.js";
import {
  CAP_BREAK_POINTER_COUNT,
  CAPTURE_TYPE,
  CARVE_INDEX_COUNT,
  CARVE_INDEX_SIZE,
  CARVE_POINTER_COUNT,
  locateRewardTables,
  readCapBreakTables,
  readCarveTables,
  readRewardList,
} from "../src/monsters/rewards.js";

const LOAD_BASE = 0x09a5a580;

/** Builds a synthetic MWo3-framed buffer: header + `dataSize` bytes of image. */
function buildOvl(
  options: { name?: string; loadBase?: number; loadEnd?: number; dataSize?: number } = {},
): Buffer {
  const {
    name = "game_task.ovl",
    loadBase = LOAD_BASE,
    loadEnd = loadBase + 0x1000,
    dataSize = 0x200,
  } = options;
  const buf = Buffer.alloc(OVL_HEADER_SIZE + dataSize);
  buf.write("MWo3", 0, "latin1");
  buf.writeUInt32LE(0x0a, 0x04); // unk1, arbitrary
  buf.writeUInt32LE(loadBase, 0x08);
  buf.writeUInt32LE(loadEnd, 0x1c);
  buf.write(name, 0x20, "latin1");
  return buf;
}

test("parseOvl reads the MWo3 header fields", () => {
  const ovl = parseOvl(
    buildOvl({ name: "game_task.ovl", loadBase: 0x09a5a580, loadEnd: 0x09c0c16c }),
  );
  assert.equal(ovl.name, "game_task.ovl");
  assert.equal(ovl.loadBase, 0x09a5a580);
  assert.equal(ovl.loadEnd, 0x09c0c16c);
});

test("parseOvl rejects buffers without the MWo3 magic", () => {
  const buf = buildOvl();
  buf.write("XXXX", 0, "latin1");
  assert.throws(() => parseOvl(buf), OvlFormatError);
});

test("loadBase is file offset 0: the header is loaded with the image", () => {
  const ovl = parseOvl(buildOvl({ loadBase: LOAD_BASE }));
  assert.equal(ovl.vaddrToOffset(LOAD_BASE), 0);
  assert.equal(ovl.vaddrToOffset(LOAD_BASE + OVL_HEADER_SIZE), OVL_HEADER_SIZE);
});

test("isOwnVaddr covers the data image only", () => {
  const dataSize = 0x200;
  const ovl = parseOvl(buildOvl({ loadBase: LOAD_BASE, dataSize }));
  assert.equal(ovl.isOwnVaddr(LOAD_BASE), false); // the header
  assert.equal(ovl.isOwnVaddr(LOAD_BASE + OVL_HEADER_SIZE), true);
  assert.equal(ovl.isOwnVaddr(LOAD_BASE + OVL_HEADER_SIZE + dataSize - 4), true);
  // Past the image, e.g. a pointer into a sibling emXX.ovl.
  assert.equal(ovl.isOwnVaddr(LOAD_BASE + OVL_HEADER_SIZE + dataSize + 0x10000), false);
});

test("JP fixtures from the first investigation sit at these vaddrs", () => {
  // Found on the JP disc by file offset. The first investigation reported
  // vaddrs 0x80 lower (it mapped loadBase to file offset 0x80), which is why
  // no pointer to them turned up (vallode/mhfu-blacksmith#35).
  const task = parseOvl(buildOvl({ loadBase: 0x09a5a580, dataSize: 0x166000 }));
  assert.equal(task.vaddrToOffset(0x09bc0498), 0x165f18); // Felyne's row (part byte)
  assert.equal(task.vaddrToOffset(0x09bc0308), 0x165d88); // Mosswine's row
  const sub = parseOvl(buildOvl({ name: "game_sub.ovl", loadBase: 0x09c14280, dataSize: 0xbc000 }));
  assert.equal(sub.vaddrToOffset(0x09ccf6d8), 0xbb458); // Giaprey low-rank body carves
});

// --- Monster tables, from real EU (ULES01213) bytes --------------------------
//
// Synthetic overlays with the EU load bases and table offsets, holding
// byte-for-byte snippets of the real tables: Rathian's (emID 1) and
// Gravios's (17) hitzones and tolerances in game_task.ovl, Giaprey's (35)
// carve entry and list and Rathian's capture entry and list in game_sub.ovl.

const EU_TASK_LOAD = 0x09a5f200;
const EU_SUB_LOAD = 0x09c19000;
const EU_CHUNKS = 0x1597b0;

const put = (buf: Buffer, offset: number, hex: string) => Buffer.from(hex, "hex").copy(buf, offset);

const RATHIAN = {
  pointer: 0x09bc4ff0,
  list: "a84fbc0900000000",
  table: 0x09bc4fa8,
  rows: "6450463c000f0f1423645a322828000a0a0f140050191e1e0a0a0a0f1900463c3737000505140a003c1e1e190005050a190032191419000a0a0f1400282d28320005050a05000000",
  tolerances:
    "6e002c0105002c014b0078002c0105002c014b0096002c0105008403320064002c01050008070000c80096000a001400080796004b00",
};
const GRAVIOS = {
  pointer: 0x09bc54e8,
  list: "5854bc09a054bc09",
  tables: [
    [
      0x09bc5458,
      "64141e14000f050528965a1e1e14001e0a05140050141e1400190a050f0046191e1e00230f0523003c191e14001e0a05140032141414001405050f00280f1914001e05050a000000",
    ],
    [
      0x09bc54a0,
      "64141e14000f050528965a1e1e14001e0a05140050141e1400190a050f004650504b0f320f0532003c191e14001e0a05140032141414001405050f00280f1914001e05050a000000",
    ],
  ] as const,
};

function buildGameTask(): OvlFile {
  const buf = buildOvl({ loadBase: EU_TASK_LOAD, dataSize: 0x166400 });
  const at = (vaddr: number) => vaddr - EU_TASK_LOAD;
  put(buf, at(RATHIAN.table), RATHIAN.rows);
  put(buf, at(RATHIAN.pointer), RATHIAN.list);
  for (const [vaddr, rows] of GRAVIOS.tables) put(buf, at(vaddr), rows);
  put(buf, at(GRAVIOS.pointer), GRAVIOS.list);
  for (let emId = 0; emId < MONSTER_CHUNK_COUNT; emId++) {
    const base = EU_CHUNKS + emId * MONSTER_CHUNK_SIZE;
    buf.writeFloatLE(1, base + 0x40);
    buf.writeUInt32LE(
      emId === 17 ? GRAVIOS.pointer : RATHIAN.pointer,
      base + HITZONE_POINTER_OFFSET,
    );
  }
  put(buf, EU_CHUNKS + MONSTER_CHUNK_SIZE + TOLERANCE_OFFSET, RATHIAN.tolerances);
  return parseOvl(buf);
}

test("monster chunks are found on EU and lead to HitzoneTbl lists and rows", () => {
  const ovl = buildGameTask();
  const location = locateMonsterChunks(ovl, 0x1000);
  assert.deepEqual(location, { offset: EU_CHUNKS, shift: 0x110 });
  const chunks = readMonsterChunks(ovl, location.offset);

  const rathian = chunks[1]!;
  assert.equal(rathian.hitzones?.length, 1);
  assert.equal(rathian.hitzones[0]!.length, 7);
  // Matches data/monsters/flying-wyvern.json's Rathian "head" and "neck".
  assert.deepEqual(rathian.hitzones[0]![0], {
    lead: 100,
    values: {
      cut: 80,
      bash: 70,
      shot: 60,
      fire: 0,
      water: 15,
      ice: 15,
      thunder: 20,
      dragon: 35,
      ko: 100,
    },
  });
  assert.deepEqual(rathian.hitzones[0]![1]!.values, {
    cut: 50,
    bash: 40,
    shot: 40,
    fire: 0,
    water: 10,
    ice: 10,
    thunder: 15,
    dragon: 20,
    ko: 0,
  });
  assert.deepEqual(rathian.tolerances.paralysis, {
    initial: 110,
    recoveryTime: 300,
    recovery: 5,
    duration: 300,
    increase: 75,
  });
  assert.equal(rathian.tolerances.ko.initial, 120);
  assert.equal(rathian.tolerances.sleep.initial, 150);
  assert.deepEqual(rathian.tolerances.poison, {
    initial: 200,
    recoveryTime: 150,
    recovery: 10,
    damage: 20,
    totalTime: 1800,
    damagePerSecond: 150,
    increase: 75,
  });

  // Gravios: a second table, the broken belly (row 3) softer.
  const gravios = chunks[17]!;
  assert.equal(gravios.hitzones?.length, 2);
  assert.deepEqual(gravios.hitzones[0]![3]!.values.cut, 25);
  assert.deepEqual(gravios.hitzones[1]![3]!.values.cut, 80);
});

test("readHitzoneRows needs the zero u16 that ends a table", () => {
  const buf = buildOvl({ dataSize: 0x40 });
  put(buf, OVL_HEADER_SIZE, "6450463c000f0f142364");
  buf.fill(0x64, OVL_HEADER_SIZE + 10);
  const ovl = parseOvl(buf);
  assert.equal(readHitzoneRows(ovl, OVL_HEADER_SIZE), null);
  buf.writeUInt16LE(0, OVL_HEADER_SIZE + 10);
  assert.equal(readHitzoneRows(ovl, OVL_HEADER_SIZE)?.length, 1);
});

const CARVE_POINTERS = 0xbeeb0;
const CAP_POINTERS = 0xc4850;
const GIAPREY = {
  entry:
    "bd00be00bf00c000c100c200c300ffffffffffffffffffffffffffffffffffffffffffffffffffffffff01000000094300000000",
  lowIndex: 190,
  list: [0x09cd4768, "340054011e00560112001901ffff"],
} as const;
const RATHIAN_CAPTURE = {
  entry: "0180000001000200030004000500",
  low: [0x09cda820, "24000e0201003400080202000a002202010002000b020100ffff"],
} as const;
/** Every other pointer leads here: 100% Mega Potion (item 8), a list shape the disc uses. */
const FILLER_LIST = 0x09cd7a38;

function buildGameSub(): OvlFile {
  const buf = buildOvl({ name: "game_sub.ovl", loadBase: EU_SUB_LOAD, dataSize: 0xe2800 });
  const at = (vaddr: number) => vaddr - EU_SUB_LOAD;
  put(buf, at(FILLER_LIST), "64000800ffff");
  put(buf, at(GIAPREY.list[0]), GIAPREY.list[1]);
  put(buf, at(RATHIAN_CAPTURE.low[0]), RATHIAN_CAPTURE.low[1]);
  for (let i = 0; i < CARVE_POINTER_COUNT; i++) {
    const pointer = i === GIAPREY.lowIndex ? GIAPREY.list[0] : FILLER_LIST;
    buf.writeUInt32LE(pointer, CARVE_POINTERS + i * 4);
  }
  const carveIndex = CARVE_POINTERS + CARVE_POINTER_COUNT * 4;
  buf.fill(0xff, carveIndex, carveIndex + CARVE_INDEX_COUNT * CARVE_INDEX_SIZE);
  put(buf, carveIndex + 34 * CARVE_INDEX_SIZE, GIAPREY.entry);
  for (let i = 0; i < CAP_BREAK_POINTER_COUNT; i++) {
    buf.writeUInt32LE(i === 1 ? RATHIAN_CAPTURE.low[0] : FILLER_LIST, CAP_POINTERS + i * 4);
  }
  const capIndex = CAP_POINTERS + CAP_BREAK_POINTER_COUNT * 4;
  put(buf, capIndex, RATHIAN_CAPTURE.entry);
  buf.writeUInt8(0xff, capIndex + 14);
  return parseOvl(buf);
}

test("reward tables are found by their pointer runs and lead to each monster's lists", () => {
  const ovl = buildGameSub();
  const location = locateRewardTables(ovl);
  assert.deepEqual(location, {
    carves: { pointers: CARVE_POINTERS, index: 0xbffb0 },
    capBreak: { pointers: CAP_POINTERS, index: 0xc56c0 },
  });

  const carves = readCarveTables(ovl, location.carves);
  const giaprey = carves[34]!;
  assert.equal(giaprey.emId, 35);
  // data/monsters/bird-wyvern.json: Giaprey low-rank body carves.
  assert.deepEqual(giaprey.body.low, [
    { chance: 52, itemId: 340 },
    { chance: 30, itemId: 342 },
    { chance: 18, itemId: 281 },
  ]);
  assert.deepEqual(giaprey.body.high, [{ chance: 100, itemId: 8 }]);
  assert.deepEqual(giaprey.tail, {});

  const caps = readCapBreakTables(ovl, location.capBreak);
  assert.equal(caps.length, 1);
  assert.equal(caps[0]!.emId, 1);
  assert.equal(caps[0]!.type, CAPTURE_TYPE);
  // data/monsters/flying-wyvern.json: Rathian low-rank capture.
  assert.deepEqual(caps[0]!.ranks.low, [
    { chance: 36, itemId: 526, amount: 1 },
    { chance: 52, itemId: 520, amount: 2 },
    { chance: 10, itemId: 546, amount: 1 },
    { chance: 2, itemId: 523, amount: 1 },
  ]);
});

test("readRewardList rejects lists that run on or leave the overlay", () => {
  const buf = buildOvl({ name: "game_sub.ovl", loadBase: EU_SUB_LOAD, dataSize: 0x40 });
  const ovl = parseOvl(buf);
  const vaddr = EU_SUB_LOAD + OVL_HEADER_SIZE;
  buf.writeUInt16LE(150, OVL_HEADER_SIZE); // chance > 100
  assert.equal(readRewardList(ovl, vaddr, false), null);
  buf.writeUInt16LE(0xffff, OVL_HEADER_SIZE);
  assert.deepEqual(readRewardList(ovl, vaddr, false), []);
  assert.equal(readRewardList(ovl, 0x08900000, false), null);
});

test("emitMonsters names parts and groups through overlay/monsters.json", () => {
  const task = buildGameTask();
  const sub = buildGameSub();
  const rewards = locateRewardTables(sub)!;
  const output = emitMonsters({
    chunks: readMonsterChunks(task, EU_CHUNKS),
    carves: readCarveTables(sub, rewards.carves),
    capBreak: readCapBreakTables(sub, rewards.capBreak),
  }) as Record<string, { monsters: Record<string, unknown>[] }>;

  const rathian = output["monsters/flying-wyvern.json"]!.monsters.find(
    (m) => m.name === "Rathian",
  )!;
  assert.deepEqual((rathian.hitzones as Record<string, unknown>).head, {
    cut: 80,
    bash: 70,
    shot: 60,
    fir: 0,
    wtr: 15,
    thn: 20,
    ice: 15,
    drg: 35,
    ko: 100,
  });
  const drops = rathian.drops as Record<string, Record<string, unknown[]>>;
  assert.deepEqual(drops["low rank"]!.capture![1], {
    itemId: 520,
    name: "Rathian Scale",
    chance: 52,
    amount: 2,
  });

  const giaprey = output["monsters/bird-wyvern.json"]!.monsters.find((m) => m.name === "Giaprey")!;
  const giapreyDrops = giaprey.drops as Record<string, Record<string, { chance: number }[]>>;
  assert.deepEqual(
    giapreyDrops["low-rank"]!["body carves (x1)"]!.map((e) => e.chance),
    [52, 30, 18],
  );
});
