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
 * Everything is found by code signatures, which match the EU and JP (FUC)
 * discs. The blob only reads game state.
 */
import { OVL_HEADER_SIZE, type OvlFile } from "mhfu-extract/src/container/ovl.js";
import { locateMonsterChunks } from "mhfu-extract/src/monsters/hitzones.js";
import { decodeObjects } from "../blob/link.js";
import { MONSTER_HP_OBJECTS } from "../blob/monster-hp-object.js";
import { findUnique, hiLo, jumpTarget, maskWord, type Segment } from "./mips.js";

export const MONSTER_HP_MODES = ["off", "painted", "always"] as const;
export type MonsterHpMode = (typeof MONSTER_HP_MODES)[number];
/** The blob's `rf_monster_hp_mode`; never 0 (see `blob/monster-hp.c`). */
const MODE = { painted: 1, always: 2 } as const;

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

/** The map's test (EU 0x08844578), masked: it reads `+4`, `+0x29A`, the HUD's floor and `+0x1E8`. */
export const MAP_SHOWS_SIGNATURE = [
  0x27bdfff0, 0xafbf0000, 0xafb20000, 0xafb10000, 0xafb00000, 0x00a08021, 0x16000003, 0x00808821,
  0x10000028, 0x00001021, 0x8e020000, 0x30420001, 0x0002102b, 0x54400003, 0x9605029a, 0x10000021,
  0x00001021, 0x0c000000, 0x92320578, 0x304200ff, 0x52420003, 0x920401e8, 0x1000001a, 0x00001021,
];

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

/** The blob's externs for monster HP, or why they can't be found. */
export function findMonsterHpExterns(
  vanillaEboot: Buffer,
  segment: Segment,
  gauges: number,
  gameTask: Buffer,
  ovl: OvlFile,
  mode: Exclude<MonsterHpMode, "off">,
): Record<string, number> | string {
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
  if (tableIn(calls.cap!, SPRITE_TABLE_WORDS.cap) !== sprites) {
    return "this EBOOT's HUD sprite code doesn't match";
  }

  const managers = new Set(
    findAll(gameTask, OVL_HEADER_SIZE, MANAGER_SIGNATURE, true)
      .filter((o) => word(gameTask, o + 20) === MANAGER_SLOTS_WORD)
      .map((o) => hiLo(word(gameTask, o + 8), word(gameTask, o + 12))),
  );
  if (managers.size !== 1) return "game_task's monster list code doesn't match";
  if (findAll(gameTask, OVL_HEADER_SIZE, PAINT_CODE, false).length !== 1) {
    return "game_task's paintball code doesn't match";
  }
  const chunks = locateMonsterChunks(ovl);
  if (!chunks) return "game_task's monster table wasn't found";

  return {
    rf_game_task: ovl.loadBase,
    rf_monsters: [...managers][0]!,
    rf_em_chunks: ovl.loadBase + chunks.offset,
    rf_hud_frame: calls.frame!,
    rf_hud_cap: calls.cap!,
    rf_hud_fill: calls.fill!,
    rf_map_shows: mapShows,
    rf_hud_sprite: sprite,
    rf_hud_sprites: sprites,
    rf_monster_hp_mode: MODE[mode],
  };
}

export const monsterHpObjects = () => decodeObjects(MONSTER_HP_OBJECTS);
