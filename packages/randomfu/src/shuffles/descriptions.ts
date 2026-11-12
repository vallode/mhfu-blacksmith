/**
 * Keeps item descriptions true to the shuffles. Ammo and coating
 * descriptions end with their carry limit ("Max 60 shots.", "Max. 60
 * Schuss.", "Disp. máx. 60."), so when `shops.stacks` changes a carry
 * limit, the number in the item's description changes with it, in every
 * language on the disc.
 *
 * The EU disc has one str_tbl message file per language (DATA.BIN 19-23,
 * see mhfu-extract's strings/disc-text.ts); table 2 holds the item
 * descriptions, by item ID. A description is only rewritten when its last
 * number, on its last line, is the item's old carry limit: on the EU disc
 * that's exactly the 37 ammo and coating descriptions, in all five
 * languages. Other regions' text isn't known, so it's left alone.
 *
 * The game wraps every line by hand; no item description in a file is
 * wider or has more lines than that file's widest and longest (26
 * characters and 3 lines on EU). A longer number that no longer fits is
 * wrapped again from the last hand-hyphenated line on, and failing that,
 * the word after the number is dropped ("Max 10." for "Max 10 shots.").
 */
import { EU_STR_TBL_FILES } from "mhfu-extract/src/strings/disc-text.js";
import { buildMessageFile, readMessageFile } from "mhfu-extract/src/strings/messages.js";
import { ITEM_ENTRY_SIZE } from "mhfu-extract/src/tables/offsets.js";
import type { Edits } from "../edits.js";
import type { GameData } from "../game/load.js";
import { itemName } from "../names.js";
import { STACK_FIELD, type ItemTable } from "./shops.js";
import type { ShuffleReport } from "./shuffle.js";

/** str_tbl's item names and descriptions, both by item ID. */
const ITEM_NAMES = 1;
const ITEM_DESCRIPTIONS = 2;
const STR_TBL_TABLES = 23;

export interface CarryChange {
  id: number;
  from: number;
  to: number;
}

/** Items whose carry limit differs between the vanilla and edited EBOOT. */
export function carryChanges(vanilla: Buffer, edited: Buffer, table: ItemTable): CarryChange[] {
  const out: CarryChange[] = [];
  for (let id = 1; id < table.count; id++) {
    const at = table.base + id * ITEM_ENTRY_SIZE + STACK_FIELD;
    const from = vanilla.readUInt8(at);
    const to = edited.readUInt8(at);
    if (from !== to) out.push({ id, from, to });
  }
  return out;
}

/** How wide and how many lines descriptions can be. */
export interface TextLayout {
  width: number;
  lines: number;
}

/** Characters as the game draws them: color codes (`~C05`) take no room. */
function width(line: string): number {
  return [...line.replace(/~C\d\d/g, "")].length;
}

/** The widest line and the most lines among `texts`, which are the game's own. */
export function measureLayout(texts: readonly string[]): TextLayout {
  let w = 0;
  let lines = 0;
  for (const text of texts) {
    const split = text.split("\n");
    lines = Math.max(lines, split.length);
    for (const line of split) w = Math.max(w, width(line));
  }
  return { width: w, lines };
}

function fits(text: string, layout: TextLayout): boolean {
  const lines = text.split("\n");
  return lines.length <= layout.lines && lines.every((l) => width(l) <= layout.width);
}

/**
 * `text` wrapped again from the line after the last one that ends in a
 * hyphen (a word the game broke by hand, kept as it is), or null when it
 * still doesn't fit.
 */
function rewrap(text: string, layout: TextLayout): string | null {
  const lines = text.split("\n");
  let kept = 0;
  lines.forEach((line, i) => {
    if (line.endsWith("-")) kept = i + 1;
  });
  const out = lines.slice(0, kept);
  let current = "";
  for (const word of lines.slice(kept).join(" ").split(/ +/)) {
    if (!word) continue;
    if (!current) current = word;
    else if (width(`${current} ${word}`) <= layout.width) current += ` ${word}`;
    else {
      out.push(current);
      current = word;
    }
  }
  if (current) out.push(current);
  const result = out.join("\n");
  return fits(result, layout) ? result : null;
}

/**
 * `text` with its carry limit `from` changed to `to`, or null when its last
 * number isn't `from` on its last line, or the new text can't be made to
 * fit.
 */
export function rewriteCarryLimit(
  text: string,
  from: number,
  to: number,
  layout: TextLayout,
): string | null {
  const last = [...text.matchAll(/\d+/g)].at(-1);
  if (!last || Number(last[0]) !== from) return null;
  const before = text.slice(0, last.index);
  const after = text.slice(last.index + last[0].length);
  if (after.includes("\n")) return null;
  const changed = `${before}${to}${after}`;
  if (fits(changed, layout)) return changed;
  const wrapped = rewrap(changed, layout);
  if (wrapped) return wrapped;
  // "Max 10 shots." -> "Max 10.": drop the word after the number, keep the stop.
  const unit = /^ \S+?(\.?)$/.exec(after);
  if (!unit) return null;
  const short = `${before}${to}${unit[1]}`;
  return fits(short, layout) ? short : rewrap(short, layout);
}

/** What happened to one language's str_tbl. */
interface LanguageResult {
  language: string;
  rewritten: Set<number>;
  problem?: string;
}

/**
 * Rewrites the carry limits in item descriptions on an EU disc, after the
 * shop pass changed them. Null when no carry limit changed.
 */
export function rewriteCarryDescriptions(
  game: GameData,
  table: ItemTable,
  edits: Edits,
): ShuffleReport | null {
  const changes = carryChanges(game.eboot!, edits.eboot(), table);
  if (changes.length === 0) return null;
  const title = "Item descriptions";
  if (game.region !== "eu") {
    return {
      title,
      notes: [
        "Ammo and coating descriptions still give the old carry limits: only the EU disc's text is known.",
      ],
      lines: [],
    };
  }

  const results: LanguageResult[] = [];
  for (const [language, index] of Object.entries(EU_STR_TBL_FILES)) {
    const result: LanguageResult = { language, rewritten: new Set() };
    results.push(result);
    const original = edits.dataFileNow(index);
    const tables = readMessageFile(original);
    const names = tables?.[ITEM_NAMES]?.strings;
    const descriptions = tables?.[ITEM_DESCRIPTIONS]?.strings.map((s) => s.bytes.toString("utf8"));
    if (
      !tables ||
      tables.length !== STR_TBL_TABLES ||
      !names ||
      !descriptions ||
      names.length !== descriptions.length ||
      names.length < table.count
    ) {
      result.problem = `DATA.BIN ${index} doesn't look like the ${language} str_tbl`;
      continue;
    }
    const layout = measureLayout(descriptions);
    for (const { id, from, to } of changes) {
      const text = rewriteCarryLimit(descriptions[id]!, from, to, layout);
      if (text === null) continue;
      descriptions[id] = text;
      result.rewritten.add(id);
    }
    if (result.rewritten.size === 0) continue;
    const rebuilt = buildMessageFile(
      tables.map((t, i) =>
        i === ITEM_DESCRIPTIONS
          ? descriptions.map((d) => Buffer.from(d, "utf8"))
          : t.strings.map((s) => s.bytes),
      ),
      original.readUInt32LE(4),
    );
    if (rebuilt.length > original.length) {
      result.problem = `the ${language} text would outgrow its file (${rebuilt.length} > ${original.length} bytes)`;
      result.rewritten.clear();
      continue;
    }
    rebuilt.copy(edits.dataFile(index), 0);
  }

  const languages = results.map((r) => r.language);
  const lines = changes
    .filter(({ id }) => results.some((r) => r.rewritten.has(id)))
    .map(({ id, from, to }) => {
      const missing = languages.filter(
        (l) => !results.find((r) => r.language === l)!.rewritten.has(id),
      );
      return {
        where: "Item descriptions",
        text:
          `${itemName(id)}: says ${to} (was ${from})` +
          (missing.length ? `, not in ${missing.join(", ")}` : ""),
      };
    });
  const notes = [
    `Ammo and coating descriptions give the new carry limits, in ${languages.join(", ")}.`,
    ...results.flatMap((r) => (r.problem ? [`Not rewritten: ${r.problem}.`] : [])),
  ];
  return { title, notes, lines };
}
