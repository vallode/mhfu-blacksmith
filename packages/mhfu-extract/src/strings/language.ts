/**
 * A small language guesser for the game's own text, used as a sanity check
 * wherever a language is assumed rather than read from the disc:
 *
 * - The EU quest files' `LangPTRs` slots are named English, English,
 *   German, French, Spanish, Italian, English only by quest.hexpat's field
 *   names (see quests/parser.ts). Nothing else on the disc labels them.
 * - The EU name tables (strings/name-search.ts) carry no language at all.
 *
 * It scores each language from three kinds of evidence and normalizes by
 * the amount of text:
 *
 * - letters only one or two of the languages use (`ñ`, `¿` Spanish; `ä`,
 *   `ö`, `ü`, `ß` German; `ç`, `œ`, `ê` French; `ì`, `ò` Italian; kana and
 *   kanji Japanese);
 * - common short words (articles, prepositions, conjunctions), weighted by
 *   how many of the languages share them (`de` is Spanish and French);
 * - letter sequences typical of one language (`sch`, `ción`, `zione`, `eau`).
 *
 * Plenty for a page of quest text; a table of short names gives less
 * evidence, so check `confidence` before trusting a guess there.
 */

export const LANGUAGES = ["en", "de", "fr", "es", "it", "ja"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
  ja: "Japanese",
};

export interface LanguageGuess {
  /** The best-scoring language, or null if there's too little evidence. */
  language: Language | null;
  /** (best - second best) / best, 0-1. Above ~0.3 is a clear call. */
  confidence: number;
  /** Evidence per 100 words (or per 100 characters for Japanese). */
  scores: Record<Language, number>;
  /** The strongest features behind the best guess, e.g. `"ñ"×12`, `"del"×4`. */
  evidence: string[];
}

/** Letters, with their weight per occurrence. */
const LETTERS: Record<string, Partial<Record<Language, number>>> = {
  ñ: { es: 3 },
  "¿": { es: 4 },
  "¡": { es: 4 },
  á: { es: 1.5 },
  í: { es: 1.5 },
  ó: { es: 1.5, it: 0.3 },
  ú: { es: 1.5 },
  ä: { de: 2 },
  ö: { de: 2 },
  ü: { de: 2 },
  ß: { de: 4 },
  é: { fr: 1.2, es: 0.3, it: 0.3 },
  è: { fr: 1, it: 1 },
  ê: { fr: 2 },
  ë: { fr: 2 },
  ç: { fr: 2 },
  œ: { fr: 4 },
  â: { fr: 2 },
  î: { fr: 2 },
  ï: { fr: 2 },
  ô: { fr: 2 },
  û: { fr: 2 },
  à: { fr: 0.7, it: 1 },
  ù: { fr: 1, it: 1 },
  ì: { it: 3 },
  ò: { it: 3 },
};

/** Common words, by language; a word in k lists scores 1/k for each. */
const WORDS: Record<Exclude<Language, "ja">, string[]> = {
  en: "the of and to in is with for on you this that from it be are your by an at".split(" "),
  de: "der die das und ist nicht ein eine einen mit von für auf den dem des zu im sie es sich auch bei aus".split(
    " ",
  ),
  fr: "le la les des du et est une un pour avec au aux dans sur que qui ne pas vous ce cette il en par de".split(
    " ",
  ),
  es: "el la los las del y que con para por una un es se su al lo más muy pero de en".split(" "),
  it: "il lo la di della dello delle degli dei gli e è per con una un che non nel nella sul alla al si in".split(
    " ",
  ),
};

/** Letter sequences, with their weight per occurrence. */
const SEQUENCES: Record<Exclude<Language, "ja">, [string, number][]> = {
  en: [
    ["th", 0.4],
    ["ing", 1],
    ["wh", 1],
    ["'s ", 1],
    ["ght", 1],
  ],
  de: [
    ["sch", 1],
    ["ung", 1],
    ["ei", 0.3],
    ["tz", 0.6],
    ["chen", 1],
    ["keit", 1],
  ],
  fr: [
    ["eau", 1.5],
    ["aux", 1],
    ["oi", 0.4],
    ["ou", 0.3],
    ["qu'", 1.5],
    ["l'", 0.6],
    ["d'", 0.6],
  ],
  es: [
    ["ción", 2],
    ["ll", 0.3],
    ["ue", 0.3],
    ["dad", 0.6],
    ["os ", 0.3],
  ],
  it: [
    ["zz", 1],
    ["gli", 1.5],
    ["zione", 2],
    ["cch", 1],
    ["ell'", 1.5],
    ["tt", 0.4],
  ],
};

const WORD_WEIGHTS = (() => {
  const owners = new Map<string, Language[]>();
  for (const [lang, words] of Object.entries(WORDS) as [Language, string[]][]) {
    for (const w of words) owners.set(w, [...(owners.get(w) ?? []), lang]);
  }
  return owners;
})();

const JAPANESE = /[\u3040-\u30ff\u4e00-\u9fff]/gu;

/** Minimum total evidence (per 100 words) for any guess at all. */
const MIN_EVIDENCE = 2;

/** Guesses the language of `texts`, taken together. */
export function detectLanguage(texts: string[]): LanguageGuess {
  const text = ` ${texts.join(" \n ").toLowerCase()} `;
  const raw = Object.fromEntries(LANGUAGES.map((l) => [l, 0])) as Record<Language, number>;
  const features = Object.fromEntries(
    LANGUAGES.map((l) => [l, new Map<string, number>()]),
  ) as Record<Language, Map<string, number>>;
  const add = (lang: Language, feature: string, weight: number) => {
    raw[lang] += weight;
    const f = features[lang];
    f.set(feature, (f.get(feature) ?? 0) + weight);
  };

  const words = text.match(/\p{L}+/gu) ?? [];
  const units = Math.max(words.length, 1);
  for (const ch of text) {
    const weights = LETTERS[ch];
    if (weights)
      for (const [lang, w] of Object.entries(weights) as [Language, number][]) add(lang, ch, w);
  }
  const japanese = text.match(JAPANESE)?.length ?? 0;
  // Japanese has no spaces, so per character; enough to beat any accident.
  if (japanese > 0) add("ja", "kana/kanji", japanese * 2);
  for (const word of words) {
    const owners = WORD_WEIGHTS.get(word);
    if (owners) for (const lang of owners) add(lang, word, 1 / owners.length);
  }
  for (const [lang, seqs] of Object.entries(SEQUENCES) as [Language, [string, number][]][]) {
    for (const [seq, w] of seqs) {
      let at = text.indexOf(seq);
      while (at !== -1) {
        add(lang, seq, w);
        at = text.indexOf(seq, at + 1);
      }
    }
  }

  const scores = Object.fromEntries(
    LANGUAGES.map((l) => [l, Math.round((raw[l] / units) * 1000) / 10]),
  ) as Record<Language, number>;
  const ranked = [...LANGUAGES].sort((a, b) => scores[b] - scores[a]);
  const best = ranked[0]!;
  const second = ranked[1]!;
  const enough = scores[best] >= MIN_EVIDENCE;
  const evidence = [...features[best].entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([f, w]) => `"${f}" ${Math.round(w * 10) / 10}`);
  return {
    language: enough ? best : null,
    confidence: enough
      ? Math.round(((scores[best] - scores[second]) / scores[best]) * 100) / 100
      : 0,
    scores,
    evidence: enough ? evidence : [],
  };
}

/** True if `guess` names `expected` (or is too weak to say otherwise, when `allowUnsure`). */
export function guessAgrees(guess: LanguageGuess, expected: Language, allowUnsure = true): boolean {
  if (guess.language === null) return allowUnsure;
  return guess.language === expected;
}
