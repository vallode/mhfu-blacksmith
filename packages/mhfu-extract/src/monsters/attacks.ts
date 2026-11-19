/**
 * Monster attack hitboxes: which capsules can hit the hunter, and when, in
 * each of a monster's motions. The site's file for one monster is
 * `public/models/monsters/emNN.attacks.json`, written by `export-site`.
 *
 * A monster's attacks are objects the game makes while a motion plays
 * (packages/randomfu/docs/monster-ai.md, "Attack objects"). Every frame the
 * monster's class runs a spawner (its vtable's +0x80 entry) that looks at
 * the motion playing (monster +0x324, 1000 + the motion's slot) and asks
 * whether the motion has reached a given frame (FRAME_AT); when it has, a
 * factory in game_task makes an attack object, whose init (the object
 * vtable's +0x20) copies a 24-byte row out of the species' attack table:
 *
 *   row 0x00 u8 delay, 0x01 u8 duration: 60 fps frames on the disc, halved
 *               by the loader into the game's 30 Hz ticks in the object
 *   row 0x02 u8 power, 0x03 u8 the hunter's reaction, 0x14 u8 stun
 *   row 0x0A u8 shape list, into the class's table of them (object +0x34)
 *
 * The object is harmless for `delay` ticks, can hit for `duration` ticks,
 * then goes; it also goes when the monster's motion changes. Its shapes are
 * 0x28-byte records, the same layout as the hurtboxes (collision.ts): s16
 * joint (-1 ends the list), s16 type (0 sphere, 1 capsule), +0x0C radius,
 * +0x10 start and +0x1C end in the joint's frame. Joints 0x7D-0x7F are
 * placed by code (a sweep between two frames, the object's own position)
 * and are left out here.
 *
 * Spawners branch every which way (compare chains, jump tables, on the
 * species, on state they set up on their first call), and some change the
 * row after the object is made, so rather than reading them this runs them
 * (mips.ts): for each motion slot, a made-up monster playing it at frame 0,
 * then at every frame the spawner asked about, until it asks about no new
 * frame. Every attack object made is initialised and read back.
 *
 * The addresses are the EU disc's (ULES01213): `export-site` runs this on
 * that disc only.
 */
import { elfLoadSegments } from "../container/elf.js";
import type { OvlFile } from "../container/ovl.js";
import type { Vec3 } from "./collision.js";
import type { JointPositions } from "./hitboxes.js";
import { Cpu, Memory, StepLimitError, bitsToFloat, floatToBits } from "./mips.js";

/** The spawn switch's jump table in game_task: one case per emID, which makes the monster's class. */
const SPAWN_SWITCH = 0x09c0ccf8;
const SPAWN_SWITCH_CASES = 90;
/** The pool allocator (pool, size, align) and the global holding the attack-object pool. */
const ALLOC = 0x08859b44;
const ATTACK_POOL_GLOBAL = 0x09c18fd0;
/** Global holding the monster manager; +0x1220 is its first monster. */
const MANAGER_GLOBAL = 0x09c121b0;
/** FRAME_AT(anim, part, f12 = frame): true once the motion's frame passes `frame`. */
const FRAME_AT = 0x08864348;
/** Where the attack-object factories sit in game_task. */
const FACTORIES = [0x09b62e00, 0x09b6b000] as const;
/** Load range of the per-monster overlays (emNN.ovl). */
const EM_OVERLAY_RANGE = [0x09d1a180, 0x09e00000] as const;

/** Made-up memory past the game's (PSP user memory stops at 0x0A000000). */
const SCRATCH = 0x0c000000;
const SCRATCH_SIZE = 0x800000;
const MONSTER = 0x0c014000;
const POOL = 0x0c124000;
const MANAGER = 0x0c184000;
const HEAP = 0x0c214000;
const STACK_TOP = 0x0c7f0000;
/** Return address no code uses: a call is done when it gets here. */
const RETURN = 0x0c7ff000;

/** Motion slots tried; no monster has more. */
const SLOTS = 150;
/** Frames past this are not followed (the longest motions are ~500 frames). */
const MAX_FRAME = 600;
const STEP_LIMIT = 300_000;
const MAX_SHAPES = 32;
/** Joints from here on are placed by code, not by the skeleton. */
export const FIRST_SPECIAL_JOINT = 0x7d;

const isUserAddress = (v: number) => v >= 0x08800000 && v < 0x0a000000;

/** A piece of the game loaded at `base`: an EBOOT segment or a whole `.ovl` file. */
export interface ImageSegment {
  base: number;
  bytes: Uint8Array;
}

/** A decrypted EBOOT's loaded segments, zero-filled to their size in memory. */
export function ebootImage(elf: Buffer): ImageSegment[] {
  return elfLoadSegments(elf).map((segment) => {
    const bytes = new Uint8Array(Math.max(segment.memSize, segment.fileSize));
    bytes.set(elf.subarray(segment.offset, segment.offset + segment.fileSize));
    return { base: segment.base + segment.offset, bytes };
  });
}

/** An overlay as the game loads it: the whole file, header included, at its load base. */
export const ovlImage = (ovl: OvlFile): ImageSegment => ({
  base: ovl.loadBase,
  bytes: new Uint8Array(ovl.reader.buf.buffer, ovl.reader.buf.byteOffset, ovl.reader.buf.length),
});

export interface AttackShape {
  joint: number;
  /** 0 sphere (end is start), 1 capsule. */
  type: number;
  radius: number;
  start: Vec3;
  end: Vec3;
}

/** One attack object a motion makes, as its init left it. */
export interface AttackSpawn {
  slot: number;
  /** Motion frame (60 fps) it is made on. */
  frame: number;
  /** The object's copy of its row (24 bytes), delay and duration in 30 Hz ticks. */
  row: Uint8Array;
  /** Address of the species' row table, and the row's index in it. */
  rowTable: number;
  rowIndex: number;
  /** Address of its shape list. */
  shapeList: number;
  shapes: AttackShape[];
}

/**
 * The class vtable a spawn-switch case stores into the new monster: the
 * first `lui r, hi; addiu r, r, lo; sw r, 0($s0)` in the case.
 */
export function vtableOfCase(memory: Memory, caseAddress: number): number | null {
  for (let i = 0; i < 78; i++) {
    const a = memory.u32(caseAddress + i * 4);
    const b = memory.u32(caseAddress + i * 4 + 4);
    const c = memory.u32(caseAddress + i * 4 + 8);
    const r = (a >>> 16) & 31;
    const isLui = a >>> 26 === 0x0f;
    const isAddiu = b >>> 26 === 0x09 && ((b >>> 21) & 31) === r && ((b >>> 16) & 31) === r;
    const isStore = c >>> 26 === 0x2b && ((c >>> 21) & 31) === 16 && ((c >>> 16) & 31) === r;
    if (isLui && isAddiu && isStore && (c & 0xffff) === 0)
      return (((a & 0xffff) << 16) + ((b << 16) >> 16)) >>> 0;
  }
  return null;
}

/** The vtable's entries, from +8 up to the first zero. */
function vtableEntries(memory: Memory, vtable: number): number[] {
  const out: number[] = [];
  for (let at = vtable + 8; out.length < 256; at += 4) {
    const entry = memory.u32(at);
    if (!entry) break;
    out.push(entry);
  }
  return out;
}

/** True if `offset` in an overlay file looks like the start of a function. */
function looksLikeFunction(view: DataView, offset: number): boolean {
  if (offset < 0 || offset + 4 > view.byteLength) return false;
  const word = view.getUint32(offset, true);
  const previous = offset >= 8 ? view.getUint32(offset - 8, true) : 0;
  // addiu $sp, $sp, -n; a j; or anything just after a `jr $ra; nop`
  return word >>> 16 === 0x27bd || word >>> 26 === 2 || previous === 0x03e00008;
}

/**
 * Which `emNN.ovl` a class's code is in, when it has methods in the
 * per-monster overlays' load range (which they all share): the overlay in
 * which the most of those methods land on a function's start, `preferred`
 * (the monster's family's) on a tie. Undefined for a class in game_task.
 */
export function overlayForVtable(
  memory: Memory,
  vtable: number,
  overlays: ReadonlyMap<number, ImageSegment>,
  preferred: number,
): number | undefined {
  const methods = vtableEntries(memory, vtable).filter(
    (e) => e >= EM_OVERLAY_RANGE[0] && e < EM_OVERLAY_RANGE[1],
  );
  if (methods.length === 0) return undefined;
  let best: number | undefined;
  let bestScore = -1;
  const ids = [...overlays.keys()].sort((a, b) =>
    a === preferred ? -1 : b === preferred ? 1 : a - b,
  );
  for (const id of ids) {
    const { base, bytes } = overlays.get(id)!;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const score = methods.filter((m) => looksLikeFunction(view, m - base)).length;
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : undefined;
}

/** The game's memory with a made-up monster in it, and a CPU to run the class's code. */
class Sandbox {
  readonly memory = new Memory();
  private heap = HEAP;
  /** Allocations this run: address, size and the caller's return address. */
  allocations: { address: number; size: number; caller: number }[] = [];
  /** Frames the spawner asked FRAME_AT about this run. */
  frames = new Set<number>();

  constructor(image: ImageSegment[]) {
    // Copies, since runs write to them (rolled back after each).
    for (const { base, bytes } of image) this.memory.add(base, bytes.slice());
    this.memory.add(SCRATCH, new Uint8Array(SCRATCH_SIZE));
    this.memory.w32(ATTACK_POOL_GLOBAL, POOL);
    this.memory.w32(MANAGER_GLOBAL, MANAGER);
    this.memory.w32(MANAGER + 0x1220, MONSTER);
    this.memory.mark();
  }

  reset(): void {
    this.memory.rollback();
    this.heap = HEAP;
    this.allocations = [];
    this.frames = new Set();
  }

  /** Calls `fn(...args)`; false if it ran away. */
  call(fn: number, ...args: number[]): boolean {
    const cpu = new Cpu(this.memory);
    cpu.hooks.set(ALLOC, (c) => {
      const size = c.r[5]!;
      this.allocations.push({ address: this.heap, size, caller: c.r[31]! });
      c.r[2] = this.heap;
      this.heap += (size + 0x3f) & ~0xf;
      return true;
    });
    cpu.hooks.set(FRAME_AT, (c) => {
      this.frames.add(bitsToFloat(c.f[12]!));
      return false;
    });
    cpu.r[29] = STACK_TOP;
    cpu.r[31] = RETURN;
    args.forEach((a, i) => (cpu.r[4 + i] = a >>> 0));
    try {
      cpu.run(fn, RETURN, STEP_LIMIT);
      return true;
    } catch (err) {
      if (err instanceof StepLimitError) return false;
      throw err;
    }
  }

  /** A monster of class `vtable` (species `emId`) playing motion `slot` at `frame`. */
  setUpMonster(vtable: number, emId: number, slot: number, frame: number): void {
    const m = this.memory;
    m.w32(MONSTER, vtable);
    m.w16(MONSTER + 0x1e6, 0); // its place in the manager
    for (let part = 0; part < 4; part++) {
      // Motion per body part; only part 0's plays.
      m.w16(MONSTER + 0x324 + 2 * part, part === 0 ? 1000 + slot : 0);
      const anim = MONSTER + 0x80 + 0x40 * part;
      m.w32(anim + 0x10, floatToBits(frame)); // current frame
      m.w32(anim + 0x14, floatToBits(1)); // speed
      m.w32(anim + 0x18, 0);
      m.w32(anim + 0x1c, floatToBits(10000)); // end
    }
    m.w16(MONSTER + 0x792, 1000 + slot);
    m.w32(MONSTER + 0x220, floatToBits(1)); // scale
    m.w8(MONSTER + 0x1e8, emId); // species: classes shared by a family branch on it
  }

  /** The attack objects made this run, initialised. */
  attackObjects(): Omit<AttackSpawn, "slot" | "frame">[] {
    const m = this.memory;
    const out: Omit<AttackSpawn, "slot" | "frame">[] = [];
    for (const { address, caller } of [...this.allocations]) {
      // Effects, sounds and such come from elsewhere.
      if (caller < FACTORIES[0] || caller >= FACTORIES[1]) continue;
      const vtable = m.u32(address);
      if (!isUserAddress(vtable)) continue;
      const init = m.u32(vtable + 0x20);
      if (!isUserAddress(init) || !this.call(init, address)) continue;
      const shapeList = m.u32(address + 0x34);
      out.push({
        row: m.bytes(address + 0x1c, 0x18),
        rowIndex: m.u8(address + 0x0d),
        rowTable: m.u32(address + 0xc8),
        shapeList,
        shapes: readShapes(m, shapeList),
      });
    }
    return out;
  }
}

function readShapes(m: Memory, list: number): AttackShape[] {
  const shapes: AttackShape[] = [];
  if (!isUserAddress(list)) return shapes;
  const vec = (at: number): Vec3 => [m.f32(at), m.f32(at + 4), m.f32(at + 8)];
  for (let at = list; shapes.length < MAX_SHAPES; at += 0x28) {
    const joint = (m.u16(at) << 16) >> 16;
    if (joint < 0) break;
    shapes.push({
      joint,
      type: m.u16(at + 2),
      radius: m.f32(at + 0x0c),
      start: vec(at + 0x10),
      end: vec(at + 0x1c),
    });
  }
  return shapes;
}

export type MonsterAttackSweep =
  | {
      spawns: AttackSpawn[];
      /** The emNN.ovl the class's code came from, if any. */
      overlay?: number;
    }
  | { error: string };

/**
 * Every attack object monster `emId`'s motions make. `image` is the game
 * with no monster overlay (the EBOOT's segments, game_task and game_sub);
 * `overlays` the emNN.ovl files by emID, `preferred` the one to pick on a
 * tie (overlayForVtable).
 */
export function sweepMonsterAttacks(
  image: ImageSegment[],
  overlays: ReadonlyMap<number, ImageSegment>,
  emId: number,
  preferred = emId,
): MonsterAttackSweep {
  if (emId < 0 || emId >= SPAWN_SWITCH_CASES) return { error: `emID ${emId} has no spawn case` };
  const probe = new Memory();
  for (const { base, bytes } of image) probe.add(base, bytes);
  const vtable = vtableOfCase(probe, probe.u32(SPAWN_SWITCH + emId * 4));
  if (vtable === null || !isUserAddress(vtable))
    return { error: "no class vtable in its spawn case" };
  const overlay = overlayForVtable(probe, vtable, overlays, preferred);
  const sandbox = new Sandbox(overlay === undefined ? image : [...image, overlays.get(overlay)!]);
  const spawner = sandbox.memory.u32(vtable + 0x80);
  if (!isUserAddress(spawner)) return { error: "no spawner in the class vtable" };

  const spawns: AttackSpawn[] = [];
  for (let slot = 0; slot < SLOTS; slot++) {
    const done = new Set<number>();
    const todo = [0];
    while (todo.length) {
      const frame = todo.pop()!;
      if (done.has(frame)) continue;
      done.add(frame);
      sandbox.reset();
      sandbox.setUpMonster(vtable, emId, slot, frame);
      // Twice: some spawners only set themselves up on their first call
      // (Yian Kut-Ku's).
      if (sandbox.call(spawner, MONSTER)) sandbox.call(spawner, MONSTER);
      for (const asked of sandbox.frames)
        if (asked >= 0 && asked < MAX_FRAME)
          for (const next of [Math.trunc(asked), asked]) if (!done.has(next)) todo.push(next);
      const seen = new Set<string>();
      for (const object of sandbox.attackObjects()) {
        const key = `${object.rowTable}:${object.rowIndex}:${object.shapeList}`;
        if (seen.has(key)) continue;
        seen.add(key);
        spawns.push({ slot, frame, ...object });
      }
    }
  }
  spawns.sort((a, b) => a.slot - b.slot || a.frame - b.frame || a.rowIndex - b.rowIndex);
  return overlay === undefined ? { spawns } : { spawns, overlay };
}

export interface SiteAttackCapsule {
  /** The joint it rides on (the GLB's `bone_<joint>`). */
  joint: number;
  radius: number;
  /** Ends in model space in the bind pose, the GLB's units (equal for a sphere). */
  start: Vec3;
  end: Vec3;
}

export interface SiteAttack {
  /** The motion's slot (the site's clip slot). */
  slot: number;
  /** Motion frames (60 fps) it can hit in: from `from` up to, not including, `to`. */
  from: number;
  to: number;
  power: number;
  /** How the hunter reacts (row byte 3; its values aren't mapped yet). */
  reaction: number;
  stun: number;
  capsules: SiteAttackCapsule[];
}

export interface SiteAttacks {
  attacks: SiteAttack[];
}

const round = (v: number) => Math.round(v * 10) / 10;

/** The site's attack file: each spawn's window and shapes, placed with the skeleton's bind pose. */
export function buildSiteAttacks(
  spawns: AttackSpawn[],
  joints: JointPositions,
): { attacks: SiteAttacks; skipped: string[] } {
  const attacks: SiteAttack[] = [];
  const skipped = new Set<string>();
  const seen = new Set<string>();
  for (const spawn of spawns) {
    const delay = spawn.row[0]!;
    const duration = spawn.row[1]!;
    const capsules: SiteAttackCapsule[] = [];
    for (const shape of spawn.shapes) {
      const where = `motion ${spawn.slot} row ${spawn.rowIndex}: joint ${shape.joint}`;
      if (shape.joint >= FIRST_SPECIAL_JOINT) {
        skipped.add(`${where} is placed by code`);
        continue;
      }
      const frame = joints.frames.get(shape.joint);
      if (!frame) {
        skipped.add(
          joints.rotated.has(shape.joint)
            ? `${where} has a rotated bone in its chain`
            : `${where} isn't in the skeleton`,
        );
        continue;
      }
      const end = shape.type === 0 ? shape.start : shape.end;
      if (!(shape.radius > 0) || ![...shape.start, ...end].every(Number.isFinite)) {
        skipped.add(`${where}: no size`);
        continue;
      }
      const place = (offset: Vec3) =>
        offset.map((v, k) => round(frame.origin[k]! + frame.scale[k]! * v)) as Vec3;
      capsules.push({
        joint: shape.joint,
        radius: round(shape.radius),
        start: place(shape.start),
        end: place(end),
      });
    }
    if (capsules.length === 0 || duration === 0) continue;
    const attack: SiteAttack = {
      slot: spawn.slot,
      from: Math.round(spawn.frame + 2 * delay),
      to: Math.round(spawn.frame + 2 * (delay + duration)),
      power: spawn.row[2]!,
      reaction: spawn.row[3]!,
      stun: spawn.row[0x14]!,
      capsules,
    };
    const key = JSON.stringify(attack);
    if (seen.has(key)) continue;
    seen.add(key);
    attacks.push(attack);
  }
  return { attacks: { attacks }, skipped: [...skipped] };
}
