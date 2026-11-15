/**
 * Monster part and break names in the site's language. The data names them
 * by lower-case id ("front-legs", "1st horn"); unlisted ones are shown with
 * each word capitalised, as the pages did before they were translated.
 */
import type { Messages } from "./messages";

const capitalise = (id: string) => id.replace(/(^|[\s-])\w/g, (c) => c.toUpperCase());

/** A hitzone part ("front-legs"). */
export function partLabel(t: Messages, part: string): string {
  return t.monsters.hitzones.parts[part] ?? capitalise(part);
}

/** A break reward ("1st horn", "wing"); falls back to the hitzone part of that name. */
export function breakLabel(t: Messages, name: string): string {
  return t.monsters.breaks.names[name] ?? t.monsters.hitzones.parts[name] ?? capitalise(name);
}
