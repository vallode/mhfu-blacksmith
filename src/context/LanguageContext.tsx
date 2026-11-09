"use client";

/**
 * The site's language (lib/i18n). The Language preference picks one, or
 * "auto" follows the browser. Like the other preferences, English renders
 * first (static export) and the chosen language applies right after mount.
 *
 * - `useT()`: the interface text (lib/i18n/messages) in that language.
 * - `useGameText()`: game names and quest text, loaded from
 *   `/data/locale-<code>.json` when the language isn't English. Missing
 *   entries, or a missing file, fall back to English.
 * - `useLocale()`: the language code and its number formatting.
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePreferences } from "@/context/PreferencesContext";
import { ENGLISH, gameText, type GameLocale, type GameText } from "@/lib/i18n/game-text";
import { DEFAULT_LOCALE, LOCALE_TAGS, detectLocale, type Locale } from "@/lib/i18n/locales";
import { MESSAGES, type Messages } from "@/lib/i18n/messages";

interface LanguageContextValue {
  locale: Locale;
  t: Messages;
  game: GameText;
  /** A number in this language's format ("1,234" / "1234", "12,345" / "12.345"). */
  formatNumber: (n: number) => string;
}

function valueFor(locale: Locale, game: GameText): LanguageContextValue {
  const format = new Intl.NumberFormat(LOCALE_TAGS[locale]);
  return { locale, t: MESSAGES[locale], game, formatNumber: (n) => format.format(n) };
}

const LanguageContext = createContext<LanguageContextValue>(valueFor(DEFAULT_LOCALE, ENGLISH));

/** Each language's game text, fetched once per page load. */
const gameLocales = new Map<Locale, Promise<GameLocale | null>>();

function loadGameLocale(locale: Locale): Promise<GameLocale | null> {
  let promise = gameLocales.get(locale);
  if (!promise) {
    promise = fetch(`/data/locale-${locale}.json`)
      .then((res) => (res.ok ? (res.json() as Promise<GameLocale>) : null))
      .catch(() => null);
    gameLocales.set(locale, promise);
  }
  return promise;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { prefs } = usePreferences();
  const [browserLocale, setBrowserLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [game, setGame] = useState<{ locale: Locale; text: GameText } | null>(null);

  useEffect(() => {
    setBrowserLocale(detectLocale(navigator.languages ?? [navigator.language]));
  }, []);

  const locale = prefs.language === "auto" ? browserLocale : prefs.language;

  useEffect(() => {
    document.documentElement.lang = LOCALE_TAGS[locale];
    if (locale === DEFAULT_LOCALE) return;
    let cancelled = false;
    void loadGameLocale(locale).then((data) => {
      if (!cancelled) setGame({ locale, text: gameText(data) });
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const gameForLocale = game?.locale === locale ? game.text : ENGLISH;
  const value = useMemo(() => valueFor(locale, gameForLocale), [locale, gameForLocale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** The interface text in the site's language. */
export function useT(): Messages {
  return useContext(LanguageContext).t;
}

/** Game names and quest text in the site's language, falling back to English. */
export function useGameText(): GameText {
  return useContext(LanguageContext).game;
}

export function useLocale() {
  return useContext(LanguageContext);
}
