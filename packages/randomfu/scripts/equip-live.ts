/**
 * Swaps the hunter's melee weapon, model and all, on a key press, in a
 * running PPSSPP (EU disc) through its remote debugger: for looking through
 * a disc's weapons (say, with `mods.weaponMashups`), in quests or the
 * village.
 *
 *   pnpm --filter randomfu equip:live [--running <disc PPSSPP has open>] [--port N] [--id <melee ID>]
 *
 * PPSSPP needs the remote debugger on (Settings > Tools > Developer tools >
 * Allow remote debugger). Keys: space or r swaps in another weapon of the
 * equipped one's class, on the spot; b puts one in the equipment box
 * instead, to equip in the house; c switches between the equipped weapon's
 * class and any melee class (another class is equipped for the next stage
 * load instead: departing on a quest, or back to the village); q quits.
 *
 * What the game does (EU addresses):
 * - The equipped weapon is an equipment box slot (`01 05`, the u16 melee
 *   ID, then the decorations), kept in three places, each right after the
 *   bytes `e4 9a 67 ff`: twice in the save data and once in the hunter
 *   (+0x4e8). `0x08821BD4(hunter, slot)` copies a slot into the hunter and
 *   sets what follows from it (model +0x534, class, sharpness, stats).
 * - The hunter's files are raw copies of DATA.BIN files in fixed resource
 *   slots of `*0x08A62C5C` (+0x80000: buffers +0x258, capacities +0x318,
 *   states +0x3d8, file indices +0x408): hunter n's weapon is slot
 *   n * 8 + 6, file 0xD50 + the model. In a single-player quest hunter
 *   1's slots (8 to 15) are marked unloaded but their memory holds other
 *   data: writing there broke the hunter's motions.
 * - The drawn weapon is built from its slot when the hunter is created
 *   (`0x08868234(resources, hunter, n)`, into hunter +0xf60) and torn down
 *   by `0x08868680(resources, hunter)`. The house's equipment change tears
 *   down, copies the new file in, builds, then calls
 *   `0x088DAD58(hunter, model)` (which points hunter +0x7f4 at the
 *   model's entry in a table) and poses the model's parts
 *   (`0x088CF210(hunter, hunter +0x612)`, +0x612 being 0 while sheathed),
 *   all in one frame. The teardown also clears hunter +0x1ac
 *   (`0x08868678`), which only the hunter's creation sets (from its entry
 *   in `*0x09A4F0D0`): without it the hunter can't move or attack with the
 *   weapon drawn, so the routine sets it again after the build (to what it
 *   was, or when that's 0, to the creation's value).
 * - A stage load asks for every file again but keeps a slot that's loaded
 *   (state 3) whatever it holds; unloading is just state 0, file 0xFFFF.
 *
 * The swap does what the house does, in the game's own thread: while the
 * game is paused it writes the new file and a routine into the PSP's
 * volatile memory (0x08400000 to 0x08800000, which the game leaves empty),
 * and a jump to the routine over the start of `0x088971A0` (run every
 * frame). The routine runs once, then the start it replaced, and the next
 * pause puts the start back and empties the volatile memory again. The
 * debugger's breakpoints and register writes could do it with less, but
 * each time they were used PPSSPP 1.19.3 crashed soon after (in its UI,
 * audio or display threads), and pausing, reading and writing never did.
 * Reading code takes `replacements: false` (`read(…, true)`): PPSSPP's JIT
 * puts its own opcodes at the start of compiled blocks.
 */
import { BinaryReader } from "mhfu-extract/src/binary/reader.js";
import { FileSource } from "mhfu-extract/src/container/source.js";
import {
  readBlademasterWeapons,
  readModelToWeaponType,
  type WeaponTypeName,
} from "mhfu-extract/src/tables/weapons.js";
import { OverlaySource, PatchableImage } from "../src/disc/image.js";
import { MELEE_TYPES } from "../src/forge/parts.js";
import { loadGame } from "../src/game/load.js";
import { tableName } from "../src/names.js";
import { Rng, randomSeed } from "../src/rng.js";
import { connect, debuggerPort, fail, RAM_START, readRam, runningDisc } from "./ppsspp.js";

/** What comes right before every copy of the equipped weapon. */
const MARKER = Buffer.from([0xe4, 0x9a, 0x67, 0xff]);
const MELEE = 0x0105;
const SLOT_SIZE = 12;
const BOX_SLOTS = 400;
/** The box, from the save data's copy of the equipped weapon. */
const BOX_AFTER_EQUIPPED = 0x88;
/** The resource slots' owner. */
const RESOURCES = 0x08a62c5c;
/** The hunters' owner: its +0xc is hunter 0. */
const HUNTERS = 0x09a4f0c4;
const HUNTER_SLOT = 0x4e8;
const HUNTER_MODEL = 0x534;
const SLOT_BUFFERS = 0x80258;
const SLOT_CAPACITIES = 0x80318;
const SLOT_STATES = 0x803d8;
const SLOT_FILES = 0x80408;
const WEAPON_SLOT = 6;
/** In the volatile memory: the routine, its flags (`ROUTINE_WORDS` in) and the new file. */
const SCRATCH = 0x08780000;
const SCRATCH_SIZE = 0x8000;
const STAGE = SCRATCH + 0x2000;
const WEAPON_FILES = 0xd50;

const SET_WEAPON = 0x08821bd4;
const BUILD = 0x08868234;
const TEARDOWN = 0x08868680;
const MODEL_ENTRY = 0x088dad58;
/** Poses the weapon model's parts from the model's entry, for hunter +0x612 (drawn or not). */
const POSE = 0x088cf210;
const HUNTER_DRAWN = 0x612;
/** Set at the hunter's creation (from `*0x09A4F0D0`), cleared by the teardown, not set by the build. */
const HUNTER_MOTIONS = 0x1ac;
/** The hunters' entries (12 bytes, hunter n's at n + 1): flags (u16, 2 when +4 holds +0x1ac's pointer). */
const HUNTER_ENTRIES = 0x09a4f0d0;
const HUNTER_INDEX = 0x1e6;

/** Run every frame; it starts `addiu sp, sp, -0x10; sw ra, 0xc(sp)`. */
const HOOK = 0x088971a0;
const HOOK_START = [0x27bdfff0, 0xafbf000c];
/** The routine's flag (set to run it), build result and done words, after its code. */
const ROUTINE_WORDS = 0x1f00;
/** How long to wait for the routine to run. */
const SWAP_WAIT_MS = 2000;

interface Weapon {
  id: number;
  name: string;
  model: number;
  type: WeaponTypeName;
  /** Its DATA.BIN file. */
  pac: Buffer;
}

function parseArgs(argv: string[]) {
  const args = { running: "", port: 0, id: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port") args.port = Number(argv[++i]);
    else if (argv[i] === "--id") args.id = Number(argv[++i]);
    else if (argv[i] === "--running") args.running = argv[++i] ?? "";
  }
  return args;
}

/** Every melee weapon on the disc, by its melee ID. */
async function meleeWeapons(disc: string): Promise<Map<number, Weapon>> {
  const overlay = new OverlaySource(new FileSource(disc));
  const game = await loadGame(overlay, new PatchableImage(overlay).iso);
  const eboot = new BinaryReader(game.eboot);
  const modelType = readModelToWeaponType(eboot, game.resolver);
  const weapons = new Map<number, Weapon>();
  readBlademasterWeapons(eboot, game.resolver).forEach(({ modelId: model }, id) => {
    const name = tableName("WepBMID", id);
    const type = modelType[model];
    const file = WEAPON_FILES + model;
    if (id > 0 && name && type && MELEE_TYPES.includes(type) && file < game.dataBin.fileCount) {
      weapons.set(id, { id, name, model, type, pac: game.dataBin.read(file) });
    }
  });
  return weapons;
}

// MIPS, as much as the routine needs.
const [ZERO, V0, A0, A1, A2, A3, T0, T1, SP, RA] = [0, 2, 4, 5, 6, 7, 8, 9, 29, 31] as const;
const immediate = (op: number, rs: number, rt: number, value: number) =>
  ((op << 26) | (rs << 21) | (rt << 16) | (value & 0xffff)) >>> 0;
const addiu = (rt: number, rs: number, value: number) => immediate(0x09, rs, rt, value);
const lw = (rt: number, offset: number, base: number) => immediate(0x23, base, rt, offset);
const lbu = (rt: number, offset: number, base: number) => immediate(0x24, base, rt, offset);
const lhu = (rt: number, offset: number, base: number) => immediate(0x25, base, rt, offset);
const sw = (rt: number, offset: number, base: number) => immediate(0x2b, base, rt, offset);
const beq = (rs: number, rt: number, words: number) => immediate(0x04, rs, rt, words);
const bgtz = (rs: number, words: number) => immediate(0x07, rs, 0, words);
const li = (rt: number, value: number) => [
  immediate(0x0f, 0, rt, value >>> 16),
  immediate(0x0d, rt, rt, value),
];
const jump = (op: number, address: number) => ((op << 26) | ((address >>> 2) & 0x3ffffff)) >>> 0;
const j = (address: number) => jump(2, address);
const jal = (address: number) => jump(3, address);

const NOP = 0;
const words = (code: number[]) => {
  const bytes = Buffer.alloc(code.length * 4);
  code.forEach((word, i) => bytes.writeUInt32LE(word, i * 4));
  return bytes;
};

/** Where the game keeps the equipped weapon and what goes with it, in `ram` (addresses). */
interface Equipped {
  id: number;
  copies: number[];
  hunter: number;
  /** The equipment box's first slot. */
  box: number;
  resources: number;
  /** The weapon's resource slot: its state byte and file index. */
  state: number;
  file: number;
}

function findEquipped(ram: Buffer): Equipped | string {
  const u32 = (address: number) => ram.readUInt32LE(address - RAM_START);
  const copies: number[] = [];
  for (let p = ram.indexOf(MARKER); p >= 0; p = ram.indexOf(MARKER, p + 1)) {
    const copy = p + MARKER.length;
    if (copy % 4 === 0 && ram.readUInt16BE(copy) === MELEE) copies.push(RAM_START + copy);
  }
  const hunters = u32(HUNTERS);
  const hunter = hunters >= RAM_START ? u32(hunters + 0xc) : 0;
  if (!copies.includes(hunter + HUNTER_SLOT))
    return "No melee weapon equipped (or not the EU disc).";
  const box = copies
    .map((copy) => copy - RAM_START + BOX_AFTER_EQUIPPED)
    .find((at) => {
      if (at + BOX_SLOTS * SLOT_SIZE > ram.length) return false;
      const slots = Array.from({ length: BOX_SLOTS }, (_, i) => slotAt(ram, at + i * SLOT_SIZE));
      return slots.every(isSlot) && slots.some((s) => s.readUInt16BE(0) !== 0);
    });
  if (box === undefined) return "The equipment box wasn't found.";
  const resources = u32(RESOURCES);
  const file = resources + SLOT_FILES + WEAPON_SLOT * 2;
  const loaded = ram.readUInt16LE(file - RAM_START);
  if (loaded !== 0xffff && (loaded < WEAPON_FILES || loaded >= WEAPON_FILES + 0x400)) {
    return `The weapon's resource slot holds file ${loaded}, not a weapon.`;
  }
  return {
    id: ram.readUInt16LE(hunter + HUNTER_SLOT - RAM_START + 2),
    copies,
    hunter,
    box: RAM_START + box,
    resources,
    state: resources + SLOT_STATES + WEAPON_SLOT,
    file,
  };
}

/** Hunter +0x1ac, or what the hunter's creation sets it to when it's 0. */
function motionsOf(ram: Buffer, hunter: number): number {
  const u32 = (address: number) => ram.readUInt32LE(address - RAM_START);
  const now = u32(hunter + HUNTER_MOTIONS);
  if (now) return now;
  const entry =
    u32(HUNTER_ENTRIES) + (ram.readUInt16LE(hunter + HUNTER_INDEX - RAM_START) + 1) * 12;
  return ram.readUInt16LE(entry - RAM_START) & 2 ? u32(entry + 4) : 0;
}

const slotAt = (ram: Buffer, at: number) => ram.subarray(at, at + SLOT_SIZE);
const isSlot = (slot: Buffer) =>
  slot.readUInt16BE(0) === 0 ? slot.every((b) => b === 0) : slot[0] === 1 && slot[1]! <= 6;
const meleeSlot = (id: number) => {
  const slot = Buffer.alloc(SLOT_SIZE);
  slot.writeUInt16BE(MELEE, 0);
  slot.writeUInt16LE(id, 2);
  return slot;
};

/**
 * The routine the hook jumps to: when its flag is set, clears it and does
 * the house's equipment change; then runs the hook's start and goes back.
 */
function routine(
  at: number,
  swap: {
    resources: number;
    hunter: number;
    slot: number;
    length: number;
    weapon: number;
    stage: number;
    /** What hunter +0x1ac gets back after the build. */
    motions: number;
  },
) {
  const { resources, hunter, slot, length, weapon, stage, motions } = swap;
  // Flags: +0 go, +4 the build's result, +8 done.
  const flag = at + ROUTINE_WORDS;
  const change = [
    sw(ZERO, 0, T0),
    addiu(SP, SP, -0x20),
    sw(RA, 0x1c, SP),
    sw(A0, 0x0c, SP),
    sw(A1, 0x10, SP),
    sw(A2, 0x14, SP),
    sw(A3, 0x18, SP),
    ...li(A0, resources),
    ...li(A1, hunter),
    jal(TEARDOWN),
    NOP,
    // The file, a word at a time: a0 the weapon's slot, a1 the stage, a2 bytes left.
    ...li(A0, weapon),
    ...li(A1, stage),
    ...li(A2, Math.ceil(length / 4) * 4),
    lw(T0, 0, A1),
    addiu(A1, A1, 4),
    sw(T0, 0, A0),
    addiu(A2, A2, -4),
    bgtz(A2, -5),
    addiu(A0, A0, 4),
    ...li(A0, hunter),
    ...li(A1, slot),
    jal(SET_WEAPON),
    NOP,
    ...li(A0, resources),
    ...li(A1, hunter),
    jal(BUILD),
    addiu(A2, ZERO, 0),
    ...li(T0, flag),
    sw(V0, 4, T0),
    ...li(T1, motions),
    ...li(A0, hunter),
    sw(T1, HUNTER_MOTIONS, A0),
    ...li(A0, hunter),
    jal(MODEL_ENTRY),
    lhu(A1, HUNTER_MODEL, A0),
    ...li(A0, hunter),
    jal(POSE),
    lbu(A1, HUNTER_DRAWN, A0),
    ...li(T0, flag),
    addiu(V0, ZERO, 1),
    sw(V0, 8, T0),
    lw(RA, 0x1c, SP),
    lw(A0, 0x0c, SP),
    lw(A1, 0x10, SP),
    lw(A2, 0x14, SP),
    lw(A3, 0x18, SP),
    addiu(SP, SP, 0x20),
  ];
  return words([
    ...li(T0, flag),
    lw(T1, 0, T0),
    beq(T1, ZERO, change.length + 1),
    NOP,
    ...change,
    ...HOOK_START,
    j(HOOK + 8),
    NOP,
  ]);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const disc = args.running || runningDisc();
  const weapons = await meleeWeapons(disc);
  const ppsspp = await connect(args.port || debuggerPort());
  const rng = new Rng(randomSeed());
  let anyClass = false;
  /** The box slot this run fills, and what it last wrote there. */
  let ours: { at: number; slot: Buffer } | null = null;

  const pick = (current: Weapon | undefined, fits: (w: Weapon) => boolean) => {
    if (args.id) return weapons.get(args.id);
    const pool = [...weapons.values()].filter(
      (w) =>
        w.id !== current?.id &&
        w.model !== current?.model &&
        (anyClass || !current || w.type === current.type) &&
        fits(w),
    );
    return pool.length ? pool[rng.int(pool.length)]! : undefined;
  };
  const u16 = (value: number) => {
    const bytes = Buffer.alloc(2);
    bytes.writeUInt16LE(value);
    return bytes;
  };
  const u32 = (value: number) => {
    const bytes = Buffer.alloc(4);
    bytes.writeUInt32LE(value >>> 0);
    return bytes;
  };

  /** Equips a random weapon: on the spot if it can, else for the next stage load. */
  const equip = async () => {
    const swap = await ppsspp.paused(async () => {
      const ram = await readRam(ppsspp);
      const found = findEquipped(ram);
      if (typeof found === "string") return console.log(found);
      const at = (address: number) => ram.readUInt32LE(address - RAM_START);
      const buffer = (slot: number) => at(found.resources + SLOT_BUFFERS + slot * 4);
      const room = Math.min(
        at(found.resources + SLOT_CAPACITIES + WEAPON_SLOT * 4),
        SCRATCH + SCRATCH_SIZE - STAGE,
      );
      const current = weapons.get(found.id);
      const next = pick(current, (w) => w.pac.length <= room);
      if (!next) return console.log("No other weapon fits.");
      const hooked = (await ppsspp.read(HOOK, 8, true)).equals(words(HOOK_START));
      const empty = (await ppsspp.read(SCRATCH, SCRATCH_SIZE)).every((b) => b === 0);
      const stuck = !hooked
        ? "The game's code isn't the EU disc's"
        : !empty
          ? "The volatile memory is in use"
          : undefined;
      const slot = meleeSlot(next.id);
      const saveCopies = found.copies.filter((copy) => copy !== found.hunter + HUNTER_SLOT);
      for (const copy of saveCopies) await ppsspp.write(copy, slot);
      await ppsspp.write(found.file, u16(WEAPON_FILES + next.model));
      const label = `${next.name} (${next.type}, ID ${next.id})`;
      if (stuck || next.type !== current?.type) {
        await ppsspp.write(found.hunter + HUNTER_SLOT, slot);
        await ppsspp.write(found.hunter + HUNTER_MODEL, u16(next.model));
        await ppsspp.write(found.state, Buffer.from([0]));
        await ppsspp.write(found.file, u16(0xffff));
        const why = stuck ? `${stuck}: ` : "Another class: ";
        return console.log(`${why}equipped ${label}, loaded on departing or going back.`);
      }
      const routineAt = SCRATCH;
      await ppsspp.write(STAGE, next.pac);
      const code = routine(routineAt, {
        resources: found.resources,
        hunter: found.hunter,
        slot: saveCopies.at(-1)!,
        length: next.pac.length,
        weapon: buffer(WEAPON_SLOT),
        stage: STAGE,
        motions: motionsOf(ram, found.hunter),
      });
      await ppsspp.write(routineAt, code);
      await ppsspp.write(found.state, Buffer.from([3]));
      await ppsspp.write(routineAt + ROUTINE_WORDS, Buffer.concat([u32(1), u32(-1), u32(0)]));
      await ppsspp.write(HOOK, words([j(routineAt), NOP]));
      return { flags: routineAt + ROUTINE_WORDS, label, found, slot, model: next.model };
    });
    if (!swap) return;
    // Waits for the routine, then puts the hook's start back.
    for (let waited = 0; ; waited += 200) {
      await sleep(200);
      const done = await ppsspp.paused(async () => {
        const state = await ppsspp.read(swap.flags, 12);
        const [go, built, finished] = [0, 4, 8].map((o) => state.readInt32LE(o));
        if (!finished && waited < SWAP_WAIT_MS) return false;
        await ppsspp.write(HOOK, words(HOOK_START));
        if (finished || go) await ppsspp.write(SCRATCH, Buffer.alloc(SCRATCH_SIZE));
        if (finished) {
          console.log(
            built === 1
              ? `Swapped to ${swap.label}.`
              : `Swapped to ${swap.label}, but its model didn't build.`,
          );
          return true;
        }
        if (go) {
          // Never ran: equip it for the next stage load instead.
          await ppsspp.write(swap.flags, u32(0));
          await ppsspp.write(swap.found.hunter + HUNTER_SLOT, swap.slot);
          await ppsspp.write(swap.found.hunter + HUNTER_MODEL, u16(swap.model));
          await ppsspp.write(swap.found.state, Buffer.from([0]));
          await ppsspp.write(swap.found.file, u16(0xffff));
          console.log(
            `The game didn't run the swap (paused?): equipped ${swap.label}, loaded on departing or going back.`,
          );
        } else console.log(`The swap to ${swap.label} started but didn't finish.`);
        return true;
      });
      if (done) return;
    }
  };

  /** Puts a random weapon in the equipment box. */
  const putInBox = () =>
    ppsspp.paused(async () => {
      const ram = await readRam(ppsspp);
      const found = findEquipped(ram);
      if (typeof found === "string") return console.log(found);
      const next = pick(weapons.get(found.id), () => true);
      if (!next) return console.log("No other weapon.");
      // The same slot as before while it still holds what was put there.
      if (!ours || !slotAt(ram, ours.at - RAM_START).equals(ours.slot)) {
        const free = Array.from({ length: BOX_SLOTS }, (_, i) => found.box + i * SLOT_SIZE).find(
          (at) => ram.readUInt16BE(at - RAM_START) === 0,
        );
        if (free === undefined) return console.log("The equipment box is full.");
        ours = { at: free, slot: Buffer.alloc(SLOT_SIZE) };
      }
      ours.slot = meleeSlot(next.id);
      await ppsspp.write(ours.at, ours.slot);
      const index = (ours.at - found.box) / SLOT_SIZE;
      console.log(`Box slot ${index + 1}: ${next.name} (${next.type}, ID ${next.id}).`);
    });

  console.log(`${weapons.size} melee weapons on ${disc}.`);
  console.log(
    "space/r: swap in another   b: another into the box   c: same class / any class   q: quit",
  );
  if (!process.stdin.isTTY) {
    await equip();
    ppsspp.close();
    return;
  }
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let busy = false;
  process.stdin.on("data", (key: Buffer) => {
    const k = key.toString();
    if ((k === "q" || k === "\u0003") && !busy) {
      ppsspp.close();
      process.exit(0);
    }
    if (busy) return;
    busy = true;
    const done = () => {
      busy = false;
    };
    if (k === " " || k === "r") void equip().catch(console.error).finally(done);
    else if (k === "b") void putInBox().catch(console.error).finally(done);
    else if (k === "c") {
      anyClass = !anyClass;
      console.log(anyClass ? "Any melee class." : "The equipped weapon's class.");
      done();
    } else done();
  });
}

main().catch(fail);
