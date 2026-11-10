/**
 * Quest text after monster swaps: the old monster's name, in every
 * language, becomes the new one's.
 *
 * Names aren't shipped. They're learned from the disc's own quest text,
 * per language slot (`game/quest-text.ts`):
 *
 * - The `monsters` string is split into names (on new lines, commas, `、`,
 *   `/` and `;`). For each large monster, the name is the piece most often
 *   found in quests that have it (in their `monsters` string and goal) and
 *   least often in quests that don't. A piece two monsters both pick, or a
 *   tie, names neither.
 * - Its article is the word most often just before the name in those
 *   quests' goals ("den", "la", "l'", "the"). A name is only replaced by one
 *   with the same article, so "den Rathalos" never becomes "den Rathian".
 * - Each field's longest line in that language is its width: a name that
 *   would make a line longer isn't replaced, since the text is wrapped by
 *   hand.
 *
 * A string that can't be rewritten whole (an unknown name, another
 * article, too wide, or no room left in the quest) keeps its old text and
 * is listed in the spoiler. Pronouns and other words that depend on the
 * monster ("she", "sie") aren't changed.
 */
import type { LoadedQuest } from "../game/load.js";
import {
  readQuestText,
  SLOT_LANGUAGES,
  STRING_FIELDS,
  writeQuestText,
  type QuestText,
  type TextBlock,
} from "../game/quest-text.js";
import type { Edits } from "../edits.js";
import { monsterName, questLabel } from "../names.js";
import type { ShuffleReport } from "./shuffle.js";

const MONSTERS = STRING_FIELDS.indexOf("monsters");
const GOAL = STRING_FIELDS.indexOf("goal");
/** The order strings get the room there is: the goal first, the long details last. */
const PRIORITY = ["goal", "monsters", "title", "client", "fail", "details"].map((f) =>
  STRING_FIELDS.indexOf(f as (typeof STRING_FIELDS)[number]),
);

export interface SlotNames {
  /** emID -> name. */
  names: Map<number, string>;
  /** emID -> the word before its name in goals; null if there's none. */
  articles: Map<number, string | null>;
  /** Each field's longest line, in characters. */
  widths: number[];
}

interface TextSample {
  species: Set<number>;
  texts: string[];
}

export function splitNames(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,、/;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),
  ];
}

const isLetter = (ch: string | undefined) => ch !== undefined && /\p{L}/u.test(ch);
const chars = (s: string) => [...s].length;

/** Where `name` occurs in `text` as a word start (not inside another word). */
function occurrences(text: string, name: string, ignoreCase = false): number[] {
  // Lower-casing keeps every position for the Latin scripts the EU disc uses.
  const hay = ignoreCase ? text.toLowerCase() : text;
  const needle = ignoreCase ? name.toLowerCase() : name;
  const out: number[] = [];
  for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + 1)) {
    if (!isLetter(text[at - 1])) out.push(at);
  }
  return out;
}

/** The word just before `at`: "the", "den", or an elided "l'". */
function wordBefore(text: string, at: number): string | null {
  const m = text.slice(0, at).match(/(\p{L}+)(['’]|\s+)$/u);
  if (!m) return null;
  return (m[1]! + (/['’]/.test(m[2]!) ? "'" : "")).toLowerCase();
}

/** The most common value, or undefined on a tie. */
function mode<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0 || (ranked.length > 1 && ranked[0]![1] === ranked[1]![1])) {
    return undefined;
  }
  return ranked[0]![0];
}

export function learnSlotNames(samples: readonly TextSample[]): SlotNames {
  const widths = STRING_FIELDS.map((_, f) =>
    Math.max(0, ...samples.flatMap((s) => s.texts[f]!.split("\n").map(chars))),
  );
  const pieces = samples.map((s) => new Set(splitNames(s.texts[MONSTERS]!)));
  const species = new Set(samples.flatMap((s) => [...s.species]));

  const picked = new Map<number, string>();
  for (const id of species) {
    const withIt = samples.flatMap((s, i) => (s.species.has(id) ? [i] : []));
    const without = samples.flatMap((s, i) => (s.species.has(id) ? [] : [i]));
    const share = (list: number[], has: (i: number) => boolean) =>
      list.length === 0 ? 0 : list.filter(has).length / list.length;
    const scored = [...new Set(withIt.flatMap((i) => [...pieces[i]!]))].map((piece) => {
      const listed = share(withIt, (i) => pieces[i]!.has(piece));
      const inGoal = share(
        withIt,
        (i) => occurrences(samples[i]!.texts[GOAL]!, piece, true).length > 0,
      );
      const elsewhere = share(without, (i) => pieces[i]!.has(piece));
      return { piece, listed, inGoal, score: listed + inGoal - elsewhere };
    });
    scored.sort((a, b) => b.score - a.score);
    const [best, next] = scored;
    if (!best || best.listed < 0.5 || best.inGoal === 0) continue;
    if (next && next.score === best.score) continue;
    picked.set(id, best.piece);
  }

  const names = new Map<number, string>();
  const byName = new Map<string, number[]>();
  for (const [id, name] of picked) byName.set(name, [...(byName.get(name) ?? []), id]);
  for (const [name, ids] of byName) if (ids.length === 1) names.set(ids[0]!, name);

  const articles = new Map<number, string | null>();
  for (const [id, name] of names) {
    const words = samples
      .filter((s) => s.species.has(id))
      .flatMap((s) =>
        occurrences(s.texts[GOAL]!, name, true).map((at) => wordBefore(s.texts[GOAL]!, at)),
      );
    const article = words.length === 0 ? null : mode(words);
    // A tie leaves the article unknown: nothing can safely replace the name.
    if (article !== undefined) articles.set(id, article);
  }
  return { names, articles, widths };
}

/** Learns every slot's names from the quests' unedited text. */
export function learnNames(quests: readonly LoadedQuest[]): {
  slots: SlotNames[];
  texts: Map<number, QuestText>;
} {
  const texts = new Map<number, QuestText>();
  const samples: TextSample[][] = SLOT_LANGUAGES.map(() => []);
  for (const quest of quests) {
    const text = readQuestText(quest.file.payload, quest.parsed.header);
    texts.set(quest.index, text);
    const species = new Set(quest.parsed.largeMonsters.map((m) => m.monsterId));
    for (const block of text.blocks) {
      for (const slot of block.slots) samples[slot]!.push({ species, texts: block.texts });
    }
  }
  return { slots: samples.map(learnSlotNames), texts };
}

type Outcome = { text: string } | { problem: string };

/** Monsters in `mapping` (old or new) the slot has no name for. */
export function missingNames(slot: SlotNames, mapping: ReadonlyMap<number, number>): number[] {
  return [...new Set([...mapping.keys(), ...mapping.values()])].filter((id) => !slot.names.has(id));
}

/**
 * `text` with every swapped monster's name replaced, or why it can't be.
 * Every monster in `mapping` must have a name (`missingNames`).
 */
export function renameIn(
  text: string,
  slot: SlotNames,
  mapping: ReadonlyMap<number, number>,
  width: number,
): Outcome {
  // Longest names first, so "Pink Rathian" isn't read as "Rathian".
  const known = [...slot.names].sort((a, b) => b[1].length - a[1].length);
  let out = "";
  let changed = false;
  /** Where known names were read: [start, end). */
  const spans: [number, number][] = [];
  for (let at = 0; at < text.length;) {
    const hit = isLetter(text[at - 1])
      ? undefined
      : known.find(([, name]) => text.startsWith(name, at));
    if (!hit) {
      out += text[at];
      at++;
      continue;
    }
    const [id, name] = hit;
    spans.push([at, at + name.length]);
    const next = mapping.get(id);
    if (next === undefined) {
      out += name;
    } else {
      const nextName = slot.names.get(next)!;
      const a = slot.articles.get(id);
      const b = slot.articles.get(next);
      if (a === undefined || b === undefined || a !== b) {
        return { problem: `${monsterName(next)} takes another article` };
      }
      out += nextName;
      changed = true;
    }
    at += name.length;
  }
  // An old name in another case ("reine Vespoid", "rosa Rathian") wasn't read
  // above: renaming the rest would leave the text half old.
  for (const old of mapping.keys()) {
    const name = slot.names.get(old)!;
    for (const at of occurrences(text, name, true)) {
      if (!spans.some(([s, e]) => s <= at && at + name.length <= e)) {
        return { problem: `names ${monsterName(old)} in another form` };
      }
    }
  }
  if (!changed) return { text };
  if (out.split("\n").some((line) => chars(line) > width)) return { problem: "too wide" };
  return { text: out };
}

/** The languages a block serves, by slot: "Japanese/English/Korean" for one shared by those slots. */
const blockLabel = (block: TextBlock) => block.slots.map((s) => SLOT_LANGUAGES[s]!).join("/");

/** Renames swapped monsters in each changed quest's text. */
export function renameQuestText(
  swaps: ReadonlyMap<number, ReadonlyMap<number, number>>,
  quests: readonly LoadedQuest[],
  edits: Edits,
): ShuffleReport {
  const { slots, texts } = learnNames(quests);
  const lines: ShuffleReport["lines"] = [];
  let renamed = 0;
  let kept = 0;
  for (const quest of quests) {
    const mapping = swaps.get(quest.index);
    const text = texts.get(quest.index);
    if (!mapping || !text) continue;
    const accepted = new Map<number, string>();
    const problems = new Map<string, Set<string>>();
    const note = (lang: string, problem: string) =>
      (problems.get(problem) ?? problems.set(problem, new Set()).get(problem)!).add(lang);
    if (text.blocks.length === 0) note("all", "no text");

    // A language that lacks a name can't be checked for the old one, so it keeps its text.
    const usable = text.blocks.filter((block) => {
      const missing = missingNames(slots[block.slots[0]!]!, mapping);
      if (missing.length > 0) {
        note(blockLabel(block), `no name for ${missing.map(monsterName).join(", ")}`);
      }
      return missing.length === 0;
    });
    const done = new Set<number>();
    for (const field of PRIORITY) {
      for (const block of usable) {
        const ptr = block.pointers[field]!;
        if (ptr === 0 || done.has(ptr)) continue;
        done.add(ptr);
        const slot = block.slots[0]!;
        const lang = blockLabel(block);
        const result = renameIn(
          block.texts[field]!,
          slots[slot]!,
          mapping,
          slots[slot]!.widths[field]!,
        );
        if ("problem" in result) {
          note(lang, `${STRING_FIELDS[field]}: ${result.problem}`);
          continue;
        }
        if (result.text === block.texts[field]) continue;
        // Try it against a scratch copy: keep it only if everything still fits.
        const trial = new Map(accepted).set(ptr, result.text);
        if (writeQuestText(Buffer.from(quest.file.payload), text, trial)) {
          accepted.set(ptr, result.text);
        } else {
          note(lang, `${STRING_FIELDS[field]}: no room`);
        }
      }
    }
    if (accepted.size > 0) {
      writeQuestText(edits.quest(quest), text, accepted);
      renamed++;
    }
    if (problems.size > 0) {
      kept++;
      for (const [problem, langs] of problems) {
        lines.push({
          where: questLabel(quest),
          text: `Text kept (${[...langs].join(", ")}): ${problem}`,
        });
      }
    }
    if (accepted.size > 0) {
      lines.push({ where: questLabel(quest), text: `Text renamed in ${accepted.size} strings` });
    }
  }

  // What was learned, to check against the game: each monster's name and article per language.
  slots.forEach((slot, i) => {
    for (const [id, name] of [...slot.names].sort((a, b) => a[0] - b[0])) {
      const article = slot.articles.get(id);
      lines.push({
        where: `Names learned (${SLOT_LANGUAGES[i]})`,
        text: `${monsterName(id)}: "${name}" (${article === undefined ? "article unclear" : (article ?? "no article")})`,
      });
    }
  });

  const learned = slots
    .map((s, i) => ({ lang: SLOT_LANGUAGES[i]!, count: s.names.size }))
    .filter((s) => s.count > 0)
    .map((s) => `${s.lang} ${s.count}`);
  return {
    title: "Quest text",
    notes: [
      learned.length > 0
        ? `Monster names learned from the disc's quest text: ${learned.join(", ")}.`
        : "No monster names could be learned from the disc's quest text, so no text changed.",
      `Renamed monsters in ${renamed} quests; ${kept} quests keep some old text (listed). Pronouns aren't changed. Untested on a real disc.`,
    ],
    lines,
  };
}
