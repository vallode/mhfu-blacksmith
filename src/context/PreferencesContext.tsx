"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface Preferences {
  /** Show raw (true) or inflated (false) weapon attack values */
  showRawAttack: boolean;
  /** Default save region for the hunter upload page */
  defaultRegion: "us" | "eu" | "jp";
}

const DEFAULTS: Preferences = {
  showRawAttack: true,
  defaultRegion: "us",
};

const KEY = "mhfu_prefs";

function loadPrefs(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Preferences>) };
  } catch {
    return DEFAULTS;
  }
}

function savePrefs(prefs: Preferences): void {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}

interface PreferencesContextValue {
  prefs: Preferences;
  set: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  reset: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue>({
  prefs: DEFAULTS,
  set: () => {},
  reset: () => {},
});

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const set = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      savePrefs(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    savePrefs(DEFAULTS);
    setPrefs(DEFAULTS);
  }, []);

  return (
    <PreferencesContext.Provider value={{ prefs, set, reset }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
