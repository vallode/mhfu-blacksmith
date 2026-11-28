import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { decodeObjects, linkBlob } from "../src/blob/link.js";
import { HOOK, assembleHooks } from "../src/patches/game-hooks.js";
import { improvePipsObjects } from "../src/patches/improve-pips.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const SAVE = 0x09999c60;
const PAD_READ = 0x0890e120;
const CTRL = 0x09fff000;
const HUD = 0x09a04ba0;
/** EU's addresses. */
const EXTERNS = {
  rf_pip_grid: 0x09aec6a0,
  rf_pip_layouts: 0x09b0b2e0,
  rf_pip_hud: 0x089cbbec,
  rf_pip_melee: 0x0894f9c4,
  rf_pip_ranged: 0x0895778c,
  rf_pip_has: 0x09aa48f8,
  rf_pip_cost: 0x09aa65d0,
  rf_pip_afford: 0x09a800e0,
  rf_pip_listed: 0x09aa65f8,
  rf_fill: 0x0882d8dc,
};
const ZENNY = SAVE + 0x696f0;
const BOX = SAVE + 0x548;
const MELEE = 5;
const RANGED = 6;
const IMPROVE = 0x410;
/** Layout 3, the one Improve's picker draws with. */
const LAYOUT = 3;
const CELL = { x0: 244, y0: 32, w: 18, h: 18, dx: 22, dy: 20 };
const GRID_RESULT = 0x77;

/** The picker: the grid's call through hook 8, the game's checks and a box. */
function picker() {
  const blob = linkBlob(
    [...decodeObjects(RUNTIME_OBJECTS), ...improvePipsObjects()],
    BLOB,
    EXTERNS,
  );
  const cpu = new Cpu();
  cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(
    HOOKS,
    BLOB,
    [{ hook: HOOK.pad, target: PAD_READ }],
    undefined,
    undefined,
    [],
    [{ call: 0x09a8079c + 0x14, target: EXTERNS.rf_pip_grid }],
  );
  cpu.load(HOOKS, hooks.code);
  const reg = (k: number) => cpu.reg[k]! >>> 0;
  cpu.native.set(PAD_READ, () => 1);

  const grids: number[][] = [];
  const fills: { x: number; y: number; w: number; h: number; rgba: number[] }[] = [];
  cpu.native.set(EXTERNS.rf_pip_grid, () => {
    grids.push([reg(4), reg(5), reg(6), reg(7)]);
    return GRID_RESULT;
  });
  cpu.native.set(EXTERNS.rf_fill, () => {
    assert.equal(reg(4), HUD);
    const s16 = (v: number) => (v << 16) >> 16;
    fills.push({
      x: s16(reg(5)),
      y: s16(reg(6)),
      w: reg(7),
      h: reg(8),
      rgba: [reg(9), reg(10), reg(11), cpu.u32(reg(29))],
    });
    return 0;
  });
  // The pouch and box together: how many of each item.
  const items = new Map<number, number>();
  let checks = 0;
  cpu.native.set(EXTERNS.rf_pip_has, () => {
    checks++;
    return (items.get(reg(5)) ?? 0) >= (reg(6) | 0) ? 1 : 0;
  });
  cpu.native.set(EXTERNS.rf_pip_cost, () => {
    assert.ok(reg(5) === MELEE || reg(5) === RANGED);
    return 500 * (reg(5) === RANGED ? 2 : 1);
  });
  cpu.native.set(EXTERNS.rf_pip_afford, () => (cpu.u32(ZENNY) >= reg(5) ? 1 : 0));
  const listed = new Set<number>();
  cpu.native.set(EXTERNS.rf_pip_listed, () => {
    assert.equal(reg(5), RANGED);
    return listed.has(reg(6)) ? 1 : 0;
  });
  cpu.setU32(EXTERNS.rf_pip_hud, HUD);
  const l = EXTERNS.rf_pip_layouts + LAYOUT * 24;
  [CELL.x0, CELL.y0, CELL.w, CELL.h, CELL.dx, CELL.dy].forEach((v, k) => cpu.setU16(l + k * 2, v));
  cpu.setU32(ZENNY, 10000);

  /** A row of the upgrade table: what improving into `id` takes, and what `id` improves into. */
  const row = (
    table: number,
    id: number,
    o: { materials?: [number, number][]; into?: number[] },
  ) => {
    const at = table + id * 28;
    (o.materials ?? []).forEach(([item, amount], k) => {
      cpu.setU16(at + k * 4, item);
      cpu.setU16(at + k * 4 + 2, amount);
    });
    (o.into ?? []).forEach((t, k) => cpu.setU16(at + 16 + k * 2, t));
  };
  const slot = (k: number, type: number, id: number, used = true) => {
    cpu.setU8(BOX + k * 12, used ? 1 : 0);
    cpu.setU8(BOX + k * 12 + 1, type);
    cpu.setU16(BOX + k * 12 + 2, id);
  };
  cpu.call(blob.symbols.get("rf_init")!, [0, SAVE, BLOB]);

  /** The picker's draw of the grid: the cells its pips are on. */
  const draw = (cursor = 0, flags = IMPROVE) => {
    fills.length = 0;
    const v0 = cpu.call(hooks.calls[0]!, [0x09b154c0, cursor, flags, LAYOUT]) >>> 0;
    assert.equal(v0, GRID_RESULT, "the grid's result");
    const inner = fills.filter((f) => f.w === 3);
    assert.equal(fills.length, inner.length * 2, "each pip in a frame");
    return inner.map((f) => {
      const col = (f.x - CELL.x0 - 1) / CELL.dx;
      const r = (f.y - CELL.y0 - 1) / CELL.dy;
      assert.ok(
        Number.isInteger(col) && Number.isInteger(r),
        `${f.x}, ${f.y} is in a cell's corner`,
      );
      return r * 10 + col;
    });
  };
  const pad = () => cpu.call(hooks.stubs[0]!, [CTRL]);
  return { cpu, draw, pad, row, slot, items, listed, grids, fills, checks: () => checks };
}

/** A box: Bone Kris (10) into 11, which takes what's held; 12 into 13, which takes more. */
function stocked() {
  const p = picker();
  p.items.set(100, 3);
  p.items.set(101, 1);
  p.row(EXTERNS.rf_pip_melee, 10, { into: [0, 11] });
  p.row(EXTERNS.rf_pip_melee, 11, { materials: [[100, 2]] });
  p.row(EXTERNS.rf_pip_melee, 12, { into: [13] });
  p.row(EXTERNS.rf_pip_melee, 13, {
    materials: [
      [100, 1],
      [101, 2],
    ],
  });
  p.row(EXTERNS.rf_pip_ranged, 3, { into: [4] });
  p.row(EXTERNS.rf_pip_ranged, 4, { materials: [[101, 1]] });
  p.row(EXTERNS.rf_pip_ranged, 5, { into: [4] });
  p.listed.add(3);
  p.slot(0, MELEE, 10);
  p.slot(1, MELEE, 12);
  p.slot(15, RANGED, 3);
  p.slot(17, RANGED, 5); // no upgrade row of its own
  p.slot(23, 1, 10); // armor
  p.slot(24, MELEE, 10, false); // empty
  return p;
}

test("the grid is drawn as the game asked, with a pip on each weapon that can be improved", () => {
  const p = stocked();
  assert.deepEqual(p.draw(), [0, 15]);
  assert.deepEqual(p.grids, [[0x09b154c0, 0, IMPROVE, LAYOUT]]);
  const [frame, pip] = p.fills;
  assert.deepEqual(frame, { x: 244, y: 32, w: 5, h: 5, rgba: [0x10, 0x10, 0x10, 0xff] });
  assert.deepEqual(pip, { x: 245, y: 33, w: 3, h: 3, rgba: [0xff, 0x96, 0x28, 0xff] });
});

test("short of zenny, no pip", () => {
  const p = stocked();
  p.cpu.setU32(ZENNY, 999);
  assert.deepEqual(p.draw(), [0], "the bow's 1000 is too much");
  p.cpu.setU32(ZENNY, 499);
  assert.deepEqual(p.draw(), [], "the zenny changed: worked out again");
});

test("other pickers, and other lists, have no pips", () => {
  const p = stocked();
  assert.deepEqual(p.draw(0, 0x10), [], "the box, every kind");
  assert.deepEqual(p.draw(0, 0x400), [], "not the equipment box");
  assert.deepEqual(p.draw(0, IMPROVE | 0x100), []);
  assert.equal(p.grids.length, 3, "each still drawn");
});

test("pips are worked out once a page, again for a slot that changes", () => {
  const p = stocked();
  p.draw();
  const first = p.checks();
  p.pad();
  p.items.set(101, 2); // 12 into 13 now has what it takes
  assert.deepEqual(p.draw(), [0, 15], "kept while the picker shows");
  assert.equal(p.checks(), first, "nothing checked again");
  p.slot(2, MELEE, 10);
  assert.deepEqual(p.draw(), [0, 2, 15], "a slot that changed");
  // Away from the picker (pad reads without its draw), then back: all again.
  p.pad();
  p.pad();
  p.pad();
  assert.deepEqual(p.draw(), [0, 1, 2, 15]);
});

test("a later page shows its own box slots", () => {
  const p = stocked();
  p.slot(100 + 42, MELEE, 10);
  assert.deepEqual(p.draw(142), [42]);
  assert.deepEqual(p.draw(0), [0, 15]);
});
