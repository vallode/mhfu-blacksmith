/**
 * The Guild Card's awards: their names and the game's descriptions of them
 * (EU disc). See `docs/awards.md` for what the game checks before giving
 * each one.
 *
 * Both are runs of 48 strings in table 0 of a message file
 * (`strings/messages.ts`), in award order, which is also the order of the
 * save's award bits:
 *
 * - names: DATA.BIN 19-23 (English, French, German, Italian, Spanish),
 *   entries 1285-1332;
 * - descriptions: DATA.BIN 4781-4785 (the same languages), entries
 *   1726-1773.
 *
 * Found on the EU disc and checked by reading every language: the entries
 * just outside each run are other text (item names before the award names,
 * farm text around the descriptions).
 */
import type { MessageTable } from "./messages.js";

/** How many awards the Guild Card has: 48 of the save's award bits. */
export const AWARD_COUNT = 48;

/** Table 0 entry of the first award's name, in DATA.BIN 19-23. */
export const AWARD_NAME_ENTRY = 1285;
/** Table 0 entry of the first award's description, in DATA.BIN 4781-4785. */
export const AWARD_DESCRIPTION_ENTRY = 1726;

/** The EU disc's languages, each with its name file and its description file (DATA.BIN indexes). */
export const AWARD_TEXT_FILES = {
  en: { names: 19, descriptions: 4781 },
  fr: { names: 20, descriptions: 4782 },
  de: { names: 21, descriptions: 4783 },
  it: { names: 22, descriptions: 4784 },
  es: { names: 23, descriptions: 4785 },
} as const;

export type AwardLanguage = keyof typeof AWARD_TEXT_FILES;

export interface AwardText {
  /** The award's index: its bit in the save's award flags. */
  id: number;
  name: string;
  /** One paragraph: the game's line breaks become spaces. */
  description: string;
}

export class AwardTextError extends Error {}

/**
 * The game's text as one line. Its line breaks and the spaces padding them
 * only fit the text to the Guild Card's box, so they become one space, except
 * after a hyphen that ends a line: that joins the word up again. In German
 * the game also breaks words between syllables ("Versamm-" and
 * "lungshalle"), so there a hyphen before a lower-case letter goes too; a
 * hyphen before a capital joins a compound ("Machalit-Erz"). Every other
 * language breaks only at a word's own hyphen ("mysterious-sounding"). A
 * hyphen with a space before the break ("Versammlungshallen- und") stays
 * as it is.
 */
export function awardLine(bytes: Buffer, language: AwardLanguage): string {
  return bytes
    .toString("utf8")
    .replace(/-\n\s*(?=(\p{Ll})?)/gu, (_, lower: string | undefined) =>
      language === "de" && lower ? "" : "-",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function run(
  tables: MessageTable[] | null,
  first: number,
  what: string,
  language: AwardLanguage,
): string[] {
  const table = tables?.[0];
  if (!table) throw new AwardTextError(`the ${what} file has no table 0`);
  if (table.strings.length < first + AWARD_COUNT)
    throw new AwardTextError(
      `the ${what} file's table 0 has ${table.strings.length} strings, too few for entries ${first}-${first + AWARD_COUNT - 1}`,
    );
  const texts = table.strings
    .slice(first, first + AWARD_COUNT)
    .map((s) => awardLine(s.bytes, language));
  const empty = texts.findIndex((t) => t === "");
  if (empty >= 0) throw new AwardTextError(`award ${empty} has no ${what}`);
  return texts;
}

/** The 48 awards' text in one language, or throws if the files don't hold it. */
export function readAwardText(
  names: MessageTable[] | null,
  descriptions: MessageTable[] | null,
  language: AwardLanguage,
): AwardText[] {
  const n = run(names, AWARD_NAME_ENTRY, "name", language);
  const d = run(descriptions, AWARD_DESCRIPTION_ENTRY, "description", language);
  return n.map((name, id) => ({ id, name, description: d[id]! }));
}
