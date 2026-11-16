/**
 * The game's monster list and its descriptions (EU disc).
 *
 * The crown table (`sizes.ts` `CROWNS`) has an entry for each of the 62
 * monsters the game describes, in the order of English message file 19's
 * table 17, which holds their descriptions. Each entry names a monster, and
 * the emID group behind it (`CROWN_GROUPS`) adds its subspecies, which
 * share its description: Rathian's entry has Pink and Gold Rathian. Entries
 * without crowns still name their group. Every emID but the non-monsters
 * (0, 10, 18, 29, 32 and 74) is in exactly one group.
 */
import type { BinaryReader } from "../binary/reader.js";
import type { MessageTable } from "../strings/messages.js";
import { CROWN_COUNT, CROWN_GROUPS, CROWN_SIZE, CROWNS, MONSTER_COUNT } from "./sizes.js";

/** English message file 19's table of monster descriptions, one per crown table entry. */
export const BESTIARY_MESSAGE_TABLE = 17;

export interface BestiaryEntry {
  /** The monsters it describes, the named one first. */
  emIds: number[];
  /** One paragraph: the game breaks lines to fit its text box. */
  description: string;
}

export class BestiaryError extends Error {}

/**
 * The game's text as one paragraph. Its line breaks only fit the text to
 * the game's box, so they become spaces.
 */
export function descriptionText(bytes: Buffer): string {
  return bytes
    .toString("utf8")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/** The monster list, or throws if the EBOOT or message table doesn't hold one. */
export function readBestiary(
  eboot: BinaryReader,
  baseAddress: number,
  descriptions: MessageTable,
): BestiaryEntry[] {
  const at = (vaddr: number) => {
    const offset = vaddr - baseAddress;
    if (offset < 0 || offset >= eboot.length)
      throw new BestiaryError(`0x${vaddr.toString(16)} is outside the EBOOT`);
    return offset;
  };
  if (descriptions.strings.length !== CROWN_COUNT)
    throw new BestiaryError(
      `the description table has ${descriptions.strings.length} strings, not ${CROWN_COUNT}`,
    );
  const seen = new Set<number>();
  const entries: BestiaryEntry[] = [];
  for (let i = 0; i < CROWN_COUNT; i++) {
    const entry = at(CROWNS) + i * CROWN_SIZE;
    if (eboot.u8(entry) !== i) throw new BestiaryError(`crown entry ${i} isn't numbered ${i}`);
    const named = eboot.u8(entry + 3);
    const group = eboot.u32(at(CROWN_GROUPS) + named * 4);
    const emIds: number[] = [];
    for (let n = 0; n < MONSTER_COUNT; n++) {
      const emId = eboot.u8(at(group + n));
      if (emId === 0xff) break;
      emIds.push(emId);
    }
    if (emIds[0] !== named || emIds.some((id) => id >= MONSTER_COUNT || seen.has(id)))
      throw new BestiaryError(`crown entry ${i}'s emID group [${emIds.join(", ")}] is wrong`);
    for (const id of emIds) seen.add(id);
    entries.push({ emIds, description: descriptionText(descriptions.strings[i]!.bytes) });
  }
  return entries;
}

/** The entry describing an emID, if the game describes it. */
export function bestiaryEntryFor(
  entries: readonly BestiaryEntry[],
  emId: number,
): BestiaryEntry | undefined {
  return entries.find((e) => e.emIds.includes(emId));
}
