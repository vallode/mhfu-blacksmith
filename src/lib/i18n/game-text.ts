/**
 * The game's own names and quest text in other languages
 * (`data/locales/<code>.json`, copied to `public/data/locale-<code>.json` by
 * scripts/generate-data.ts). Names are keyed by their English name, which the
 * site already uses as the identity of materials, skills and gear; quest
 * text is keyed by quest ID. Anything missing falls back to English.
 */

/** The kinds of named thing a locale file translates. */
export const GAME_TEXT_KINDS = [
  "weapon",
  "armor",
  "item",
  "monster",
  "skill",
  "decoration",
  "map",
] as const;

export type GameTextKind = (typeof GAME_TEXT_KINDS)[number];

/** A quest's board text, as `data/quests/*.json` has it in English. */
export interface QuestText {
  title: string;
  goal: string;
  fail: string;
  details: string;
  client: string;
}

export const QUEST_TEXT_FIELDS = ["title", "goal", "fail", "details", "client"] as const;

/** One language's game text. Every section is optional. */
export type GameLocale = Partial<Record<GameTextKind, Record<string, string>>> & {
  /** Where the text came from, e.g. "EU disc ULES01213, extracted 2026-11-09". */
  source?: string;
  quest?: Record<string, Partial<QuestText>>;
};

export interface GameText {
  /** `english` in this language, or `english` itself when there's no translation. */
  name(kind: GameTextKind, english: string): string;
  /** `english`'s field of quest `id` in this language, or `english`. */
  quest(id: number | string, field: keyof QuestText, english: string): string;
}

export function gameText(locale: GameLocale | null): GameText {
  if (!locale) return ENGLISH;
  return {
    name: (kind, english) => locale[kind]?.[english] || english,
    quest: (id, field, english) => locale.quest?.[String(id)]?.[field] || english,
  };
}

/** No translations: every lookup gives back the English text. */
export const ENGLISH: GameText = {
  name: (_kind, english) => english,
  quest: (_id, _field, english) => english,
};
