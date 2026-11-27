/**
 * Attack hitboxes (`hud.attackHitboxes`): every monster attack that can hit
 * right now, its shapes filled in translucent red over the scene by blob code
 * (`blob/hitboxes.c`) on the code loader's HUD hook (`game-hooks.ts`). This
 * finds the game's addresses the blob reads and calls, per disc.
 *
 * What the game does (EU addresses; found statically and checked on
 * savestates of a Yian Kut-Ku fight):
 *
 * - A monster's attacks are attack objects (`docs/monster-ai.md`), kept in a
 *   list behind a `game_task` global (EU 0x09C18FD0): the first at `+0x502C`,
 *   the next at `+4`. Each frame `game_sub` tests every object whose `+0x14`
 *   is 2 against the hunters (EU 0x09C41E58 → 0x09C425E0 → 0x09C42650). An
 *   object's owner is `+0x15`, a monster manager slot when `+0xF` isn't 0
 *   (else a hunter, and none when `+0xE` is 0xFF); its area is `+0x18`, as
 *   an entity's `+0x29A`; its shapes are at `+0x34`.
 * - Shapes are the hurtboxes' 0x28-byte records (`mhfu-extract`'s
 *   `monsters/collision.ts`). `game_sub` places one in the world (EU
 *   0x09C37798) with the owner's joint matrix, `*(m + 0x190) + joint × 0x250
 *   + 0xD0` (4×4, row vectors), the radius times the model's scale
 *   `+0x220`. Joint 0x7E is a capsule between the object's own `+0x40` and
 *   `+0x50` (projectiles), 0x7F offsets from `+0x40`; 0x7D is placed by its
 *   owner's code and isn't drawn.
 * - The renderer behind an EBOOT global (EU 0x089CBBE4) keeps the camera's
 *   view matrix at `+0xB80` (the camera's look-at writes it, EU 0x08814340)
 *   and the 3D projection at `+0xC00` (which the draw loop, EU 0x0884BB58,
 *   sends to the GE). The GE's own view matrix is the identity: the game
 *   folds the view into every model's world matrix.
 * - The HUD's translucent fill, `fill(hud, x, y, w, h, r, g, b, alpha)` (EU
 *   0x0882D8DC; the Hunter's Pact shades the screen with it), draws an RGBA
 *   rectangle in its current layer. The blob fills each shape's outline on
 *   screen with it, in strips 2 pixels tall, clipped to the screen first
 *   (coordinates are u16). The HUD also has an opaque line routine (EU
 *   0x0882DAC0, 5551 colour), tried first: outlines read as too loud.
 *
 * Every address is found by code signature, which match the EU and JP
 * (FUC) discs. The blob only reads game state.
 */
import { OVL_HEADER_SIZE, type OvlFile } from "mhfu-extract/src/container/ovl.js";
import { decodeObjects } from "../blob/link.js";
import { HITBOXES_OBJECTS } from "../blob/hitboxes-object.js";
import { findMonsterExterns } from "./monster-hp.js";
import { FILL_SIGNATURE } from "./hud-text.js";
import { findUnique, hiLo, maskWord, type Segment } from "./mips.js";

/** The attack list's offset in the pool. */
const ATTACK_LIST = 0x502c;

/**
 * The draw loop sending the projection: `lui; lw a0,dl; lui; lui; lw t9,
 * renderer; …; lui v0,0x3E00 (the GE's projection command); …; lw a0,
 * 0xC00(t9)`, masked.
 */
export const PROJECTION_SIGNATURE = [
  0x3c020000, 0x8c440000, 0x3c030000, 0x3c020000, 0x8c590000, 0x24820004, 0xac620000, 0x3c020000,
  0xac820000, 0x3c020000, 0x8c450000, 0x3c020000, 0x24a30004, 0xac430000, 0x8f240000, 0x3c030000,
];
const PROJECTION_WORDS: readonly [number, number][] = [
  [0x1c, 0x3c023e00], // lui v0, 0x3E00: the projection command
  [0x38, 0x8f240c00], // lw a0, 0xC00(t9): its first float
];
/** The camera's look-at into the renderer: `jal lookAt; addiu a0,s3,0xBC0; addiu v1,s3,0xB80; addiu a0,s3,0xC80`. */
export const VIEW_SIGNATURE = [0x0c000000, 0x26640bc0, 0x26630b80, 0x26640c80];
/**
 * `game_sub` placing a shape on its owner's joint (EU 0x09C37798), masked:
 * joint × 0x250 by shifts, `+0xD0`, the scale at `+0x220`. The blob places
 * shapes the same way.
 */
export const PLACE_SIGNATURE = [
  0x27bdffc0, 0x84a70000, 0x24030000, 0x10e30068, 0x00000000, 0x000718c0, 0x00671821, 0x00031880,
  0x00671821, 0x00034100, 0x8c830000, 0x84a70002, 0x240c0000, 0x00681821, 0x10ec0024, 0x246300d0,
  0x50e00003, 0xc4800220, 0x10000058, 0x24030000,
];
const PLACE_WORDS: readonly [number, number][] = [
  [0x08, 0x2403007f], // li v1, 0x7F: the joint placed by the object
  [0x28, 0x8c830190], // lw v1, 0x190(a0): the joints
];

const word = (buf: Buffer, at: number) => buf.readUInt32LE(at);

/** Every offset in an overlay where the masked signature starts. */
function findInOverlay(buf: Buffer, signature: readonly number[]): number[] {
  const found: number[] = [];
  for (let at = OVL_HEADER_SIZE; at + signature.length * 4 <= buf.length; at += 4) {
    let k = 0;
    while (k < signature.length && maskWord(word(buf, at + k * 4)) === signature[k]) k++;
    if (k === signature.length) found.push(at);
  }
  return found;
}

/** The globals `lui r, hi; lw r2, lo(r)` load when a `lw x, field(r2)` follows within four words. */
export function globalsReadAt(buf: Buffer, field: number): Set<number> {
  const found = new Set<number>();
  for (let at = OVL_HEADER_SIZE; at + 24 <= buf.length; at += 4) {
    const lui = word(buf, at);
    if (lui >>> 26 !== 0x0f) continue;
    const r = (lui >>> 16) & 31;
    const lw = word(buf, at + 4);
    if (lw >>> 26 !== 0x23 || ((lw >>> 21) & 31) !== r) continue;
    const r2 = (lw >>> 16) & 31;
    for (let k = 2; k < 6; k++) {
      const w = word(buf, at + k * 4);
      if (w >>> 26 === 0x23 && ((w >>> 21) & 31) === r2 && (w & 0xffff) === field) {
        found.add(hiLo(lui, lw));
        break;
      }
    }
  }
  return found;
}

/** The global holding the renderer (EU 0x089CBBE4), from the draw loop sending its projection; or why not. */
export function findRendererGlobal(vanillaEboot: Buffer, segment: Segment): number | string {
  const [projection] = findUnique(vanillaEboot, segment, [PROJECTION_SIGNATURE]);
  const at32 = (vaddr: number) => word(vanillaEboot, segment.offset + (vaddr - segment.vaddr));
  if (projection == null || PROJECTION_WORDS.some(([k, w]) => at32(projection + k) !== w)) {
    return "this EBOOT's projection code doesn't match";
  }
  return hiLo(at32(projection + 0x0c), at32(projection + 0x10));
}

/** The blob's externs for attack hitboxes, or why they can't be found. */
export function findHitboxExterns(
  vanillaEboot: Buffer,
  segment: Segment,
  gameTask: Buffer,
  ovl: OvlFile,
  gameSub: Buffer,
  on: boolean,
): Record<string, number> | string {
  const [projection, view, fill] = findUnique(vanillaEboot, segment, [
    PROJECTION_SIGNATURE,
    VIEW_SIGNATURE,
    FILL_SIGNATURE.map(maskWord),
  ]);
  const at32 = (vaddr: number) => word(vanillaEboot, segment.offset + (vaddr - segment.vaddr));
  if (projection == null || PROJECTION_WORDS.some(([k, w]) => at32(projection + k) !== w)) {
    return "this EBOOT's projection code doesn't match";
  }
  if (view == null) return "this EBOOT's camera code doesn't match";
  if (fill == null) return "this EBOOT's HUD fill code doesn't match";

  const places = findInOverlay(gameSub, PLACE_SIGNATURE);
  if (places.length !== 1 || PLACE_WORDS.some(([k, w]) => word(gameSub, places[0]! + k) !== w)) {
    return "game_sub's attack shape code doesn't match";
  }
  const pools = globalsReadAt(gameTask, ATTACK_LIST);
  if (pools.size !== 1) return "game_task's attack list code doesn't match";

  const monsters = findMonsterExterns(gameTask, ovl);
  if (typeof monsters === "string") return monsters;
  return {
    rf_game_task: monsters.rf_game_task!,
    rf_monsters: monsters.rf_monsters!,
    rf_attacks: [...pools][0]!,
    rf_camera: hiLo(at32(projection + 0x0c), at32(projection + 0x10)),
    rf_fill: fill,
    // Off or on, + 1: an extern's address is never 0 (`blob/hitboxes.c`).
    rf_hitboxes_mode: on ? 2 : 1,
  };
}

export const hitboxObjects = () => decodeObjects(HITBOXES_OBJECTS);
