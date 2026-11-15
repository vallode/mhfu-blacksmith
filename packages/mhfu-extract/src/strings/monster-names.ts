/**
 * Monster names from the disc (EU).
 *
 * The EBOOT has two `u16[90]` tables by emID of string indexes into English
 * message file 19's table 0. `0x089AC65C` gives each monster its species'
 * name (103 + emID: Pink Rathian is "Rathian"); `0x089AC710`, read here,
 * gives subspecies their own (Pink Rathian is "Pink Rathian"), and 0 for
 * the emIDs it has no name for (18, 29, 32, 72).
 *
 * The game abbreviates some ("Plum D.Hermitaur", "Terra S.Ceanataur",
 * "Ash Lao-Shan Lung"), as its quest text does, and calls five subspecies
 * by their base monster's name. `overlay/monster-names.json` names those
 * five, and Rocks, which the game doesn't name; every other name is the
 * game's.
 */
import type { BinaryReader } from "../binary/reader.js";
import type { MessageTable } from "./messages.js";
import overlay from "../overlay/monster-names.json" with { type: "json" };

/** DATA.BIN index of the EU disc's English message file with the names. */
export const MONSTER_NAME_FILE = 19;
/** Its table holding them. */
export const MONSTER_NAME_TABLE = 0;
/** `u16` by emID: the name's index in that table; 0 = none. */
export const MONSTER_NAME_INDEXES = 0x089ac710;
const MONSTER_COUNT = 90;
/** The game's placeholders for emIDs that aren't monsters (0; 10 and 74). */
const PLACEHOLDERS = new Set(["NO DATA", "dummy"]);

export interface MonsterNameOverlay {
  id: number;
  name: string;
  /** The game's name for it, or null for none. */
  disc: string | null;
  reason: string;
}

export const MONSTER_NAME_OVERLAY = (overlay as unknown as { names: MonsterNameOverlay[] }).names;

export class MonsterNameError extends Error {}

/** The game's name for each emID, or null where it has none. */
export function readMonsterNames(
  eboot: BinaryReader,
  baseAddress: number,
  table: MessageTable,
): (string | null)[] {
  const offset = MONSTER_NAME_INDEXES - baseAddress;
  if (offset < 0 || offset + MONSTER_COUNT * 2 > eboot.length)
    throw new MonsterNameError(`0x${MONSTER_NAME_INDEXES.toString(16)} is outside the EBOOT`);
  return Array.from({ length: MONSTER_COUNT }, (_, emId) => {
    const index = eboot.u16(offset + emId * 2);
    if (index === 0) return null;
    const string = table.strings[index];
    if (!string) throw new MonsterNameError(`emID ${emId}'s name ${index} isn't in the table`);
    const name = string.bytes.toString("utf8");
    return PLACEHOLDERS.has(name) ? null : name;
  });
}

/**
 * The site's monster names: the game's, with the overlay's for the
 * monsters it doesn't name apart. Throws if an overlay entry no longer
 * matches the disc, or if two monsters would still share a name.
 */
export function siteMonsterNames(
  disc: readonly (string | null)[],
  entries: readonly MonsterNameOverlay[] = MONSTER_NAME_OVERLAY,
): (string | null)[] {
  const names = [...disc];
  for (const e of entries) {
    if (disc[e.id] !== e.disc)
      throw new MonsterNameError(
        `monster-names.json: emID ${e.id} is ${JSON.stringify(disc[e.id] ?? null)} on the disc, not ${JSON.stringify(e.disc)}`,
      );
    const shared = disc.some((n, id) => id !== e.id && n !== null && n === e.disc);
    if (e.disc !== null && !shared)
      throw new MonsterNameError(
        `monster-names.json: emID ${e.id}'s name "${e.disc}" is its own on the disc; remove the entry`,
      );
    names[e.id] = e.name;
  }
  const seen = new Map<string, number>();
  names.forEach((name, id) => {
    if (name === null) return;
    const other = seen.get(name);
    if (other !== undefined)
      throw new MonsterNameError(`emIDs ${other} and ${id} are both "${name}"`);
    seen.set(name, id);
  });
  return names;
}
