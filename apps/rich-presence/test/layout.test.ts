import assert from "node:assert/strict";
import { test } from "node:test";
import { HUNTER_SIZE } from "blacksmith/src/lib/ppsspp-link";
import {
  QUEST_OFFSET,
  RELEASES,
  SNAPSHOT_SIZE,
  STAGE_OFFSET,
  onQuest,
  parseMapStagesEntry,
  parseQuestHeader,
  parseSnapshot,
  parseStageList,
  snapshotStart,
} from "../src/layout";
import { header, snapshot } from "./fixtures";

test("the snapshot spans the stage, the hunter block and the quest object", () => {
  assert.equal(SNAPSHOT_SIZE, 0x4a4 + 0x6bcc0 + 0x50);
  assert.ok(SNAPSHOT_SIZE > -STAGE_OFFSET + HUNTER_SIZE);
  assert.equal(snapshotStart(RELEASES.ULES01213!), 0x09999c5c);
  assert.equal(snapshotStart(RELEASES.ULJM05500!), 0x0999599c);
  // The quest object EU 0x08A62C7C points at, and JP's.
  assert.equal(RELEASES.ULES01213!.hunter + QUEST_OFFSET, 0x09a05dc0);
  assert.equal(RELEASES.ULJM05500!.hunter + QUEST_OFFSET, 0x09a01b00);
});

test("a town snapshot: the stage, the hunter's name and weapon, no quest", () => {
  const s = parseSnapshot(snapshot());
  assert.equal(s.stage, 139);
  assert.deepEqual(s.hunter, { name: "Nito", weapon: { table: 5, id: 465 } });
  assert.equal(onQuest(s.quest), false);
});

test("a gunner's weapon is in the ranged table; an empty slot is no weapon", () => {
  assert.deepEqual(parseSnapshot(snapshot({ weapon: [1, 6, 3, 0] })).hunter?.weapon, {
    table: 6,
    id: 3,
  });
  assert.equal(parseSnapshot(snapshot({ weapon: [0, 0, 0, 0] })).hunter?.weapon, null);
  assert.equal(parseSnapshot(snapshot({ weapon: [1, 2, 9, 0] })).hunter?.weapon, null);
});

test("no hunter on the title screen", () => {
  assert.equal(parseSnapshot(snapshot({ hunter: false })).hunter, null);
});

test("on a quest the quest object points at the quest file", () => {
  const s = parseSnapshot(
    snapshot({ stage: 36, quest: { state: 0, timeLeft: 84242, file: 0x08a5c440 } }),
  );
  assert.deepEqual(s.quest, { state: 0, timeLeft: 84242, file: 0x08a5c440 });
  assert.equal(onQuest(s.quest), true);
});

test("the quest header: ID, stars, map, time limit and target", () => {
  assert.deepEqual(parseQuestHeader(header()), {
    id: 10217,
    stars: 3,
    map: 2,
    timeLimit: 90000,
    target: 6,
    delivery: false,
  });
});

test("deliveries and quests without a count have no target monster", () => {
  const delivery = parseQuestHeader(header({ type: 0x04084002, target: 304 }));
  assert.equal(delivery?.target, null);
  assert.equal(delivery?.delivery, true);
  assert.equal(parseQuestHeader(header({ count: 0 }))?.target, null);
});

test("bytes without the quest magic aren't a quest", () => {
  const bytes = header();
  bytes[4] = 0;
  assert.equal(parseQuestHeader(bytes), null);
});

test("a map's stage list", () => {
  const entry = new Uint8Array(8);
  new DataView(entry.buffer).setUint32(0, 3, true);
  new DataView(entry.buffer).setUint32(4, 0x09ce5000, true);
  assert.deepEqual(parseMapStagesEntry(entry), { count: 3, list: 0x09ce5000 });
  assert.equal(parseMapStagesEntry(new Uint8Array(8)), null);
  const list = new Uint8Array([21, 0, 39, 0, 38, 0]);
  assert.deepEqual(parseStageList(list, 3), [21, 39, 38]);
});
