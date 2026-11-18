/**
 * Quest board text in every language on the disc, for `data/locales/` (see
 * README, "Localized text").
 *
 * Every quest's `LangPTRs` has 7 slots (quests/parser.ts). On the EU disc
 * the first slot is English: it is the text in the committed
 * `data/quests/`. The other four language slots are German, French,
 * Spanish and Italian **by quest.hexpat's field names only** (`GerPTR`,
 * `FrePTR`, `SpaPTR`, `ItaPTR`); no disc data labels them. So each slot is
 * checked with a language guess over all its quests' text
 * (strings/language.ts) before its text is used: a slot that clearly reads
 * as another language is reported and skipped, and `--slots` can map the
 * slots by hand.
 *
 * On the JP disc every slot points at the same Japanese text, which is
 * emitted as `ja`.
 *
 * A field is left out (so the site falls back to English) when it is:
 * - identical to the English text (an untranslated slot, or a name that
 *   reads the same, like a client called "Treshi");
 * - a placeholder ("none" on the EU disc, "**********" on JP) or empty;
 * - not valid UTF-8 (decoded with U+FFFD), which would mean the slot isn't
 *   UTF-8 like the English text; counted in the slot report.
 */
import type { Region } from "../container/sfo.js";
import { emitQuest } from "../emit/quests.js";
import {
  LANG_SLOTS,
  type LangSlot,
  type ParsedQuest,
  type QuestStrings,
} from "../quests/parser.js";
import {
  detectLanguage,
  LANGUAGE_NAMES,
  type Language,
  type LanguageGuess,
} from "../strings/language.js";
import { QUEST_TEXT_FIELDS, type LocaleCode, type QuestText } from "./file.js";

/** quest.hexpat's names for the four non-English EU slots. */
export const EU_SLOT_LOCALES: Readonly<Partial<Record<LangSlot, LocaleCode>>> = {
  ger: "de",
  fre: "fr",
  spa: "es",
  ita: "it",
};

const PLACEHOLDERS = new Set(["", "none", "**********"]);

export interface QuestSlotReport {
  slot: LangSlot;
  /** The locale this run writes the slot as, or null (English slots, or a skipped slot). */
  locale: LocaleCode | null;
  /** The language the slot is assumed to hold. */
  expected: Language;
  /** Quests (on a board, not placeholders) with this slot set. */
  quests: number;
  /** Quests with at least one field kept. */
  translated: number;
  /** Fields left out because they equal the English text. */
  identicalFields: number;
  /** Fields left out as placeholders. */
  placeholderFields: number;
  /** Fields left out because they weren't valid UTF-8. */
  invalidUtf8Fields: number;
  guess: LanguageGuess;
  /** Why the slot's text wasn't written, if it wasn't. */
  skipped: string | null;
}

export interface QuestLocaleResult {
  sections: Partial<Record<LocaleCode, Record<string, Partial<QuestText>>>>;
  slots: QuestSlotReport[];
}

/** The text fields of a slot that the site shows, from the parser's strings. */
const fieldsOf = (s: QuestStrings): QuestText => ({
  title: s.title,
  goal: s.goal,
  fail: s.fail,
  details: s.details,
  client: s.client,
});

/** Above this confidence a guess that names another language skips the slot. */
const CONFIDENT = 0.3;

/**
 * Parses a `--slots` value: `spa=es,ger=de` (slot=locale pairs) replaces
 * `EU_SLOT_LOCALES`. Unknown slots or locales throw.
 */
export function parseSlotMap(value: string): Partial<Record<LangSlot, LocaleCode>> {
  const out: Partial<Record<LangSlot, LocaleCode>> = {};
  for (const pair of value.split(",").filter(Boolean)) {
    const [slot, locale] = pair.split("=");
    if (!LANG_SLOTS.includes(slot as LangSlot)) {
      throw new Error(`--slots: unknown slot "${slot}" (one of ${LANG_SLOTS.join(", ")})`);
    }
    if (!locale || !(["de", "fr", "es", "it", "ja"] as string[]).includes(locale)) {
      throw new Error(
        `--slots: unknown locale "${locale}" for ${slot} (one of de, fr, es, it, ja)`,
      );
    }
    out[slot as LangSlot] = locale as LocaleCode;
  }
  return out;
}

/**
 * Each language's quest section (quest ID -> fields that differ from
 * English), plus a report on every slot. `slotLocales` maps EU slots to
 * locales (default: quest.hexpat's names); `region` "jp" emits the
 * Japanese text as `ja` instead.
 */
export function questLocales(
  quests: ParsedQuest[],
  region: Region,
  slotLocales: Partial<Record<LangSlot, LocaleCode>> = EU_SLOT_LOCALES,
): QuestLocaleResult {
  // Only quests the site has: on a board, not an unused slot.
  const shown = quests
    .filter((q) => emitQuest(q) !== null && q.strings)
    .sort((a, b) => a.header.questId - b.header.questId);

  if (region === "jp") return japaneseQuests(shown);

  const sections: QuestLocaleResult["sections"] = {};
  const slots: QuestSlotReport[] = [];
  for (const slot of LANG_SLOTS) {
    const locale = slotLocales[slot] ?? null;
    const expected: Language = locale ?? "en";
    const report: QuestSlotReport = {
      slot,
      locale,
      expected,
      quests: 0,
      translated: 0,
      identicalFields: 0,
      placeholderFields: 0,
      invalidUtf8Fields: 0,
      guess: detectLanguage([]),
      skipped: null,
    };
    const section: Record<string, Partial<QuestText>> = {};
    const sample: string[] = [];
    const everything: string[] = [];
    for (const quest of shown) {
      const strings = quest.languages[slot];
      if (!strings) continue;
      report.quests++;
      const english = fieldsOf(quest.strings!);
      const text = fieldsOf(strings);
      const kept: Partial<QuestText> = {};
      for (const field of QUEST_TEXT_FIELDS) {
        const value = text[field];
        everything.push(value);
        if (PLACEHOLDERS.has(value.trim())) report.placeholderFields++;
        else if (value.includes("\uFFFD")) report.invalidUtf8Fields++;
        else if (value === english[field]) report.identicalFields++;
        else {
          kept[field] = value;
          sample.push(value);
        }
      }
      if (Object.keys(kept).length > 0) {
        section[String(quest.header.questId)] = kept;
        report.translated++;
      }
    }
    // The text that would be written; for a slot that is all English, all of it.
    report.guess = detectLanguage(sample.length ? sample : everything);
    if (locale) {
      const { language, confidence } = report.guess;
      if (report.translated === 0) {
        report.skipped = "no text that differs from English";
      } else if (language !== null && language !== expected && confidence >= CONFIDENT) {
        report.skipped =
          `reads as ${LANGUAGE_NAMES[language]}, not ${LANGUAGE_NAMES[expected]} ` +
          `(confidence ${confidence}); map the slots by hand with --slots if the guess is right`;
      } else {
        sections[locale] = section;
      }
      if (report.skipped) report.locale = null;
    }
    slots.push(report);
  }
  return { sections, slots };
}

/** JP: every slot is the same Japanese text, written as `ja`. */
function japaneseQuests(shown: ParsedQuest[]): QuestLocaleResult {
  const section: Record<string, Partial<QuestText>> = {};
  const sample: string[] = [];
  let placeholderFields = 0;
  let invalidUtf8Fields = 0;
  for (const quest of shown) {
    const text = fieldsOf(quest.strings!);
    const kept: Partial<QuestText> = {};
    for (const field of QUEST_TEXT_FIELDS) {
      const value = text[field];
      if (PLACEHOLDERS.has(value.trim())) placeholderFields++;
      else if (value.includes("\uFFFD")) invalidUtf8Fields++;
      else {
        kept[field] = value;
        sample.push(value);
      }
    }
    if (Object.keys(kept).length > 0) section[String(quest.header.questId)] = kept;
  }
  const guess = detectLanguage(sample);
  const wrong = guess.language !== null && guess.language !== "ja";
  const report: QuestSlotReport = {
    slot: "eng1",
    locale: wrong ? null : "ja",
    expected: "ja",
    quests: shown.length,
    translated: Object.keys(section).length,
    identicalFields: 0,
    placeholderFields,
    invalidUtf8Fields,
    guess,
    skipped: wrong ? `reads as ${LANGUAGE_NAMES[guess.language!]}, not Japanese` : null,
  };
  return { sections: wrong ? {} : { ja: section }, slots: [report] };
}
