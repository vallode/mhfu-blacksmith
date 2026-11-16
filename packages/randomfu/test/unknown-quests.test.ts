import assert from "node:assert/strict";
import { test } from "node:test";
import type { RewardTable } from "mhfu-extract/src/quests/parser.js";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { decodeObjects, linkBlob } from "../src/blob/link.js";
import { addBoardRecord } from "../src/game/board-add.js";
import { readBoardRecords } from "../src/game/board.js";
import type { LoadedQuest } from "../src/game/load.js";
import { enumMonsterNames as monsterName } from "../src/names.js";
import { HOOK, assembleHooks } from "../src/patches/game-hooks.js";
import {
  UNKNOWN_SLOTS,
  encodeTables,
  listIndex,
  rewardBytes,
  textBytes,
  unknownQuestsObjects,
  type SlotTables,
} from "../src/patches/unknown-quests.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const LOADER = 0x08870aec;
const HUD_UPDATE = 0x0883f270;
const GAUGES = 0x088405e4;
const TIMER = 0x08960000;
const LIST_TABLE = 0x089b1e64;
const BOARD_LIST = 0x089b2000;
const DEFAULT_BUF = 0x08a5c440;
const LOBBY_BUF = 0x09b00000;
const QUEST = 0x09a40000;

const SLOT = UNKNOWN_SLOTS[0]!;
const TEMPLATE_ID = 1101;
const OTHER_ID = 1102;
const OLD_EM = 7;
const SPECIES = [11, 12];

/** A quest file: one large monster, a hunt that's also urgent, a reward table. */
function questFile(em: number): Buffer {
  const q = Buffer.alloc(0x400, 0);
  q.writeUInt32LE(0x300, 12); // rewards
  q.writeUInt32LE(1, 0x28); // objective A: a monster
  q.writeUInt16LE(em, 0x2c);
  q.writeUInt32LE(100, 0x38); // size
  q.writeUInt8(2, 0x4a); // crowns
  q.writeUInt32LE((1 << 2) | (1 << 25), 76); // hunting, urgent
  q.writeUInt32LE(500, 80);
  q.writeUInt32LE(3000, 84);
  q.writeUInt32LE(1000, 88);
  q.writeUInt16LE(TEMPLATE_ID, 100);
  q.writeUInt8(5, 102);
  q.writeUInt16LE(em, 112);
  q.writeUInt16LE(em, 0x200); // the large monster's record
  q.writeUInt8(1, 0x204);
  q.writeUInt8(9, 0x205); // its level
  q.writeUInt16LE(em, 0x240); // the preload list
  return q;
}

const table = (kind: number, items: [number, number, number][]): RewardTable => ({
  unkn1: kind,
  unkn2: 1,
  itemsPtr: 0,
  items: items.map(([chance, itemId, amount]) => ({ chance, itemId, amount })),
});

function tables(): SlotTables[] {
  const payload = questFile(OLD_EM);
  return [
    {
      slot: SLOT,
      templates: [
        {
          template: {
            quest: { parsed: { header: { questId: TEMPLATE_ID } } } as unknown as LoadedQuest,
            payload,
            map: 2,
            species: OLD_EM,
            speciesAt: [0x200, 0x240],
            levelAt: [0x205],
          },
          choices: SPECIES.map((species) => ({
            species,
            level: [20, 24] as [number, number],
            rewards: [
              [
                table(0x8000, [
                  [60, 100 + species, 1],
                  [40, 200, 2],
                ]),
                table(0x8001, [[100, 300, 1]]),
              ],
            ],
          })),
        },
      ],
      fee: 700,
      reward: 5400,
      penalty: 1800,
      size: [90, 110],
      crowns: 4,
    },
  ];
}

/** The blob, the hooks and a fake quest loader in a CPU. */
function game() {
  const blob = linkBlob(
    [...decodeObjects(RUNTIME_OBJECTS), ...unknownQuestsObjects()],
    BLOB,
    {
      rf_uq_lists: LIST_TABLE,
      rf_uq_default_buf: DEFAULT_BUF,
      sceKernelGetSystemTimeLow: TIMER,
    },
    Infinity,
    { rf_uq_data: encodeTables(tables(), [BOARD_LIST], monsterName) },
  );
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(
    HOOKS,
    BLOB,
    [
      { hook: HOOK.questFrame, target: HUD_UPDATE },
      { hook: HOOK.hud, target: GAUGES },
    ],
    LOADER,
  );
  cpu.load(HOOKS, hooks.code);

  // The board: the slot's list, and every other one pointing somewhere else.
  for (let k = 0; k < 33; k++) cpu.setU32(LIST_TABLE + k * 4, BOARD_LIST + 0x100);
  cpu.setU32(LIST_TABLE + listIndex(SLOT) * 4, BOARD_LIST);
  [1001, 1002, 1003].forEach((id, k) => cpu.setU16(BOARD_LIST + k * 2, id));

  let time = 12345;
  cpu.native.set(TIMER, () => time);
  // The loader: step 0 starts a read unless the file is loaded, step 1 decrypts it.
  const files = new Map([
    [TEMPLATE_ID, questFile(OLD_EM)],
    [OTHER_ID, questFile(OLD_EM)],
  ]);
  const loads: number[] = [];
  cpu.native.set(LOADER, () => {
    const [quest, id, buf] = [4, 5, 6].map((r) => cpu.reg[r]! >>> 0) as [number, number, number];
    if (cpu.u8(quest + 0x716) === 0) {
      loads.push(id & 0xffff);
      if (cpu.u16(quest + 0x714) === (id & 0xffff)) return 1;
      cpu.setU8(quest + 0x716, 1);
      return 0;
    }
    cpu.write(buf || DEFAULT_BUF, files.get(id & 0xffff) ?? Buffer.alloc(0x400));
    cpu.setU16(quest + 0x714, id & 0xffff);
    cpu.setU8(quest + 0x716, 0);
    return 1;
  });

  cpu.call(blob.symbols.get("rf_init")!, [0, 0x09999c60, BLOB]);
  /** Runs a load to the end, as the caller does every frame; returns the frames' results. */
  const load = (entry: "accept" | "depart", id: number, buf: number) => {
    const results: number[] = [];
    do results.push(cpu.call(hooks.questLoad![entry], [QUEST, id, buf]));
    while (results.at(-1) !== 1 && results.length < 5);
    return results;
  };
  return { cpu, load, loads, setTime: (t: number) => (time = t) };
}

/** A decrypted quest's text: its first language's six strings. */
function text(cpu: Cpu, quest: number): string[] {
  const block = cpu.u32(quest + cpu.u32(quest + 96));
  return Array.from({ length: 6 }, (_, k) => cpu.string(quest + cpu.u32(quest + block + k * 4)));
}

test("the quest goes on its board's list, after the others", () => {
  const { cpu } = game();
  const list = cpu.u32(LIST_TABLE + listIndex(SLOT) * 4);
  assert.notEqual(list, BOARD_LIST, "the list is a copy");
  assert.deepEqual(
    [0, 1, 2, 3, 4].map((k) => cpu.u16(list + k * 2)),
    [1001, 1002, 1003, SLOT.id, 0],
  );
  assert.equal(cpu.u32(LIST_TABLE + 0), BOARD_LIST + 0x100, "other lists are left alone");
});

test("accepting loads a template and rewrites it as the rolled quest", () => {
  const { cpu, load, loads } = game();
  cpu.setU16(QUEST + 0x714, TEMPLATE_ID); // the template is already in the buffer
  assert.deepEqual(load("accept", SLOT.id, LOBBY_BUF), [0, 1]);
  assert.deepEqual(loads, [TEMPLATE_ID], "the template's file is read again");

  const q = LOBBY_BUF;
  const em = cpu.u16(q + 0x200);
  assert.ok(SPECIES.includes(em));
  assert.equal(cpu.u16(q + 0x240), em);
  assert.equal(cpu.u16(q + 112), em);
  assert.equal(cpu.u16(q + 0x2c), em);
  assert.ok(cpu.u8(q + 0x205) >= 20 && cpu.u8(q + 0x205) <= 24);
  assert.ok(cpu.u8(q + 0x38) >= 90 && cpu.u8(q + 0x38) <= 110);
  assert.ok(cpu.u8(q + 0x4a) <= 4);
  assert.equal(cpu.u16(q + 100), SLOT.id);
  assert.equal(cpu.u8(q + 102), SLOT.stars);
  assert.equal(cpu.u32(q + 76), 1 << 2, "no longer urgent");
  assert.deepEqual(
    [80, 84, 88].map((k) => cpu.u32(q + k)),
    [700, 5400, 1800],
  );

  // The rewards: after the quest, in the file's layout.
  const rewards = cpu.u32(q + 12);
  assert.equal(rewards, 0x400);
  assert.deepEqual([cpu.u16(q + rewards), cpu.u16(q + rewards + 2)], [0x8000, 1]);
  assert.deepEqual([cpu.u16(q + rewards + 8), cpu.u16(q + rewards + 16)], [0x8001, 0xffff]);
  const items = (at: number) => {
    const out: number[][] = [];
    for (let p = q + at; cpu.u16(p) !== 0xffff; p += 6) {
      out.push([cpu.u16(p), cpu.u16(p + 2), cpu.u16(p + 4)]);
    }
    return out;
  };
  assert.deepEqual(items(cpu.u32(q + rewards + 4)), [
    [60, 100 + em, 1],
    [40, 200, 2],
  ]);
  assert.deepEqual(items(cpu.u32(q + rewards + 12)), [[100, 300, 1]]);

  // In town, the quest doesn't name the monster yet.
  assert.deepEqual(text(cpu, q), [
    "Unknown Monster?!",
    "Hunt the ???",
    "Reward Zero\nTime Over",
    "Hunters keep reporting a\nmonster no one can name.\nFind out what it is and\n" +
      "hunt it down. It's never\nthe same twice, so come\nprepared for anything!",
    "???",
    "Guild Researcher",
  ]);
  const langs = cpu.u32(q + 96);
  for (let k = 1; k < 7; k++) assert.equal(cpu.u32(q + langs + k * 4), cpu.u32(q + langs));

  // The room the tables are checked against is what the blob writes.
  const set = tables()[0]!.templates[0]!.choices.find((c) => c.species === em)!.rewards[0]!;
  assert.equal(langs + 7 * 4, 0x400 + rewardBytes(set) + textBytes("???"));
});

test("departing loads the same roll again, and names the monster", () => {
  const { cpu, load, loads, setTime } = game();
  load("accept", SLOT.id, LOBBY_BUF);
  // All but the text, which names the monster now (so its pointer moves).
  const quest = (at: number) => cpu.bytes(at, 0x400).fill(0, 96, 100);
  const accepted = quest(LOBBY_BUF);
  setTime(999_999);
  assert.deepEqual(load("depart", SLOT.id, 0), [0, 1]);
  assert.deepEqual(loads, [TEMPLATE_ID, TEMPLATE_ID]);
  assert.deepEqual(quest(DEFAULT_BUF), accepted, "the same quest");
  const name = monsterName(cpu.u16(DEFAULT_BUF + 0x200));
  const strings = text(cpu, DEFAULT_BUF);
  assert.equal(strings[1], `Hunt the ${name}`);
  assert.equal(strings[4], name);
});

test("accepting again rolls again", () => {
  const { cpu, load, setTime } = game();
  const rolled = new Set<string>();
  for (let t = 1; t < 40; t++) {
    setTime(t * 7919);
    load("accept", SLOT.id, LOBBY_BUF);
    rolled.add(`${cpu.u16(LOBBY_BUF + 0x200)}:${cpu.u8(LOBBY_BUF + 0x205)}`);
  }
  assert.ok(rolled.size > 4, `${rolled.size} different rolls`);
});

test("other quests load as they are", () => {
  const { cpu, load, loads } = game();
  assert.deepEqual(load("accept", OTHER_ID, LOBBY_BUF), [0, 1]);
  assert.deepEqual(loads, [OTHER_ID]);
  assert.deepEqual(cpu.bytes(LOBBY_BUF, 0x400), questFile(OLD_EM));
});

/** A board file: records with header, strings, `StringPTRs` and `LangPTRs`, then padding. */
function boardFile(records: { id: number; strings: string[] }[], padding: number): Buffer {
  const parts: Buffer[] = [];
  let at = (records.length + 1) * 4;
  const tableBytes = Buffer.alloc(at);
  parts.push(tableBytes);
  records.forEach((r, k) => {
    tableBytes.writeUInt32LE(at, k * 4);
    const header = Buffer.alloc(0x34);
    header.writeUInt16LE(r.id, 0x18);
    const strings = r.strings.map((s) => {
      const b = Buffer.alloc((s.length + 4) & ~3);
      b.write(s, "utf8");
      return b;
    });
    let p = at + 0x34;
    const pointers = strings.map((s) => ((p += s.length), p - s.length));
    const block = p;
    const lang = block + 24;
    header.writeUInt32LE(lang, 0x14);
    const ptrs = Buffer.alloc(24 + 28);
    pointers.forEach((v, n) => ptrs.writeUInt32LE(v, n * 4));
    for (let n = 0; n < 7; n++) ptrs.writeUInt32LE(block, 24 + n * 4);
    parts.push(header, ...strings, ptrs);
    at = lang + 28;
  });
  parts.push(Buffer.alloc(padding, 0x5a));
  return Buffer.concat(parts);
}

function recordText(file: Buffer, offset: number): string[] {
  const block = file.readUInt32LE(file.readUInt32LE(offset + 0x14));
  return Array.from({ length: 6 }, (_, k) => {
    const at = file.readUInt32LE(block + k * 4);
    return file.toString("utf8", at, file.indexOf(0, at));
  });
}

test("a board record is added in the file's padding, the others moved but unchanged", () => {
  const old = [
    { id: 1001, strings: ["One", "Hunt one", "Fail", "Details", "Mon", "Client"] },
    { id: 1002, strings: ["Two", "Hunt two", "Fail", "More details", "Mon", "Client"] },
  ];
  const file = boardFile(old, 400);
  const header = Buffer.alloc(0x34);
  header.writeUInt16LE(SLOT.id, 0x18);
  const strings = ["Unknown Monster?!", "Hunt the ???", "Fail", "Details", "???", "Client"];
  const out = addBoardRecord(file, { header, strings });
  assert.ok(Buffer.isBuffer(out), String(out));
  assert.equal(out.length, file.length);
  const records = readBoardRecords(out)!;
  assert.deepEqual(
    records.map((r) => r.questId),
    [1001, 1002, SLOT.id],
  );
  assert.deepEqual(
    records.map((r) => recordText(out, r.offset)),
    [...old.map((r) => r.strings), strings],
  );
  assert.equal(
    addBoardRecord(boardFile(old, 8), { header, strings }).toString().slice(0, 6),
    "no roo",
  );
});

test("a board file without room is laid out again, each string stored once", () => {
  const repeated = [
    "Same title",
    "Hunt the same",
    "Reward Zero\nTime Over",
    "Long details",
    "Mon",
    "Client",
  ];
  const old = Array.from({ length: 6 }, (_, k) => ({ id: 1001 + k, strings: repeated }));
  const file = boardFile(old, 16);
  const header = Buffer.alloc(0x34);
  header.writeUInt16LE(SLOT.id, 0x18);
  const strings = [
    "Unknown Monster?!",
    "Hunt the ???",
    "Reward Zero\nTime Over",
    "Details",
    "???",
    "Client",
  ];
  const out = addBoardRecord(file, { header, strings });
  assert.ok(Buffer.isBuffer(out), String(out));
  assert.equal(out.length, file.length);
  assert.deepEqual(out.subarray(-16), file.subarray(-16), "the padding is kept");
  const records = readBoardRecords(out)!;
  assert.deepEqual(
    records.map((r) => recordText(out, r.offset)),
    [...old.map((r) => r.strings), strings],
  );
});
