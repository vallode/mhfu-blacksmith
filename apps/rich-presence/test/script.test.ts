import assert from "node:assert/strict";
import { test } from "node:test";
import { LuaFactory } from "wasmoon";
import type { Catalog } from "../src/names";
import { buildScript } from "../src/plugin";
import { GAME_IMAGE, SITE } from "../src/presence";

// presence.lua run in Lua 5.4 against a fake PSP memory, with PPSSPP's plugin API stubbed.

const MAIN = 0x08804000; // The EBOOT's module: 0x08804000 for 0x1561480 bytes.
const MAIN_SIZE = 0x1561480;

/** The part of PPSSPP's mem API the script uses: references into the main module. */
const FAKE_MEM = `
local r8, r16, r32 = fake_r8, fake_r16, fake_r32
local BASE, SIZE = ${MAIN}, ${MAIN_SIZE}
local Ref = {}
Ref.__index = Ref
local function ref(offset) return setmetatable({ offset = offset }, Ref) end
Ref.__add = function(a, n) return ref(a.offset + n) end
local function read(fn, n)
  return function(self, delta)
    local o = self.offset + (delta or 0)
    if o >= 0 and o + n <= SIZE then return fn(BASE + o) end
  end
end
Ref.read_u8, Ref.read_u16, Ref.read_u32 = read(r8, 1), read(r16, 2), read(r32, 4)
function Ref:follow_pointer(delta)
  local p = self:read_u32(delta)
  if p ~= nil and p >= BASE and p < BASE + SIZE then return ref(p - BASE) end
end
mem = { main = function() return { at = function(_, offset) return ref(offset) end } end }
`;

const catalog: Catalog = {
  ids: { quests: [3201], monsters: [70], weapons: [{ table: 5, id: 1 }], maps: [6] },
  quest: () => ({ title: "Tigrex Tamer", hub: "guild", rank: "g-rank" }),
  monster: () => ({ name: "Tigrex", slug: "tigrex" }),
  weapon: () => ({ name: "Buster Sword", type: "great-sword", rarity: 7 }),
  map: () => "Jungle (Day)",
};

const BLOCK = 0x0999a100; // EU
const MAP_STAGES = 0x09ce4708;
const FILE = 0x08a5c440;
const LIST = 0x09d00000;

class Memory {
  bytes = new Map<number, number>();
  w8(a: number, v: number) {
    this.bytes.set(a, v & 0xff);
  }
  w16(a: number, v: number) {
    this.w8(a, v);
    this.w8(a + 1, v >> 8);
  }
  w32(a: number, v: number) {
    this.w16(a, v & 0xffff);
    this.w16(a + 2, v >>> 16);
  }
  r8 = (a: number) => (a >= 0x08000000 && a < 0x0a000000 ? (this.bytes.get(a) ?? 0) : undefined);
  r16 = (a: number) =>
    this.r8(a) === undefined ? undefined : this.r8(a)! | (this.r8(a + 1)! << 8);
  r32 = (a: number) =>
    this.r16(a) === undefined ? undefined : (this.r16(a)! | (this.r16(a + 2)! << 16)) >>> 0;
}

/** A hunter named Rin with the Buster Sword, standing on `stage`. */
function hunter(stage: number): Memory {
  const m = new Memory();
  [..."Rin"].forEach((c, i) => m.w16(BLOCK + i * 2, c.charCodeAt(0)));
  m.w8(BLOCK + 0x12, 1);
  m.w8(BLOCK + 0x13, 0);
  m.w8(BLOCK + 0x20, 1);
  m.w8(BLOCK + 0x21, 5);
  m.w16(BLOCK + 0x22, 1);
  m.w16(BLOCK - 0x4a4, stage);
  return m;
}

/** On quest 3201 (★11 on the G-rank board, the Jungle, target Tigrex), 65 s in. */
function onQuest(stage: number, type = 1): Memory {
  const m = hunter(stage);
  m.w32(BLOCK + 0x6bcc0 + 0x4c, FILE);
  m.w32(BLOCK + 0x6bcc0 + 0x10, 90000 - 65 * 30);
  m.w32(FILE, 0x4c);
  m.w32(FILE + 4, 0x47444e32);
  m.w32(FILE + 0x4c, type);
  m.w32(FILE + 0x5c, 90000);
  m.w16(FILE + 0x64, 3201);
  m.w8(FILE + 0x66, 11);
  m.w8(FILE + 0x68, 6);
  m.w16(FILE + 0x70, 70);
  m.w16(FILE + 0x72, 1);
  m.w32(MAP_STAGES + 6 * 8, 7);
  m.w32(MAP_STAGES + 6 * 8 + 4, LIST);
  [10, 11, 12, 13, 14, 15, 16].forEach((s, i) => m.w16(LIST + i * 2, s));
  return m;
}

/** What one tick of the script sends with presence.set. */
async function tick(memory: Memory, gameId = "ULES01213"): Promise<Record<string, unknown>[]> {
  const lua = await new LuaFactory().createEngine();
  const sent: Record<string, unknown>[] = [];
  const timers: (() => void)[] = [];
  try {
    lua.global.set("fake_r8", memory.r8);
    lua.global.set("fake_r16", memory.r16);
    lua.global.set("fake_r32", memory.r32);
    lua.global.set("game", { ID: gameId, TITLE: "MHFU" });
    lua.global.set("emu", { every: (_: number, fn: () => void) => void timers.push(fn) });
    lua.global.set("presence", {
      set: (p: Record<string, unknown>) => void sent.push({ ...p }),
      clear: () => void sent.push({}),
    });
    await lua.doString(FAKE_MEM);
    await lua.doString(buildScript(catalog));
    for (const fn of timers) fn();
  } finally {
    lua.global.close();
  }
  return sent;
}

test("other games: the script does nothing", async () => {
  assert.deepEqual(await tick(hunter(139), "NPJH00000"), []);
});

test("before a hunter is loaded: in the menus", async () => {
  const [p] = await tick(new Memory());
  assert.equal(p?.details, "In the menus");
  assert.equal(p?.large_image, GAME_IMAGE);
});

test("in town: the place and the hunter, with the weapon", async () => {
  const [p] = await tick(hunter(139));
  assert.equal(p?.details, "In Pokke Village");
  assert.equal(p?.state, "Rin");
  assert.equal(p?.small_image, `${SITE}/embed/presence/great-sword-rarity-7.png`);
  assert.equal(p?.small_text, "Buster Sword (Great Sword)");
  assert.equal(p?.elapsed, undefined);
});

test("on a hunt: the target, the area the map prints and the quest's time", async () => {
  const [p] = await tick(onQuest(16));
  assert.equal(p?.details, "Hunting Tigrex");
  // The Jungle's 7th stage is its area 9.
  assert.equal(p?.state, "Jungle area 9");
  assert.equal(p?.large_image, `${SITE}/embed/presence/monster-tigrex.png`);
  assert.equal(p?.large_text, "G★3 · Tigrex Tamer");
  assert.equal(p?.elapsed, 65);
  assert.equal((await tick(onQuest(10)))[0]?.state, "Jungle Base Camp");
});

test("on a delivery: the title and the Herb", async () => {
  const [p] = await tick(onQuest(16, 2));
  assert.equal(p?.details, "Tigrex Tamer");
  assert.equal(p?.large_image, `${SITE}/embed/presence/herb.png`);
});
