/**
 * Code loader (prototype): turns the save space freed by capping Guild Cards
 * (`guild-card-space.ts`) into room for randomfu's own code and data, a
 * "blob" read from a file randomfu adds to the disc. See
 * `docs/code-loader.md` for the design.
 *
 * What the game does (found on the EU and JP discs):
 *
 * - The save struct sits at a fixed address (see `guild-card-space.ts`), so
 *   the freed slots do too, and blob code is linked to run there.
 * - Loading a save copies the character's persistent part into the struct
 *   with `memcpy(save + 0x4A0, buffer + 0x1000 + slot × 0x6B100, 0x6A938)`,
 *   at two sites in the EBOOT. Creating a character clears all 96 Guild
 *   Cards with `memset(save + 0x4A58, 0, 0x62D00)`, in an EBOOT function
 *   `edit_task.ovl` calls. Both overwrite the freed slots, so the blob is
 *   gone after either.
 * - The EBOOT imports `sceIoOpen`, `sceIoRead` and `sceIoClose` (it opens
 *   `disc0:/PSP_GAME/USRDIR/DATA.BIN` with them) and the cache calls
 *   `sceKernelDcacheWritebackAll` and `sceKernelIcacheInvalidateAll`. Their
 *   stubs are found by NID through the module info.
 *
 * The patch adds `RANDOMFU.BIN` to `/PSP_GAME/USRDIR` and puts a loader in
 * the Guild Card cave. Each of the three sites above calls the loader instead
 * of `memcpy`/`memset`; the loader makes the game's call, then reads the file
 * over the freed slots, checks its header (magic, size, and the build id the
 * patch baked in), syncs the caches and calls the blob's `rf_init(reason,
 * save, blob)`. A file that's missing or doesn't match leaves the header's
 * magic zeroed, so game hooks into the blob can tell it isn't there.
 *
 * Everything is found by code signatures, which match the EU and JP (FUC)
 * EBOOTs, and nothing is patched if one doesn't match.
 */
import { BLOB_MAGIC, HEADER, linkBlob } from "../blob/link.js";
import type { Edits } from "../edits.js";
import type { LoadedOverlay } from "../game/load.js";
import type { ShuffleReport } from "../shuffles/shuffle.js";
import {
  HOOK,
  assembleHooks,
  assemblePickHook,
  hookCode,
  writeHitCall,
  writeMenuCalls,
  writeHookCalls,
  writePickHook,
  writeQuestLoadCalls,
  type HitSite,
  type MenuSites,
  type HookSites,
  type PadSites,
  type PickSite,
  type QuestLoadSites,
} from "./game-hooks.js";
import { SAVE_DATA, guildCardSpace } from "./guild-card-space.js";
import {
  ADDIU,
  ADDU,
  Assembler,
  BEQ,
  BLTZ,
  BNE,
  JALR,
  JR,
  LUI,
  LW,
  ORI,
  R,
  RA,
  REGIMM,
  S,
  SP,
  SW,
  codeSegment,
  hi16,
  jumpTarget,
  type Segment,
} from "./mips.js";

/** The blob's file on the disc, and the path the loader opens. */
export const BLOB_ISO_PATH = "/PSP_GAME/USRDIR/RANDOMFU.BIN";
export const BLOB_DEVICE_PATH = "disc0:/PSP_GAME/USRDIR/RANDOMFU.BIN";

/** `rf_init`'s first argument. */
export const REASON = { saveLoaded: 0, newGame: 1 } as const;

/** Import NIDs, as this game's EBOOT has them. */
export const NIDS = {
  sceIoOpen: 0x109f50bc,
  sceIoRead: 0x6a638d83,
  sceIoClose: 0x810c4bc3,
  sceKernelDcacheWritebackAll: 0x79d1c3fa,
  sceKernelIcacheInvalidateAll: 0x920f104a,
} as const;
export type Imports = Record<keyof typeof NIDS, number>;

const PSP_O_RDONLY = 1;

/**
 * The loader's status words, in the cave after the path: how many times it
 * ran, the last reason, and what `sceIoOpen` and `sceIoRead` returned (−1
 * before a read). A savestate shows from these why a blob didn't load.
 */
export const STATUS = { runs: 0, reason: 4, open: 8, read: 12 } as const;
const STATUS_WORDS = 4;
const word = (buf: Buffer, at: number) => buf.readUInt32LE(at);

/**
 * Every imported function's stub, by NID. The module info's file offset is
 * the first program header's `p_paddr`; its stub table lists each library's
 * NIDs and stubs.
 */
export function findImports(elf: Buffer, segment: Segment): Map<number, number> {
  const stubs = new Map<number, number>();
  const phoff = elf.readUInt32LE(0x1c);
  const info = elf.readUInt32LE(phoff + 12);
  if (info + 0x34 > elf.length) return stubs;
  const offsetOf = (vaddr: number) => segment.offset + (vaddr - segment.vaddr);
  const inSegment = (vaddr: number) =>
    vaddr >= segment.vaddr && vaddr < segment.vaddr + segment.size;
  const top = word(elf, info + 0x2c);
  const bottom = word(elf, info + 0x30);
  if (!inSegment(top) || !inSegment(bottom - 1)) return stubs;
  for (let at = top; at < bottom;) {
    const o = offsetOf(at);
    const size = elf[o + 8]!;
    const count = elf.readUInt16LE(o + 10);
    const nids = word(elf, o + 12);
    const first = word(elf, o + 16);
    if (size === 0 || !inSegment(nids)) break;
    for (let k = 0; k < count; k++) stubs.set(word(elf, offsetOf(nids) + k * 4), first + k * 8);
    at += size * 4;
  }
  return stubs;
}

/** Where the game copies a loaded character into the save, and its `memcpy`. */
export interface Sites {
  /** `jal memcpy` at each save load (offsets into the ELF). */
  loads: number[];
  /** `jal memset` clearing the Guild Cards for a new character. */
  newGame: number[];
}

/**
 * Save load: `addiu $a1, $v0, 0x1000; lui $v0, 6; jal memcpy; ori $a2, $v0,
 * 0xA938`. New character: `addiu $a0, $sX, 0x4A58; move $a1, $zero; jal
 * memset; ori $a2, $v0, 0x2D00`. Offsets of the `jal`s in `code`.
 */
export function findSites(code: Buffer): Sites {
  const loads: number[] = [];
  const newGame: number[] = [];
  for (let at = 8; at + 8 <= code.length; at += 4) {
    if (word(code, at) >>> 26 !== 0x03) continue;
    const before2 = word(code, at - 8);
    const before = word(code, at - 4);
    const after = word(code, at + 4);
    if (before2 === 0x24450000 + 0x1000 && before === 0x3c020006 && after === 0x3446a938) {
      loads.push(at);
    }
    if ((before2 & 0xfc1fffff) === 0x24044a58 && before === 0x00002821 && after === 0x34462d00) {
      newGame.push(at);
    }
  }
  return { loads, newGame };
}

export interface LoaderAddresses {
  /** The save struct (fixed). */
  saveStruct: number;
  /** Where the blob goes (fixed): its header's address. */
  blob: number;
  /** The most the loader reads. */
  room: number;
  /** The blob's build id, which its header must carry. */
  build: number;
  memcpy: number;
  memset: number;
  imports: Imports;
}

/**
 * The loader at `at`: the path string, then `load(reason)` and the two entry
 * points the game's call sites jump to instead of `memcpy` and `memset`.
 */
export function assembleLoader(
  at: number,
  addresses: LoaderAddresses,
): { code: number[]; afterLoad: number; afterNewGame: number; status: number } {
  const a = new Assembler();
  const { zero, v0, a0, a1, a2, t0, t1, t9 } = R;
  const [s0, s1, s2, s3] = S;
  const move = (rd: number, rs: number) => a.r(rs, zero, rd, 0, ADDU);
  const nop = () => a.emit(0);
  const li = (reg: number, value: number) => {
    a.i(LUI, zero, reg, value >>> 16);
    a.i(ORI, reg, reg, value & 0xffff);
  };
  const la = (reg: number, address: number) => {
    a.i(LUI, zero, reg, hi16(address));
    a.i(ADDIU, reg, reg, address & 0xffff);
  };
  const { imports } = addresses;

  // The path, NUL-terminated and word-padded, first so its address is known.
  const path = Buffer.alloc(Math.ceil((BLOB_DEVICE_PATH.length + 1) / 4) * 4);
  path.write(BLOB_DEVICE_PATH, "latin1");
  for (let k = 0; k < path.length; k += 4) a.emit(path.readUInt32LE(k));
  a.label("status");
  for (let k = 0; k < STATUS_WORDS; k++) a.emit(0);
  const status = at + a.offsetOf("status") * 4;

  // Entry points: make the game's call, then load. `$v0` is kept for the caller.
  for (const [label, original, reason] of [
    ["afterLoad", addresses.memcpy, REASON.saveLoaded],
    ["afterNewGame", addresses.memset, REASON.newGame],
  ] as const) {
    a.label(label);
    a.i(ADDIU, SP, SP, -16);
    a.i(SW, SP, RA, 12);
    a.jal(original);
    nop();
    a.i(SW, SP, v0, 8);
    a.jalLabel("load");
    a.i(ADDIU, zero, a0, reason);
    a.i(LW, SP, v0, 8);
    a.i(LW, SP, RA, 12);
    a.r(RA, zero, zero, 0, JR);
    a.i(ADDIU, SP, SP, 16);
  }

  // load(reason): read the file over the blob's room, check it, run rf_init.
  // Its frame leaves sp+0..15 free: blob code is O32, whose callees may store
  // their arguments in the caller's frame there.
  const frame = { read: 16, s3: 20, s2: 24, s1: 28, s0: 32, ra: 36, size: 40 } as const;
  const saved = [
    [RA, frame.ra],
    [s0, frame.s0],
    [s1, frame.s1],
    [s2, frame.s2],
    [s3, frame.s3],
  ] as const;
  a.label("load");
  a.i(ADDIU, SP, SP, -frame.size);
  for (const [reg, offset] of saved) a.i(SW, SP, reg, offset);
  move(s2, a0);
  la(t0, status);
  a.i(LW, t0, t1, STATUS.runs);
  a.i(ADDIU, t1, t1, 1);
  a.i(SW, t0, t1, STATUS.runs);
  a.i(SW, t0, a0, STATUS.reason);
  a.i(ADDIU, zero, t1, -1);
  a.i(SW, t0, t1, STATUS.read);
  la(s0, addresses.saveStruct);
  la(s1, addresses.blob);
  la(a0, at);
  a.i(ADDIU, zero, a1, PSP_O_RDONLY);
  a.jal(imports.sceIoOpen);
  move(a2, zero);
  la(t0, status);
  a.i(SW, t0, v0, STATUS.open);
  a.branch(REGIMM, v0, BLTZ, "missing");
  move(s3, v0);
  move(a0, s3);
  move(a1, s1);
  li(a2, addresses.room);
  a.jal(imports.sceIoRead);
  nop();
  la(t0, status);
  a.i(SW, t0, v0, STATUS.read);
  a.i(SW, SP, v0, frame.read);
  a.jal(imports.sceIoClose);
  move(a0, s3);
  // The whole file, and a header that matches: magic, size and build.
  a.i(LW, SP, t0, frame.read);
  a.i(LW, s1, t1, HEADER.size);
  a.branch(BNE, t0, t1, "missing");
  a.i(LW, s1, t0, HEADER.magic);
  li(t1, BLOB_MAGIC);
  a.branch(BNE, t0, t1, "missing");
  a.i(LW, s1, t0, HEADER.build);
  li(t1, addresses.build);
  a.branch(BNE, t0, t1, "missing");
  nop();
  // New code: write the data cache back, then drop stale instructions.
  a.jal(imports.sceKernelDcacheWritebackAll);
  nop();
  a.jal(imports.sceKernelIcacheInvalidateAll);
  nop();
  a.i(LW, s1, t9, HEADER.init);
  move(a0, s2);
  move(a1, s0);
  a.r(t9, zero, RA, 0, JALR);
  move(a2, s1);
  a.branch(BEQ, zero, zero, "done");
  nop();
  a.label("missing");
  a.i(SW, s1, zero, HEADER.magic);
  a.label("done");
  for (const [reg, offset] of saved) a.i(LW, SP, reg, offset);
  a.r(RA, zero, zero, 0, JR);
  a.i(ADDIU, SP, SP, frame.size);

  return {
    code: a.link(at),
    afterLoad: at + a.offsetOf("afterLoad") * 4,
    afterNewGame: at + a.offsetOf("afterNewGame") * 4,
    status,
  };
}

const TITLE = "Code loader";

export interface CodeLoaderOptions {
  /** The blob's relocatable objects (see `src/blob/`). */
  objects: readonly { name: string; data: Buffer }[];
  /** Guild Cards to keep. */
  keptCards?: number;
  /**
   * The game hooks (`game-hooks.ts`) the blob's `rf_hookN` run on, found in
   * `game_task` by the caller; `questLoad` also hooks the quest loader's calls
   * (hook 3) in `lobby_task` and `game_task`, and `hit` the monster hit
   * function's call (hook 7) in `game_sub`.
   */
  hooks?: {
    /** Every hook's sites, or the pad hook's alone (`findPadSites`). */
    sites: HookSites | PadSites;
    /** `game_task`, which every hook but the pad's (and the picker) patches. */
    gameTask?: LoadedOverlay;
    questLoad?: { sites: QuestLoadSites; lobbyTask: LoadedOverlay };
    /** The game's picker, for a blob that defines `rf_hook5` (hook 5). */
    pick?: PickSite;
    /** `lobby_task`'s call to the quest card (hook 6): its file offset and the card. */
    questCard?: { call: number; card: number; lobbyTask: LoadedOverlay };
    hit?: HitSite;
    /** The START menus' calls (hook 8), for randomfu's own entry. */
    menus?: readonly MenuSites[];
  };
  /** The blob's externs that are found per disc. */
  externs?: Readonly<Record<string, number>>;
  /** Tables built per disc, linked after the code under these names (`linkBlob`). */
  data?: Readonly<Record<string, Buffer>>;
}

export interface CodeLoaderReport extends ShuffleReport {
  applied: boolean;
  /** Guild Cards kept, when applied. */
  kept?: number;
}

/**
 * Adds the loader to the EBOOT and the linked blob to the disc. The report
 * says whether it was applied: it isn't when the EBOOT wasn't loaded or any
 * code doesn't match.
 */
export function addCodeLoader(
  vanillaEboot: Buffer | null,
  gameSub: LoadedOverlay,
  edits: Edits,
  options: CodeLoaderOptions,
): CodeLoaderReport {
  const skipped = (why: string): CodeLoaderReport => ({
    applied: false,
    title: TITLE,
    notes: [`The code loader isn't in this image: ${why}.`],
    lines: [],
    summary: `${TITLE}: not applied (${why})`,
  });
  if (!vanillaEboot) return skipped("the EBOOT wasn't loaded");
  const segment = codeSegment(vanillaEboot);
  if (!segment) return skipped("the EBOOT isn't an ELF");

  const code = vanillaEboot.subarray(0, segment.offset + segment.size);
  const sites = findSites(code);
  if (sites.loads.length !== 2 || sites.newGame.length !== 1) {
    return skipped("this EBOOT's save loading code doesn't match");
  }
  const vaddrOf = (offset: number) => segment.vaddr + (offset - segment.offset);
  const targets = (offsets: number[]) => [
    ...new Set(offsets.map((o) => jumpTarget(word(code, o), vaddrOf(o)))),
  ];
  const [memcpy, ...otherCopies] = targets(sites.loads);
  const [memset] = targets(sites.newGame);
  if (memcpy === undefined || otherCopies.length > 0 || memset === undefined) {
    return skipped("this EBOOT's save loading code doesn't match");
  }

  const stubs = findImports(vanillaEboot, segment);
  const imports = Object.fromEntries(
    Object.entries(NIDS).map(([name, nid]) => [name, stubs.get(nid)]),
  ) as Partial<Imports>;
  if (Object.values(imports).some((stub) => stub === undefined)) {
    return skipped("this EBOOT doesn't import the file and cache calls");
  }

  const { hooks } = options;

  const space = guildCardSpace(vanillaEboot, gameSub, edits, options.keptCards);
  if (typeof space === "string") return skipped(space);
  // Check that the loader and blob fit what other features left, before taking any.
  // The last slot is randomfu's save data in every build, so the blob never covers it.
  const free = space.freeSlots;
  const room = free ? Math.min(free.end, SAVE_DATA) - free.start : 0;
  if (!free || room <= 0) return skipped("other features took every freed Guild Card slot");
  const blobAddress = space.saveStruct + free.start;
  const blob = linkBlob(
    options.objects,
    blobAddress,
    { ...(imports as Imports), ...options.externs },
    Infinity,
    options.data,
  );
  if (blob.image.length > room) {
    return skipped(`the blob is ${blob.image.length} bytes, and ${room} are free`);
  }
  const addresses: LoaderAddresses = {
    saveStruct: space.saveStruct,
    blob: blobAddress,
    room,
    build: blob.build,
    memcpy,
    memset,
    imports: imports as Imports,
  };
  const words = assembleLoader(0, addresses).code.length;
  const calls: { hook: number; target: number }[] = [
    ...(hooks ? hookCode(hooks.sites) : []),
    ...(hooks?.questCard ? [{ hook: HOOK.questCard, target: hooks.questCard.card }] : []),
  ];
  const questLoader = hooks?.questLoad?.sites.loader;
  const hit = hooks?.hit?.target;
  const hookWords = hooks
    ? assembleHooks(0, blobAddress, calls, questLoader, hit, hooks.menus).code.length
    : 0;
  const pickWords = hooks?.pick ? assemblePickHook(0, blobAddress, hooks.pick).length : 0;
  const caveWords = words + hookWords + pickWords;
  if (caveWords > space.freeCaveWords) {
    return skipped(`the loader needs ${caveWords} cave words, and ${space.freeCaveWords} are free`);
  }
  space.reserveSaveData();
  space.allocateSlots(null);
  const at = space.allocateCave(words);
  const loader = assembleLoader(at, addresses);
  space.writeCave(at, loader.code);

  const out = edits.eboot();
  const jal = (target: number) => ((0x03 << 26) | ((target >>> 2) & 0x03ffffff)) >>> 0;
  for (const site of sites.loads) out.writeUInt32LE(jal(loader.afterLoad), site);
  for (const site of sites.newGame) out.writeUInt32LE(jal(loader.afterNewGame), site);
  edits.discFile(BLOB_ISO_PATH, blob.image);

  const hex = (n: number) => `0x${n.toString(16)}`;
  let hooksAt = "";
  if (hooks) {
    const hookAt = space.allocateCave(hookWords);
    const hookStubs = assembleHooks(hookAt, blobAddress, calls, questLoader, hit, hooks.menus);
    space.writeCave(hookAt, hookStubs.code);
    const gameTask = hooks.gameTask ? edits.overlay(hooks.gameTask) : null;
    writeHookCalls(out, gameTask, hooks.sites, hookStubs.stubs);
    if (hooks.questCard) {
      const lobbyTask = edits.overlay(hooks.questCard.lobbyTask);
      lobbyTask.writeUInt32LE(jal(hookStubs.stubs[calls.length - 1]!), hooks.questCard.call);
    }
    if (hooks.questLoad && hookStubs.questLoad) {
      if (!gameTask) throw new Error("The quest load hook needs game_task");
      const lobbyTask = edits.overlay(hooks.questLoad.lobbyTask);
      writeQuestLoadCalls(lobbyTask, gameTask, hooks.questLoad.sites, hookStubs.questLoad);
    }
    if (hooks.hit && hookStubs.hit !== undefined) {
      writeHitCall(edits.overlay(gameSub), hooks.hit, hookStubs.hit);
    }
    for (const [k, menu] of (hooks.menus ?? []).entries()) {
      writeMenuCalls(out, segment, menu, hookStubs.menus[k]!);
    }
    hooksAt = `, hooks ${hex(hookAt)}`;
    if (hooks.pick) {
      const pickAt = space.allocateCave(pickWords);
      space.writeCave(pickAt, assemblePickHook(pickAt, blobAddress, hooks.pick));
      writePickHook(out, segment, hooks.pick, pickAt);
      hooksAt += `, picker ${hex(pickAt)}`;
    }
  }
  return {
    applied: true,
    kept: space.kept,
    title: TITLE,
    notes: [
      `Guild Cards are capped at ${space.kept}. A ${blob.image.length}-byte blob from ${BLOB_ISO_PATH} is loaded at ${hex(blobAddress)} after every save load and new game.`,
    ],
    lines: [],
    summary: `${TITLE}: on (blob ${blob.image.length} of ${room} bytes at ${hex(blobAddress)}, loader ${hex(at)}${hooksAt}, status ${hex(loader.status)}, build ${hex(blob.build)})`,
  };
}
