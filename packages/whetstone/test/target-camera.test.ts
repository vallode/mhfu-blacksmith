import assert from "node:assert/strict";
import { test } from "node:test";
import { RUNTIME_OBJECTS } from "../src/blob/runtime-object.js";
import { decodeObjects, linkBlob } from "../src/blob/link.js";
import { HOOK, assembleHooks } from "../src/patches/game-hooks.js";
import { jalTo } from "../src/patches/mips.js";
import {
  EASE_SIGNATURE,
  EASE_WORD,
  EASE_WORDS,
  READ_WORDS,
  targetCameraObjects,
} from "../src/patches/target-camera.js";
import { Cpu } from "./mips-cpu.js";

const BLOB = 0x099a1820;
const HOOKS = 0x08901d38;
const SAVE = 0x09999c60;
const PAD_READ = 0x0890e120;
/** EU's ease and the game's read in the projection update's spare words. */
const EASE = 0x08887614;
const READ = 0x0881536c;
const RENDERER = 0x09998d30;
const FOLLOW = RENDERER + 0x150;
const HUNTER = 0x090b3440;
const MANAGER = 0x09b00000;
const TIME = 0x0890f000;
const GAUGES = 0x088405e4;
const HUD = 0x09a04ba0;
/** Whetstone's save data: camera_mark (after photo_mode and camera_target). */
const SAVED_MARK = SAVE + 0x666e0 + 190;
const EXTERNS = {
  rf_camera: 0x089cbbe4,
  rf_monsters: 0x09c121b0,
  rf_game_task: 0x09a5f200,
  rf_em_chunks: 0x09bb89b0,
  rf_target_yaw: READ,
  rf_fill: 0x0882d8dc,
  sceKernelGetSystemTimeLow: TIME,
};
const L = 0x100;
const RIGHT = 0x20;
const LEFT = 0x80;
const RATHALOS = 11;
const VELOCIDROME = 23;
const FRAME_US = 33333;
const S4 = 20;

/** The yaw that looks at a monster at (mx, mz) past the hunter at (hx, hz), as the game keeps it. */
const yawTo = (hx: number, hz: number, mx: number, mz: number) =>
  ((Math.round((Math.atan2(hx - mx, hz - mz) * 65536) / (2 * Math.PI)) << 16) >> 16) & 0xffff;
const near = (got: number, want: number, message?: string) => {
  const d = (((got - want) << 16) >> 16) as number;
  assert.ok(Math.abs(d) <= 0x30, `${message ?? ""} ${got.toString(16)} vs ${want.toString(16)}`);
};

/** The follow camera in a CPU: the patched ease, hook 8's stub, the blob, a hunter and monsters. */
function camera(mode: number, o: { loaded?: boolean } = {}) {
  const blob = linkBlob([...decodeObjects(RUNTIME_OBJECTS), ...targetCameraObjects()], BLOB, {
    ...EXTERNS,
    rf_camera_target: mode + 1,
  });
  const cpu = new Cpu();
  if (o.loaded !== false) cpu.write(BLOB, blob.image);
  const hooks = assembleHooks(
    HOOKS,
    BLOB,
    [
      { hook: HOOK.pad, target: PAD_READ },
      { hook: HOOK.hud, target: GAUGES },
    ],
    undefined,
    undefined,
    [],
    [{ call: EASE, target: READ }],
  );
  cpu.load(HOOKS, hooks.code);
  cpu.load(READ, READ_WORDS);
  // The ease as the disc has it, in a function that keeps $ra as the camera's does.
  cpu.load(EASE - 8, [0x27bdfff0, 0xafbf000c, jalTo(hooks.calls[0]!), ...EASE_WORDS]);
  cpu.load(EASE + 32, [0x8fbf000c, 0x03e00008, 0x27bd0010]);
  cpu.native.set(GAUGES, () => 0);
  /** What the HUD's translucent fill drew: x, y, w, h, and the colour and alpha. */
  const fills: { x: number; y: number; w: number; h: number; rgba: number[] }[] = [];
  const reg = (k: number) => cpu.reg[k]! >>> 0;
  cpu.native.set(EXTERNS.rf_fill, () => {
    assert.equal(reg(4), HUD);
    const s16 = (v: number) => (v << 16) >> 16;
    fills.push({
      x: s16(reg(5)),
      y: s16(reg(6)),
      w: s16(reg(7)),
      h: s16(reg(8)),
      rgba: [reg(9), reg(10), reg(11), cpu.u32(reg(29))],
    });
    return 0;
  });
  const clock = { now: 0x10000000 };
  cpu.native.set(TIME, () => clock.now >>> 0);
  cpu.write(EXTERNS.rf_game_task + 0x20, Buffer.from("game_task\0"));
  cpu.setU32(EXTERNS.rf_camera, RENDERER);
  cpu.setU32(RENDERER + 0xa84, HUNTER);
  cpu.setU32(HUD + 0x530, HUNTER);
  // The camera at the origin looking down -z: the view the identity, w = -z.
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  identity.forEach((v, k) => cpu.setU32(RENDERER + 0xb80 + k * 4, f32(v)));
  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, -60, 0].forEach((v, k) =>
    cpu.setU32(RENDERER + 0xc00 + k * 4, f32(v)),
  );
  cpu.setU32(EXTERNS.rf_monsters, MANAGER);
  // Large monsters have a stat set; Velocidrome's 0 makes it small here.
  cpu.setU8(EXTERNS.rf_em_chunks + RATHALOS * 0x1d0 + 0x14f, 1);
  const place = (at: number, x: number, z: number, area = 3) => {
    cpu.setU32(at + 0x40, f32(x));
    cpu.setU32(at + 0x48, f32(z));
    cpu.setU16(at + 0x29a, area);
  };
  place(HUNTER, 0, 0);
  const monsters: number[] = [];
  const monster = (slot: number, x: number, z: number, em = RATHALOS) => {
    const m = 0x090c0000 + slot * 0x4000;
    cpu.setU32(MANAGER + 0x1220 + slot * 4, m);
    cpu.setU8(m + 4, 3);
    cpu.setU8(m + 0x1e8, em);
    cpu.setU16(m + 0x2e4, 400);
    place(m, x, z);
    monsters[slot] = m;
    return m;
  };
  /** The monster's joints, at these places in the world. */
  const joints = (m: number, at: [number, number, number][]) => {
    const list = m + 0x1000;
    cpu.setU32(m + 0x190, list);
    cpu.setU32(m + 0x1a4, at.length);
    at.forEach((p, k) =>
      [...identity.slice(0, 12), ...p, 1].forEach((v, i) =>
        cpu.setU32(list + k * 0x250 + 0xd0 + i * 4, f32(v)),
      ),
    );
  };
  /** The HUD's draw this frame: what the mark filled. */
  const hud = () => {
    fills.length = 0;
    cpu.call(hooks.stubs[1]!, [HUD]);
    return [...fills];
  };
  /** Whatever the game set the yaw to turn to this frame, and the camera's buttons. */
  const frame = (o: { game?: number; held?: number; pressed?: number } = {}) => {
    clock.now += FRAME_US;
    cpu.setU16(FOLLOW + 0x80, o.game ?? cpu.u16(FOLLOW + 0x80));
    cpu.setU16(FOLLOW + 0x84, (o.held ?? 0) | (o.pressed ?? 0));
    cpu.setU16(FOLLOW + 0x86, o.pressed ?? 0);
    cpu.reg[S4] = FOLLOW;
    cpu.call(EASE - 8);
    return { to: cpu.u16(FOLLOW + 0x80), has: cpu.u16(FOLLOW + 0x82) };
  };
  if (o.loaded !== false) cpu.call(blob.symbols.get("rf_init")!, [0, SAVE, BLOB]);
  return { cpu, clock, frame, monster, place, monsters, joints, hud };
}

const f32 = (v: number) => {
  const b = Buffer.alloc(4);
  b.writeFloatLE(v);
  return b.readUInt32LE(0);
};

test("the ease's signature ends with the game's ease, which the patch keeps", () => {
  assert.equal(EASE_SIGNATURE[EASE_WORD], 0x86820080, "lh $v0, 0x80($s4)");
  // The patched ease without its first word: the game's, less the second seh.
  const ease = EASE_SIGNATURE.slice(EASE_WORD + 1);
  assert.deepEqual(EASE_WORDS.slice(1), [...ease.slice(0, 4), ...ease.slice(5)]);
});

test("without the blob, or off, the camera turns as the game says", () => {
  for (const c of [camera(1, { loaded: false }), camera(0)]) {
    if (c.cpu.u32(BLOB)) c.monster(0, 0, 1000);
    c.cpu.setU16(FOLLOW + 0x82, 0x1000);
    const got = c.frame({ game: 0x2000, pressed: L });
    assert.equal(got.to, 0x2000);
    assert.equal(got.has, 0x1400, "a quarter of the way");
  }
});

test("Tap: L turns the camera to the large monster, behind the hunter, then lets go", () => {
  const c = camera(1);
  c.monster(0, 600, 800);
  c.monster(1, -50, -900, VELOCIDROME); // small: never a target
  const want = yawTo(0, 0, 600, 800);
  // L: the game asks for behind the hunter (0x8000 from its facing); the camera turns to the monster.
  let got = c.frame({ game: 0x0000, pressed: L });
  near(got.to, want);
  for (let k = 0; k < 40; k++) got = c.frame({ game: got.to });
  near(got.has, want, "faces the monster");
  // Let go: the game's own yaw again (D-pad turning, say).
  got = c.frame({ game: 0x1234 });
  assert.equal(got.to, 0x1234);
});

test("Tap: the camera follows the monster while it turns; L twice is the game's L", () => {
  const c = camera(1);
  const m = c.monster(0, 0, 1000);
  let got = c.frame({ game: 0, pressed: L });
  near(got.to, yawTo(0, 0, 0, 1000));
  c.place(m, 1000, 0);
  got = c.frame({ game: 0 });
  near(got.to, yawTo(0, 0, 1000, 0), "where it is now");
  got = c.frame({ game: 0x4444, pressed: L });
  assert.equal(got.to, 0x4444, "a second L soon after: the game's");
  c.clock.now += 1_000_000;
  got = c.frame({ game: 0x4444, pressed: L });
  near(got.to, yawTo(0, 0, 1000, 0), "an L later: the monster again");
});

test("with no large monster in the area, L is the game's", () => {
  const c = camera(2);
  const m = c.monster(0, 0, 1000);
  c.cpu.setU16(m + 0x29a, 4);
  assert.equal(c.frame({ game: 0x3000, pressed: L }).to, 0x3000, "another area");
  c.cpu.setU16(m + 0x29a, 3);
  c.cpu.setU16(m + 0x2e4, 0);
  assert.equal(c.frame({ game: 0x3000, pressed: L }).to, 0x3000, "fallen");
});

test("the target is the monster nearest the middle; L and D-pad right or left goes to the next", () => {
  const c = camera(2);
  // The camera looks down -z (its yaw 0: the eye at +z): ahead is -z.
  c.cpu.setU16(FOLLOW + 0x82, 0);
  c.monster(0, 0, -1000); // ahead
  c.monster(3, 1000, 0); // to one side
  c.monster(5, -1000, 0); // to the other
  const ahead = yawTo(0, 0, 0, -1000);
  const east = yawTo(0, 0, 1000, 0);
  const west = yawTo(0, 0, -1000, 0);
  let got = c.frame({ game: 0, pressed: L });
  near(got.to, ahead);
  // Yaw going down is to the right on screen (a savestate: Rathalos left of
  // the hunter, at a yaw above the camera's).
  got = c.frame({ game: got.to, held: L, pressed: RIGHT });
  near(got.to, east, "right: the yaw goes down");
  got = c.frame({ game: got.to, held: L, pressed: LEFT });
  near(got.to, ahead, "back left");
  got = c.frame({ game: got.to, held: L, pressed: LEFT });
  near(got.to, west, "on to the left");
  got = c.frame({ game: got.to, held: L, pressed: LEFT });
  near(got.to, east, "round again");
});

test("Follow keeps the monster in view until the D-pad turns the camera", () => {
  const c = camera(2);
  const m = c.monster(0, 0, 1000);
  let got = c.frame({ game: 0, pressed: L });
  for (let k = 0; k < 60; k++) got = c.frame({ game: 0x7000 });
  near(got.to, yawTo(0, 0, 0, 1000), "still on it, whatever the game asks");
  c.place(m, -800, 300);
  got = c.frame({ game: 0x7000 });
  near(got.to, yawTo(0, 0, -800, 300));
  got = c.frame({ game: 0x7000, pressed: RIGHT });
  assert.equal(got.to, 0x7000, "the player turns it: let go");
  got = c.frame({ game: 0x7100, held: RIGHT });
  assert.equal(got.to, 0x7100);
});

test("Follow lets go when the monster leaves the area", () => {
  const c = camera(2);
  const m = c.monster(0, 0, 1000);
  c.frame({ game: 0, pressed: L });
  c.cpu.setU8(m + 4, 0);
  assert.equal(c.frame({ game: 0x5000 }).to, 0x5000);
  c.cpu.setU8(m + 4, 3);
  assert.equal(c.frame({ game: 0x5000 }).to, 0x5000, "and doesn't take it back by itself");
});

test("another camera's ease, or another call, is the game's", () => {
  const c = camera(2);
  c.monster(0, 0, 1000);
  c.cpu.setU16(FOLLOW + 0x80 + 0x100, 0x2222);
  c.cpu.setU16(FOLLOW + 0x84 + 0x100, L);
  c.cpu.setU16(FOLLOW + 0x86 + 0x100, L);
  c.cpu.reg[S4] = FOLLOW + 0x100;
  c.cpu.call(EASE - 8);
  assert.equal(c.cpu.u16(FOLLOW + 0x180), 0x2222);
});

/** The box a mark's fills cover: left, top, right, bottom. */
const bounds = (fills: { x: number; y: number; w: number; h: number }[]) => [
  Math.min(...fills.map((f) => f.x)),
  Math.min(...fills.map((f) => f.y)),
  Math.max(...fills.map((f) => f.x + f.w)),
  Math.max(...fills.map((f) => f.y + f.h)),
];

test("the mark: a small reticle at the target's body while the camera has it, fading after", () => {
  const c = camera(2);
  const m = c.monster(0, 0, -1000);
  // Its joints' middle is 100 up, 1000 in front of the camera: on screen at 240, 122.4.
  c.joints(m, [
    [0, 0, -1000],
    [-500, 100, -1000],
    [500, 200, -1000],
  ]);
  assert.deepEqual(c.hud(), [], "no target, no mark");
  c.frame({ game: 0, pressed: L });
  const reticle = c.hud();
  assert.equal(reticle.length, 8, "four corners of two bars");
  for (const f of reticle) assert.deepEqual(f.rgba, [0xff, 0xb0, 0x20, 0xc0]);
  assert.deepEqual(bounds(reticle), [230, 112, 250, 132], "20 pixels square");
  // The player turns away: the mark fades, then goes.
  c.frame({ game: 0x1000, pressed: RIGHT });
  c.clock.now += 300_000;
  const fading = c.hud();
  assert.ok(fading.length > 0 && fading[0]!.rgba[3]! < 0xc0 && fading[0]!.rgba[3]! > 0);
  c.clock.now += 400_000;
  assert.deepEqual(c.hud(), []);
});

test("the mark holds still as the monster moves its joints, the same size far off; Off hides it", () => {
  const c = camera(2);
  const m = c.monster(0, 0, -1000);
  const pose = (head: number) =>
    c.joints(m, [
      [0, 0, -1000],
      [-500, 100, -1000],
      [500, head, -1000],
    ]);
  pose(200);
  c.frame({ game: 0, pressed: L });
  const before = bounds(c.hud());
  // It rears up, its head from 200 to 800 (the joints' middle 100 to 300): the mark rises slowly.
  pose(800);
  c.frame({ game: 0 });
  const after = bounds(c.hud());
  assert.ok(before[1]! - after[1]! <= 2, `${before} to ${after}`);
  assert.equal(after[2]! - after[0]!, 20);
  for (let k = 0; k < 120; k++) {
    c.frame({ game: 0 });
    c.hud();
  }
  // In four seconds it's at the body's new height, 300 up: 136 × 0.7.
  const settled = bounds(c.hud())[1]! + 10;
  assert.ok(Math.abs(settled - 95) <= 2, `settled at ${settled}`);
  // Three times as far: the same size.
  c.place(m, 0, -3000);
  c.joints(m, [
    [0, 0, -3000],
    [0, 300, -3000],
  ]);
  c.frame({ game: 0 });
  const far = bounds(c.hud());
  assert.deepEqual([far[2]! - far[0]!, far[3]! - far[1]!], [20, 20]);
  c.cpu.setU8(SAVED_MARK, 1); // Off
  assert.deepEqual(c.hud(), []);
});
