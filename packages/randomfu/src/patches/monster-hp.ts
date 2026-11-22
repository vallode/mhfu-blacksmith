/**
 * Monster HP (`hud.monsterHp`): a gauge per large monster in the hunter's
 * area, under the hunter's own, drawn by blob code (`blob/monster-hp.c`) on
 * the code loader's HUD hook (`game-hooks.ts`). This finds the game's
 * addresses the blob reads and calls, per disc.
 *
 * What the game does (found on the EU and JP discs, in PPSSPP's debugger):
 *
 * - A monster is an entity like the hunter: species id at `+0x1E8` (u8),
 *   HP at `+0x2E4` (s16) and max HP at `+0x41E`. The HUD's gauge function
 *   reads the hunter's HP and max HP from the same offsets.
 * - Paintballs set `+0x3D0` to 1 and `+0x3D2` to 18000 frames, which counts
 *   down and clears the flag (`game_task`: `li v1,1; sb v1,0x3d0(s1);
 *   li v1,0x4650; sh v1,0x3d2(s1)`).
 * - `game_task` keeps the quest's monsters, large and small, in a manager
 *   object behind a global: 20 entity pointers at `+0x1220`. A monster that
 *   leaves the hunter's area stays in it.
 * - The map's test for drawing a monster's icon (EU 0x08844578) is an EBOOT
 *   function `(hud, monster)`: bit 0 of the entity's `+4` (active), its area
 *   (`+0x29A`, u16, as on the hunter) on the map's floor, and
 *   the paint flag (or, for some species, a HUD state). The blob calls it for
 *   "painted", and checks the active bit and the hunter's area itself.
 * - `game_task`'s per-species table (see `locateMonsterChunks`) has a
 *   multiplier set at `+0x14F` that's 0 for small monsters.
 * - The gauge function draws with three EBOOT routines on the HUD object:
 *   a frame `(hud, x, y, w, h, sprite)` and a cap `(hud, x, y, sprite)` from
 *   the HUD's sprite table (12-byte records: u, v, w, h, texture, set), and
 *   a fill `(hud, x, y, w, h, r, g, b)`.
 * - Another EBOOT routine stretches any sprite to `(hud, x, y, w, h,
 *   sprite)`; the monster icon panel (EU 0x0882FDA4) draws its frame with
 *   it. The blob draws the gauge cap mirrored with it, from a sprite record
 *   of its own with a negative width. (The monster icons themselves, 36-pixel
 *   cells of cockpit texture 0x8002 found through a lookup the panel calls,
 *   were tried at the gauge's start and looked out of place at half size.)
 *
 * - A monster's size, in percent, is a u16 at `+0x274`: `game_task`
 *   (EU 0x09AB2D84) copies it from the quest's monster record (`+0x30`,
 *   where the size roll puts it), the model is scaled by it, and a kill or
 *   capture writes it to the quest's largest and smallest records (EBOOT
 *   0x0886AC48), which the Guild Card keeps. Two story quests grow a
 *   monster in place, and it's `+0x274` that grows.
 * - The Guild Card gives a crown by its check (EU 0x08853F84) against the
 *   crown table (mhfu-extract `monsters/sizes.ts`): at most `mini`, at least
 *   `gold`, else at least `silver`. An entry covers the emIDs its group
 *   lists (`u8*` by emID, EU 0x0899BF40, found through the lookup at
 *   0x0884FC74). The blob finds a monster's entry by its group and draws
 *   the HUD texture's crown sprites (31 silver, 32 gold, 16×12; there's no
 *   mini crown, so the gold one smaller) over the gauge's right end cap.
 *   Where the crown code isn't found, the gauge goes on without crowns.
 * - A captured monster lies asleep with health left until the quest ends.
 *   The quest object (`*0x08A62C7C`) keeps a 60-byte record per spawn,
 *   which an EBOOT lookup `(quest, monster)` (EU 0x0886DD3C) finds by the
 *   monster's area, `+0x1E6` and `+0x4AC`, or returns 0. The capture code
 *   (EU 0x0886AD58, `(quest, monster)`, called from 7 places in
 *   `game_task`) skips a record whose state (`+0x2E`, s16) has 8, and sets
 *   8 in it; the kill code before it (0x0886AB7C) skips one with 1 or 4,
 *   and makes it 1 or 4. The blob hides the gauge of a monster whose record
 *   has 8. Where the capture code isn't found, captured monsters keep it.
 *
 * Everything is found by code signatures, which match the EU and JP (FUC)
 * discs. The blob only reads game state.
 */
import { OVL_HEADER_SIZE, type OvlFile } from "mhfu-extract/src/container/ovl.js";
import { locateMonsterChunks } from "mhfu-extract/src/monsters/hitzones.js";
import { decodeObjects } from "../blob/link.js";
import { MONSTER_HP_OBJECTS } from "../blob/monster-hp-object.js";
import { findUnique, hiLo, jumpTarget, maskImmediates, maskWord, type Segment } from "./mips.js";

export const MONSTER_HP_MODES = ["off", "painted", "always"] as const;
export type MonsterHpMode = (typeof MONSTER_HP_MODES)[number];
/** The blob's `rf_monster_hp_mode` (`blob/monster-hp.c`): its mode + 1, as an extern's address is never 0. */
export const MODE = { off: 1, painted: 2, always: 3 } as const;

/**
 * `game_task`'s lookup of a manager slot: `andi v0,a0,0xf; sll v1,v0,2;
 * lui v0,hi; lw v0,lo(v0); addu v0,v1,v0; lw v0,0x1220(v0)…`, masked.
 */
export const MANAGER_SIGNATURE = [
  0x3082000f, 0x00021880, 0x3c020000, 0x8c420000, 0x00621021, 0x8c420000, 0x54400004, 0x24420200,
];
const MANAGER_SLOTS_WORD = 0x8c421220;
/** `li v1,1; sb v1,0x3d0(s1); li v1,0x4650; sh v1,0x3d2(s1)`. */
export const PAINT_CODE = [0x24030001, 0xa22303d0, 0x24034650, 0xa62303d2];

/** In the gauge function: exact words that pin the fields, and its draw calls. */
const GAUGE_WORDS: readonly [number, number][] = [
  [0xe4, 0x8464041e], // lh a0, 0x41e(v1): max HP
  [0x180, 0x846202e4], // lh v0, 0x2e4(v1): HP
];
const GAUGE_CALLS = { frame: 0x150, cap: 0x174, fill: 0x220 } as const;
/**
 * The monster icon panel (EU 0x0882FDA4): `sprite(hud, x, y, 0x58, 0x40,
 * 0xAF)`, `entry = lookup(hud, em)`, then the icon from `entry[1]`, `entry[2]`.
 */
export const ICON_PANEL_SIGNATURE = [
  0x27bdffe0, 0xafbf0000, 0xafb30000, 0xafb20000, 0xafb10000, 0xafb00000, 0x00e08821, 0x00808021,
  0x00a09821, 0x00c09021, 0x24070000, 0x24080000, 0x0c000000, 0x24090000, 0x02202821, 0x0c000000,
  0x02002021, 0x5040000c, 0x8fbf0000, 0x3263ffff, 0x24630014, 0x3065ffff, 0x3243ffff, 0x24630007,
  0x90470001, 0x90480002,
];
const ICON_PANEL_SPRITE_CALL = 0x30;
/** The sprite table's address: `lui` and `addiu` in the cap and stretch routines. */
const SPRITE_TABLE_WORDS = { cap: [0x20, 0x28], sprite: [0x28, 0x30] } as const;

/**
 * The crown group lookup (EU 0x0884FC74) and the one after it, immediates
 * masked: `andi v0,a1,0xff; sll v1,v0,2; lui v0,hi; addiu v0,v0,lo;
 * addu v0,v0,v1; lw v0,0(v0); jr ra; lbu v0,0(v0)`, then the same without
 * the `lbu`. `hi`/`lo` (words 2 and 3) are the group table.
 */
export const CROWN_GROUPS_SIGNATURE = [
  0x30a200ff, 0x00021880, 0x3c02089a, 0x2442bf40, 0x00431021, 0x8c420000, 0x03e00008, 0x90420000,
  0x30a200ff, 0x00021880, 0x3c02089a, 0x2442bf40, 0x00431021, 0x03e00008,
].map(maskImmediates);
/**
 * The Guild Card's crown check (EU 0x08853F84), immediates masked: `lbu
 * a1,0(s1); lui v0,hi; addiu v0,v0,lo; a0 = a1 × 14 + v0; lh v0,8(a0)` (the
 * mini threshold), `slt`, then `lh v0,6(a0)` (gold). `hi`/`lo` (words 1 and
 * 2) are the crown table.
 */
export const CROWN_CHECK_SIGNATURE = [
  0x92250000, 0x3c020893, 0x24420bdc, 0x000520c0, 0x00852023, 0x00042040, 0x00442021, 0x84820008,
  0x3203ffff, 0x0043082a, 0x5420000b, 0x84820006,
].map(maskImmediates);
/** The crown table's offsets the check reads, kept exact: mini at 8, gold at 6. */
const CROWN_CHECK_WORDS: readonly [number, number][] = [
  [0x1c, 0x84820008],
  [0x2c, 0x84820006],
];

/** The map's test (EU 0x08844578), masked: it reads `+4`, `+0x29A`, the HUD's floor and `+0x1E8`. */
export const MAP_SHOWS_SIGNATURE = [
  0x27bdfff0, 0xafbf0000, 0xafb20000, 0xafb10000, 0xafb00000, 0x00a08021, 0x16000003, 0x00808821,
  0x10000028, 0x00001021, 0x8e020000, 0x30420001, 0x0002102b, 0x54400003, 0x9605029a, 0x10000021,
  0x00001021, 0x0c000000, 0x92320578, 0x304200ff, 0x52420003, 0x920401e8, 0x1000001a, 0x00001021,
];

/**
 * The capture code (EU 0x0886AD58), immediates masked: `addiu sp,sp,-16`,
 * saves, `move s2,a0; move s1,a1; jal lookup; sw s0,0(sp); beqz v0;
 * move s0,v0; lh v0,0x2e(s0); andi v0,v0,8; beqzl v0; lbu v0,0x1e8(s1)`.
 * The kill code has the same start with `andi v0,v0,5` and `lb v0,4(s0)`.
 */
export const CAPTURE_SIGNATURE = [
  0x27bdfff0, 0xafbf000c, 0xafb20008, 0xafb10004, 0x00809021, 0x00a08821, 0x0e21b74f, 0xafb00000,
  0x10400056, 0x00408021, 0x8602002e, 0x30420008, 0x50400006, 0x922201e8,
].map(maskImmediates);
/** Kept exact: the record's state, the captured bit, and the monster's species. */
const CAPTURE_WORDS: readonly [number, number][] = [
  [0x28, 0x8602002e],
  [0x2c, 0x30420008],
  [0x34, 0x922201e8],
];
const CAPTURE_LOOKUP_CALL = 0x18;

const word = (buf: Buffer, at: number) => buf.readUInt32LE(at);

function findAll(buf: Buffer, from: number, signature: readonly number[], masked: boolean) {
  const found: number[] = [];
  for (let at = from; at + signature.length * 4 <= buf.length; at += 4) {
    let k = 0;
    while (
      k < signature.length &&
      (masked ? maskWord(word(buf, at + k * 4)) : word(buf, at + k * 4)) === signature[k]
    ) {
      k++;
    }
    if (k === signature.length) found.push(at);
  }
  return found;
}

/** The HUD's gauge routines the gauge function calls: frame, cap and fill. */
export function findGaugeRoutines(
  vanillaEboot: Buffer,
  segment: Segment,
  gauges: number,
): Record<keyof typeof GAUGE_CALLS, number> | string {
  const at = segment.offset + (gauges - segment.vaddr);
  if (GAUGE_WORDS.some(([offset, w]) => word(vanillaEboot, at + offset) !== w)) {
    return "this EBOOT's gauge code doesn't match";
  }
  const calls = Object.fromEntries(
    Object.entries(GAUGE_CALLS).map(([name, offset]) => {
      const w = word(vanillaEboot, at + offset);
      return [name, w >>> 26 === 0x03 ? jumpTarget(w, gauges + offset) : null];
    }),
  ) as Record<keyof typeof GAUGE_CALLS, number | null>;
  if (Object.values(calls).some((target) => target === null)) {
    return "this EBOOT's gauge code doesn't match";
  }
  return calls as Record<keyof typeof GAUGE_CALLS, number>;
}

/**
 * The blob's externs for `game_task`'s monsters (`blob/monster-hp.c`,
 * `blob/monsters.c`): the overlay, its monster manager's global and its
 * species table.
 */
export function findMonsterExterns(
  gameTask: Buffer,
  ovl: OvlFile,
): Record<string, number> | string {
  const managers = new Set(
    findAll(gameTask, OVL_HEADER_SIZE, MANAGER_SIGNATURE, true)
      .filter((o) => word(gameTask, o + 20) === MANAGER_SLOTS_WORD)
      .map((o) => hiLo(word(gameTask, o + 8), word(gameTask, o + 12))),
  );
  if (managers.size !== 1) return "game_task's monster list code doesn't match";
  const chunks = locateMonsterChunks(ovl);
  if (!chunks) return "game_task's monster table wasn't found";
  return {
    rf_game_task: ovl.loadBase,
    rf_monsters: [...managers][0]!,
    rf_em_chunks: ovl.loadBase + chunks.offset,
  };
}

/**
 * The quest object's global and its spawn record lookup, from the capture
 * code and `game_task`'s calls to it (`lui r,hi; lw a0,lo(r); jal capture`);
 * none if they aren't found, and then captured monsters keep their gauge.
 */
export function findCaptureExterns(
  vanillaEboot: Buffer,
  segment: Segment,
  gameTask: Buffer,
  ovl: OvlFile,
): Record<string, number> {
  const [capture] = findUnique(vanillaEboot, segment, [CAPTURE_SIGNATURE], maskImmediates);
  if (capture == null) return {};
  const at = segment.offset + (capture - segment.vaddr);
  if (CAPTURE_WORDS.some(([o, w]) => word(vanillaEboot, at + o) !== w)) return {};
  const lookup = jumpTarget(
    word(vanillaEboot, at + CAPTURE_LOOKUP_CALL),
    capture + CAPTURE_LOOKUP_CALL,
  );

  const quests = new Set<number>();
  for (let o = OVL_HEADER_SIZE + 8; o + 4 <= gameTask.length; o += 4) {
    const w = word(gameTask, o);
    if (w >>> 26 !== 0x03 || jumpTarget(w, ovl.loadBase + o) !== capture) continue;
    const lw = word(gameTask, o - 4);
    const lui = word(gameTask, o - 8);
    const base = (lw >>> 21) & 31;
    if (lw >>> 26 !== 0x23 || ((lw >>> 16) & 31) !== 4) return {};
    if (lui >>> 26 !== 0x0f || ((lui >>> 16) & 31) !== base) return {};
    quests.add(hiLo(lui, lw));
  }
  if (quests.size !== 1) return {};
  return { rf_quest: [...quests][0]!, rf_spawn_record: lookup };
}

/** The blob's externs for monster HP, or why they can't be found. */
export function findMonsterHpExterns(
  vanillaEboot: Buffer,
  segment: Segment,
  gauges: number,
  gameTask: Buffer,
  ovl: OvlFile,
  mode: MonsterHpMode,
): Record<string, number> | string {
  const calls = findGaugeRoutines(vanillaEboot, segment, gauges);
  if (typeof calls === "string") return calls;

  const [mapShows, iconPanel] = findUnique(vanillaEboot, segment, [
    MAP_SHOWS_SIGNATURE,
    ICON_PANEL_SIGNATURE,
  ]);
  if (mapShows == null) return "this EBOOT's map code doesn't match";
  if (iconPanel == null) return "this EBOOT's sprite code doesn't match";
  const at32 = (vaddr: number) => word(vanillaEboot, segment.offset + (vaddr - segment.vaddr));
  const callAt = (vaddr: number) => jumpTarget(at32(vaddr), vaddr);
  const sprite = callAt(iconPanel + ICON_PANEL_SPRITE_CALL);
  const tableIn = (fn: number, [lui, addiu]: readonly number[]) =>
    hiLo(at32(fn + lui!), at32(fn + addiu!));
  const sprites = tableIn(sprite, SPRITE_TABLE_WORDS.sprite);
  if (tableIn(calls.cap, SPRITE_TABLE_WORDS.cap) !== sprites) {
    return "this EBOOT's HUD sprite code doesn't match";
  }

  // Crowns are extra: without their code the gauge links with no crowns (weak externs).
  const [groups, check] = findUnique(
    vanillaEboot,
    segment,
    [CROWN_GROUPS_SIGNATURE, CROWN_CHECK_SIGNATURE],
    maskImmediates,
  );
  const crowns: Record<string, number> =
    groups == null || check == null || CROWN_CHECK_WORDS.some(([o, w]) => at32(check + o) !== w)
      ? {}
      : {
          rf_crowns: hiLo(at32(check + 4), at32(check + 8)),
          rf_crown_groups: hiLo(at32(groups + 8), at32(groups + 12)),
        };

  const monsters = findMonsterExterns(gameTask, ovl);
  if (typeof monsters === "string") return monsters;
  const capture = findCaptureExterns(vanillaEboot, segment, gameTask, ovl);
  if (findAll(gameTask, OVL_HEADER_SIZE, PAINT_CODE, false).length !== 1) {
    return "game_task's paintball code doesn't match";
  }

  return {
    ...monsters,
    rf_hud_frame: calls.frame,
    rf_hud_cap: calls.cap,
    rf_hud_fill: calls.fill,
    rf_map_shows: mapShows,
    rf_hud_sprite: sprite,
    rf_hud_sprites: sprites,
    ...crowns,
    ...capture,
    rf_monster_hp_mode: MODE[mode],
  };
}

export const monsterHpObjects = () => decodeObjects(MONSTER_HP_OBJECTS);
