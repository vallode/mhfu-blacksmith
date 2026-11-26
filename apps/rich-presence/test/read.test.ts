import assert from "node:assert/strict";
import { test } from "node:test";
import type { PpssppDebugger } from "blacksmith/src/lib/ppsspp-link";
import { RELEASES, mapStagesEntry, snapshotStart } from "../src/layout";
import { mapTexture, readGame } from "../src/read";
import { header, snapshot } from "./fixtures";

/**
 * A debugger over a few blocks of memory, logging every call: reads must
 * all land between `cpu.stepping` and `cpu.resume`.
 */
function fakeDebugger(game: { id: string; title: string } | null, blocks: [number, Uint8Array][]) {
  const calls: string[] = [];
  const dbg = {
    call: async (event: string) => {
      calls.push(event);
      return event === "game.status" ? { game } : { stepping: false, paused: false };
    },
    broadcast: async (event: string) => {
      calls.push(event);
      return { event };
    },
    read: async (address: number, size: number) => {
      calls.push("read");
      for (const [at, bytes] of blocks) {
        if (address >= at && address + size <= at + bytes.length) {
          return bytes.slice(address - at, address - at + size);
        }
      }
      throw new Error(`nothing at ${address.toString(16)}`);
    },
  };
  return { dbg: dbg as unknown as PpssppDebugger, calls };
}

const EU = RELEASES.ULES01213!;
const QUEST_FILE = 0x08a5c440;
const STAGE_LIST = 0x09ce6000;

/** Map 11 (Snowy Mountains) and its stage list, as game_sub has them. */
function snowyStages(): [number, Uint8Array][] {
  const entry = new Uint8Array(8);
  new DataView(entry.buffer).setUint32(0, 10, true);
  new DataView(entry.buffer).setUint32(4, STAGE_LIST, true);
  const list = new Uint8Array(new Uint16Array([98, 92, 93, 94, 95, 96, 97, 99, 100, 6]).buffer);
  return [
    [mapStagesEntry(EU, 11), entry],
    [STAGE_LIST, list],
  ];
}

test("in town: one read, inside a pause", async () => {
  const { dbg, calls } = fakeDebugger({ id: "ULES01213", title: "MHFU" }, [
    [snapshotStart(EU), snapshot({ stage: 85 })],
  ]);
  const state = await readGame(dbg);
  assert.deepEqual(state, {
    kind: "town",
    gameId: "ULES01213",
    hunter: { name: "Nito", weapon: { table: 5, id: 465 } },
    stage: 85,
  });
  assert.deepEqual(calls, ["game.status", "cpu.status", "cpu.stepping", "read", "cpu.resume"]);
});

test("on a quest: the header and the area number the map prints", async () => {
  const { dbg, calls } = fakeDebugger({ id: "ULES01213", title: "MHFU" }, [
    [
      snapshotStart(EU),
      snapshot({ stage: 99, quest: { state: 0, timeLeft: 89000, file: QUEST_FILE } }),
    ],
    [QUEST_FILE, header({ id: 10203, map: 11, target: 15 })],
    ...snowyStages(),
  ]);
  const state = await readGame(dbg);
  assert.equal(state.kind, "quest");
  if (state.kind !== "quest") return;
  assert.deepEqual(state.quest, {
    id: 10203,
    stars: 3,
    map: 11,
    timeLimit: 90000,
    target: 15,
    delivery: false,
  });
  assert.equal(state.timeLeft, 89000);
  // Stage 99 is 7th in Snowy Mountains' list, and the map prints it as area 1 (seen in game).
  assert.equal(state.area, 1);
  assert.equal(calls.filter((c) => c === "read").length, 4);
  assert.equal(calls.at(-1), "cpu.resume");
});

test("night maps number their areas on the day map's art", async () => {
  assert.equal(mapTexture(21), "map11");
  assert.equal(mapTexture(6), "map6");
});

test("a stage the map doesn't list has no area", async () => {
  const { dbg } = fakeDebugger({ id: "ULES01213", title: "MHFU" }, [
    [snapshotStart(EU), snapshot({ stage: 7, quest: { state: 0, timeLeft: 1, file: QUEST_FILE } })],
    [QUEST_FILE, header({ map: 11 })],
    ...snowyStages(),
  ]);
  const state = await readGame(dbg);
  assert.equal(state.kind === "quest" && state.area, null);
});

test("no game, another game, an unknown MHFU release, and the menus", async () => {
  assert.deepEqual(await readGame(fakeDebugger(null, []).dbg), { kind: "noGame" });
  assert.deepEqual(await readGame(fakeDebugger({ id: "UCUS98700", title: "Other" }, []).dbg), {
    kind: "otherGame",
    gameId: "UCUS98700",
    title: "Other",
  });
  assert.deepEqual(
    await readGame(
      fakeDebugger({ id: "NPJH50000", title: "Monster Hunter Portable 2nd G" }, []).dbg,
    ),
    { kind: "unsupported", gameId: "NPJH50000" },
  );
  const { dbg } = fakeDebugger({ id: "ULJM05500", title: "MHP2G" }, [
    [snapshotStart(RELEASES.ULJM05500!), snapshot({ hunter: false })],
  ]);
  assert.deepEqual(await readGame(dbg), { kind: "menus", gameId: "ULJM05500" });
});
