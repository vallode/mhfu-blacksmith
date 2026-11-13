"use client";

/**
 * The user's site preferences (see lib/preferences.ts), changed on the
 * Options page. Defaults render first (static export, no storage on the
 * server) and the stored choices apply right after mount. Changes made in
 * another tab apply here too.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  parsePreferences,
  readPreferences,
  writePreferences,
  type Preferences,
} from "@/lib/preferences";

export type { Preferences } from "@/lib/preferences";

interface PreferencesContextValue {
  prefs: Preferences;
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  reset: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  prefs: DEFAULT_PREFERENCES,
  set: () => {},
  reset: () => {},
});

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPrefs(readPreferences());
    const onStorage = (event: StorageEvent) => {
      if (event.key === PREFERENCES_KEY || event.key === null) {
        setPrefs(parsePreferences(event.newValue));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Read by the --animate-hover-glow override in globals.css.
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.animateHighlights) delete root.dataset.steadyHighlights;
    else root.dataset.steadyHighlights = "";
  }, [prefs.animateHighlights]);

  const set = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      writePreferences(next);
      return next;
    });
  }, []);

  // The language isn't a display preference: resetting keeps it.
  const reset = useCallback(() => {
    setPrefs((prev) => {
      const next = { ...DEFAULT_PREFERENCES, language: prev.language };
      writePreferences(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ prefs, set, reset }), [prefs, set, reset]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
