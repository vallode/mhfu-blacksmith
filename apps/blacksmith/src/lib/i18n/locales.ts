/**
 * The site's languages. The game was published in Japanese (MHP2G) and, in
 * Europe, in English, French, German, Spanish and Italian (MHFU). A language
 * is listed here once it has a full interface dictionary in
 * `messages/<code>/`; game names and quest text come from
 * `data/locales/<code>.json` and fall back to English where that has gaps.
 */
export const LOCALES = ["en", "es"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Each language's name in that language, as the language picker shows it. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

/** The BCP 47 tag for number formatting and `<html lang>`. */
export const LOCALE_TAGS: Record<Locale, string> = {
  en: "en-US",
  es: "es-ES",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The first of the browser's preferred languages the site has, matched on
 * the primary subtag ("es-MX" picks Spanish), else English.
 */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split("-")[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}
