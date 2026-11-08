"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { isStage, type Tier } from "@/lib/min-rank";

export interface Preferences {
  /** Show raw (true) or inflated (false) weapon attack values */
  showRawAttack: boolean;
  /** Default save region for the hunter upload page */
  defaultRegion: "us" | "eu" | "jp";
  /** Highest guild quest the hunter can take, or null to show all gear */
  questProgress: Tier | null;
}

const DEFAULTS: Preferences = {
  showRawAttack: true,
  defaultRegion: "us",
  questProgress: null,
};

const KEY = "mhfu_prefs";

function loadPrefs(): Preferences {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const stored = JSON.parse(raw) as Partial<Preferences>;
    return {
      ...DEFAULTS,
      ...stored,
      // Stored values can be stale or hand-edited; only keep a known stage.
      questProgress: isStage(stored.questProgress) ? stored.questProgress : null,
    };
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
