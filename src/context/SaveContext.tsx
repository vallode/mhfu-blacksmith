"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getSave, setSave, clearSave, type SaveData } from "@/lib/save-store";

interface SaveContextValue {
  save: SaveData | null;
  load: (data: Omit<SaveData, "savedAt">) => void;
  clear: () => void;
}

const SaveContext = createContext<SaveContextValue>({
  save: null,
  load: () => {},
  clear: () => {},
});

export function SaveProvider({ children }: { children: React.ReactNode }) {
  const [save, setSaveState] = useState<SaveData | null>(null);

  useEffect(() => {
    setSaveState(getSave());
  }, []);

  const load = useCallback((data: Omit<SaveData, "savedAt">) => {
    setSave(data);
    setSaveState(getSave());
    window.dispatchEvent(new CustomEvent("mhfu:save-loaded"));
  }, []);

  const clear = useCallback(() => {
    clearSave();
    setSaveState(null);
    window.dispatchEvent(new CustomEvent("mhfu:save-loaded"));
  }, []);

  return (
    <SaveContext.Provider value={{ save, load, clear }}>
      {children}
    </SaveContext.Provider>
  );
}

export function useSave() {
  return useContext(SaveContext);
}
