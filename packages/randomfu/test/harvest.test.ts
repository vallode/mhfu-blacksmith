import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { decodeObjects, linkBlob } from "../src/blob/link.js";
import { FIRST_CALL_SITE, HOOK, assembleHooks } from "../src/patches/game-hooks.js";
import { harvestObjects } from "../src/patches/harvest.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const SAVE = 0x09999c60;
const PAD_READ = 0x0890e120;
const HUD = 0x09a04ba0;
const SOUNDS = 0x09a10000;
const HUNTER = 0x09b00000;
/** EU's addresses (src/patches/harvest.ts on the EU disc). */
const EXTERNS = {
  rf_add_to_box: 0x08853abc,
  rf_item_seen: 0x08858f1c,
  rf_can_store: 0x0885c498,
  rf_can_store_object: 0x08a62c50,
  rf_farm: 0x6a238,
  rf_farm_frame: 0x08864348,
  rf_farm_site: FIRST_CALL_SITE,
  rf_log_item: 0x08830728,
  rf_log_text: 0x088307bc,
  rf_log_object: 0x089cbbec,
  rf_item_sound: 0x088860a0,
  rf_item_sound_object: 0x08a62d90,
};
const FARM = SAVE + EXTERNS.rf_farm;
/** The five actions' frame() calls, mining to field (EU). */
const CALLS = [0x09ab2384, 0x09ab2504, 0x09ab2674, 0x09ab29d8, 0x09ab3030];
const NO_SCREEN = 0x1d7;

function farm(boxRoom = Infinity) {
  const blob = linkBlob([...decodeObjects(RUNTIME_OBJECTS), ...harvestObjects()], BLOB, EXTERNS);
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(
    HOOKS,
    BLOB,
    [{ hook: HOOK.pad, target: PAD_READ }],
    undefined,
    undefined,
    [],
    CALLS.map((call) => ({ call, target: EXTERNS.rf_farm_frame })),
  );
  cpu.load(HOOKS, hooks.code);
  const reg = (k: number) => cpu.reg[k]! >>> 0;
  cpu.setU32(EXTERNS.rf_log_object, HUD);
  cpu.setU32(EXTERNS.rf_item_sound_object, SOUNDS);
  cpu.setU32(EXTERNS.rf_can_store_object, 0x08a70000);

  let reached = 1;
  const frames: number[][] = [];
  cpu.native.set(EXTERNS.rf_farm_frame, () => {
    frames.push([reg(4), reg(5)]);
    return reached;
  });
  const box = new Map<number, number>();
  let room = boxRoom;
  cpu.native.set(EXTERNS.rf_can_store, () => (reg(5) === 999 ? 0 : 1));
  cpu.native.set(EXTERNS.rf_add_to_box, () => {
    assert.equal(reg(4), SAVE);
    assert.equal(reg(7), 0xffff);
    const fits = Math.min(reg(6), room);
    room -= fits;
    box.set(reg(5), (box.get(reg(5)) ?? 0) + fits);
    return reg(6) - fits;
  });
  const seen: number[] = [];
  cpu.native.set(EXTERNS.rf_item_seen, () => (seen.push(reg(5)), 0));
  const log: (string | number)[] = [];
  cpu.native.set(EXTERNS.rf_log_item, () => {
    assert.deepEqual([reg(4), reg(5), reg(6)], [HUD, 1, 0]);
    log.push(reg(7));
    return 0;
  });
  cpu.native.set(EXTERNS.rf_log_text, () => {
    assert.equal(reg(4), HUD);
    log.push(cpu.string(reg(5)));
    return 0;
  });
  const sounds: number[] = [];
  cpu.native.set(EXTERNS.rf_item_sound, () => {
    assert.equal(reg(4), SOUNDS);
    sounds.push(reg(5));
    return 0;
  });
  cpu.call(blob.symbols.get("rf_init")!, [0, SAVE, BLOB]);

  /** The action of `kind` asking whether its motion reached the frame. */
  const gather = (kind: number) => cpu.call(hooks.calls[kind]!, [HUNTER + 0x80, 0]) | 0;
  const levels = (
    field: number,
    mining: number,
    insects: number,
    mushroom: number,
    honey: number,
  ) => {
    cpu.setU8(FARM, field);
    cpu.setU8(FARM + 2, mining);
    cpu.setU8(FARM + 3, insects);
    cpu.setU8(FARM + 4, mushroom);
    cpu.setU8(FARM + 5, honey);
  };
  const list = (at: number, items: number[]) =>
    items.forEach((it, k) => cpu.setU16(at + k * 2, it));
  const read = (at: number, n: number) => Array.from({ length: n }, (_, k) => cpu.u16(at + k * 2));
  const plot = (k: number, items: [number, number][]) =>
    items.forEach(([it, n], j) => {
      cpu.setU16(FARM + 0xb4 + k * 40 + j * 2, it);
      cpu.setU8(FARM + 0xcc + k * 40 + j, n);
    });
  return {
    cpu,
    gather,
    levels,
    list,
    read,
    plot,
    box,
    seen,
    log,
    sounds,
    frames,
    reach: (v: number) => (reached = v),
  };
}

test("one gather sends every spot the farm has to the Item Box", () => {
  const f = farm();
  f.levels(1, 1, 0, 2, 1);
  f.list(FARM + 0x08, [100, 100, 101, 0]); // mining point 0
  f.list(FARM + 0x10, [102, 0, 0, 0]); // mining point 1
  f.list(FARM + 0x18, [103, 103, 103, 103]); // mining point 2: not built
  f.list(FARM + 0x30, [110, 111, 0, 0]); // insect thicket 0
  f.list(FARM + 0x38, [112, 0, 0, 0]); // thicket 1: not built
  f.list(FARM + 0x58, [120, 120, 0, 0, 0, 0, 0, 0]); // tree level 1: not this one
  f.list(FARM + 0x68, [121, 121, 122, 0, 0, 0, 0, 0]); // tree level 2
  f.list(FARM + 0x88, [130, 130, 0, 0, 0, 0]); // hive level 1
  f.plot(0, [
    [140, 3],
    [141, 1],
  ]);
  f.plot(1, [[142, 2]]);
  f.plot(2, [[143, 5]]); // plot 2: not dug
  assert.equal(f.gather(0), 0, "the game gathers nothing itself");
  assert.deepEqual(f.frames, [[HUNTER + 0x80, 0]], "the game's frame() asked as it was");
  assert.deepEqual(Object.fromEntries(f.box), {
    100: 2,
    101: 1,
    102: 1,
    110: 1,
    111: 1,
    121: 2,
    122: 1,
    130: 2,
    140: 3,
    141: 1,
    142: 2,
  });
  assert.deepEqual(f.read(FARM + 0x08, 8), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(f.read(FARM + 0x18, 4), [103, 103, 103, 103], "what isn't built stays");
  assert.deepEqual(f.read(FARM + 0x38, 1), [112]);
  assert.deepEqual(f.read(FARM + 0x58, 2), [120, 120]);
  assert.equal(f.cpu.u16(FARM + 0xb4 + 80), 143);
  assert.deepEqual(f.read(FARM + 0xb4, 2), [0, 0]);
  assert.equal(f.cpu.u8(FARM + 0xcc), 0);
  assert.deepEqual(f.log, [
    140,
    141,
    142,
    100,
    101,
    102,
    110,
    111,
    121,
    122,
    130,
    "Sent 17 items to the Item Box.",
  ]);
  assert.deepEqual(f.sounds, [140]);
  assert.equal(f.seen.length, 14, "after each send, as the game");
  assert.equal(f.cpu.u8(HUNTER + NO_SCREEN), 0, "a Mining Point has no screen to keep shut");
});

test("at a spot with a screen, it stays shut", () => {
  for (const kind of [2, 3, 4]) {
    const f = farm();
    f.levels(0, 0, 0, 1, 0);
    f.list(FARM + 0x58, [120]);
    assert.equal(f.gather(kind), 0);
    assert.equal(f.cpu.u8(HUNTER + NO_SCREEN), 1);
  }
});

test("before the frame, an empty farm, or a full box: the game's own gather", () => {
  const f = farm();
  f.levels(0, 0, 0, 0, 0);
  f.reach(0);
  f.list(FARM + 0x08, [100]);
  assert.equal(f.gather(0), 0);
  assert.equal(f.box.size, 0, "not before the frame");
  f.reach(1);
  f.list(FARM + 0x08, [0]);
  assert.equal(f.gather(0), 1, "nothing on the farm");
  assert.deepEqual(f.log, []);

  const full = farm(0);
  full.levels(0, 0, 0, 0, 0);
  full.list(FARM + 0x08, [100, 101]);
  assert.equal(full.gather(0), 1, "nothing fits");
  assert.deepEqual(full.read(FARM + 0x08, 2), [100, 101], "and nothing taken");
  assert.equal(full.cpu.u8(HUNTER + NO_SCREEN), 0);
});

test("what doesn't fit stays at the front of its spot", () => {
  const f = farm(3);
  f.levels(0, 0, 0, 0, 0);
  f.list(FARM + 0x08, [100, 999, 101, 102]);
  f.plot(0, [[140, 4]]);
  assert.equal(f.gather(0), 0);
  // The plot first: 3 of its 4 fit, then nothing.
  assert.deepEqual(Object.fromEntries(f.box), { 140: 3, 100: 0, 101: 0, 102: 0 });
  assert.equal(f.cpu.u16(FARM + 0xb4), 140);
  assert.equal(f.cpu.u8(FARM + 0xcc), 1);
  assert.deepEqual(f.read(FARM + 0x08, 4), [100, 999, 101, 102], "999 the box never takes");
  assert.deepEqual(f.log, [140, "Sent 3 items. Item Box full."]);
});
