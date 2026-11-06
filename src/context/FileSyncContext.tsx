"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clearHandleRecord,
  fileHandleSupported,
  getHandleRecord,
  patchHandleRecord,
  setHandleRecord,
  type FileHandleRecord,
} from "@/lib/file-handle-store";
import { parseSaveBuffer, type Region, type WorkerResult } from "@/hooks/useSaveWorker";
import { useSave } from "@/context/SaveContext";
import { saveFromCharacter } from "@/lib/save-store";

export interface FileSyncState {
  isSupported: boolean;
  hasHandle: boolean;
  permission: PermissionState | null;
  syncing: boolean;
  lastSynced: number | null;
  fileName: string | null;
  error: string | null;
}

export interface FilePickResult {
  file: File;
  handle: FileSystemFileHandle;
}

interface FileSyncContextValue extends FileSyncState {
  /** Opens the native file picker, remembers the handle, and returns the file to parse. */
  pickFile: (region: Region) => Promise<FilePickResult | null>;
  /**
   * Remembers which character slot of the stored handle's file to auto-load on
   * future syncs, and the region it was loaded with. Only call it for a result
   * parsed from that file (pickFile). No-op if no handle is stored.
   */
  confirmSelection: (characterIndex: number, region: Region) => Promise<void>;
  /** Re-reads the file if it changed and auto-loads the previously selected character. */
  syncNow: () => Promise<void>;
  /** Re-requests read permission from a user gesture (e.g. a toast/button click). */
  requestReconnect: () => Promise<void>;
  /** Forgets the stored handle entirely. */
  forget: () => Promise<void>;
}

const DEFAULT_STATE: FileSyncState = {
  isSupported: false,
  hasHandle: false,
  permission: null,
  syncing: false,
  lastSynced: null,
  fileName: null,
  error: null,
};

const FileSyncContext = createContext<FileSyncContextValue>({
  ...DEFAULT_STATE,
  pickFile: async () => null,
  confirmSelection: async () => {},
  syncNow: async () => {},
  requestReconnect: async () => {},
  forget: async () => {},
});

/**
 * Single source of truth for the persisted save-file handle, mirroring
 * OfflineContext: shared by the upload page (initial pick + character
 * choice), a toast that asks for one click to reconnect on a new session
 * (SaveSyncReconnect), and a persistent options-page control
 * (SaveSyncSettings) — so all three always agree on sync status.
 */
export function FileSyncProvider({ children }: { children: React.ReactNode }) {
  const { load } = useSave();
  const [state, setState] = useState<FileSyncState>(DEFAULT_STATE);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const rerunRef = useRef(false);
  const pickingRef = useRef(false);

  // Merges a partial update, returning the same object when nothing changed so
  // routine focus/visibility checks don't re-render every consumer.
  const patchState = useCallback((patch: Partial<FileSyncState>) => {
    setState((s) =>
      (Object.keys(patch) as (keyof FileSyncState)[]).every((k) => s[k] === patch[k])
        ? s
        : { ...s, ...patch }
    );
  }, []);

  const applyResult = useCallback(
    (record: FileHandleRecord, result: WorkerResult) => {
      if (record.characterIndex == null) return;
      const character = result.characters[record.characterIndex];
      if (!character) {
        setState((s) => ({
          ...s,
          error: "Previously selected hunter is no longer in this save.",
        }));
        return;
      }
      load(saveFromCharacter(character, record.region));
    },
    [load]
  );

  const syncOnce = useCallback(async () => {
    const record = await getHandleRecord();
    if (!record) {
      patchState({ hasHandle: false, permission: null, fileName: null });
      return;
    }

    let permission: PermissionState;
    try {
      permission = await record.handle.queryPermission({ mode: "read" });
    } catch {
      permission = "denied";
    }
    patchState({ hasHandle: true, fileName: record.handle.name, permission });
    if (permission !== "granted") return;

    try {
      const file = await record.handle.getFile();
      if (file.lastModified === record.lastModified) {
        // Unchanged file: only the "last synced" time moves. No syncing flag
        // flip for this cheap check, so it's a single update.
        patchState({ lastSynced: Date.now() });
        return;
      }
      patchState({ syncing: true, error: null });
      const buffer = await file.arrayBuffer();
      const result = await parseSaveBuffer(buffer, record.region as Region);
      await patchHandleRecord({ lastModified: file.lastModified });
      // error was already cleared when syncing started; applyResult may set a
      // new one, so it must run after this update or the message is lost.
      setState((s) => ({ ...s, syncing: false, lastSynced: Date.now() }));
      applyResult(record, result);
    } catch (err) {
      setState((s) => ({
        ...s,
        syncing: false,
        error: err instanceof Error ? err.message : "Sync failed",
      }));
    }
  }, [applyResult, patchState]);

  /**
   * Serialized entry point for syncing. Tab return fires both `focus` and
   * `visibilitychange`, and a permission prompt closing fires `focus` while
   * requestReconnect is about to sync too, so calls overlap. Overlapping
   * calls join the in-flight run and schedule one more pass after it (cheap:
   * an unchanged file is skipped by lastModified), so a request made after
   * permission changed is never dropped. Skipped entirely while the picker is
   * replacing the stored handle, so a sync can't act on the old record.
   */
  const runSync = useCallback((): Promise<void> => {
    if (pickingRef.current) return Promise.resolve();
    if (inFlightRef.current) {
      rerunRef.current = true;
      return inFlightRef.current;
    }
    const run = (async () => {
      try {
        do {
          rerunRef.current = false;
          await syncOnce();
        } while (rerunRef.current && !pickingRef.current);
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = run;
    return run;
  }, [syncOnce]);

  const pickFile = useCallback(
    async (region: Region): Promise<FilePickResult | null> => {
      if (typeof window === "undefined" || !window.showOpenFilePicker) return null;
      setState((s) => ({ ...s, error: null }));
      pickingRef.current = true;
      try {
        // Call the picker first, while the click's user activation is fresh.
        const [handle] = await window.showOpenFilePicker({
          types: [
            {
              description: "MHFU save file",
              accept: { "application/octet-stream": [".bin", ".BIN"] },
            },
          ],
          excludeAcceptAllOption: false,
          multiple: false,
        });
        const file = await handle.getFile();
        // A sync that started before the click is still working on the old
        // record; let it finish before the record is replaced.
        await inFlightRef.current;
        await setHandleRecord({
          handle,
          region,
          lastModified: file.lastModified,
          characterIndex: null,
        });
        setState((s) => ({
          ...s,
          hasHandle: true,
          permission: "granted",
          fileName: handle.name,
          lastSynced: Date.now(),
          error: null,
        }));
        return { file, handle };
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return null;
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : "Could not open file",
        }));
        return null;
      } finally {
        pickingRef.current = false;
      }
    },
    []
  );

  const confirmSelection = useCallback(async (characterIndex: number, region: Region) => {
    // Store the region the hunter was actually loaded with: the select may
    // have changed since the file was picked.
    await patchHandleRecord({ characterIndex, region });
  }, []);

  const requestReconnect = useCallback(async () => {
    const record = await getHandleRecord();
    if (!record) return;
    try {
      const permission = await record.handle.requestPermission({ mode: "read" });
      setState((s) => ({ ...s, permission }));
      if (permission === "granted") await runSync();
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : "Permission request failed",
      }));
    }
  }, [runSync]);

  const forget = useCallback(async () => {
    await clearHandleRecord();
    // Browser support doesn't change by forgetting the file; keep it so the
    // picker UI and focus listener stay active.
    setState((s) => ({ ...DEFAULT_STATE, isSupported: s.isSupported }));
  }, []);

  useEffect(() => {
    const supported = fileHandleSupported();
    setState((s) => ({ ...s, isSupported: supported }));
    if (supported) runSync();
    // Only run once on mount — runSync is stable but re-checking permission
    // belongs to the visibility listener below, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!state.isSupported) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") runSync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [state.isSupported, runSync]);

  const value = useMemo(
    () => ({
      ...state,
      pickFile,
      confirmSelection,
      syncNow: runSync,
      requestReconnect,
      forget,
    }),
    [state, pickFile, confirmSelection, runSync, requestReconnect, forget]
  );

  return <FileSyncContext.Provider value={value}>{children}</FileSyncContext.Provider>;
}

export function useFileSync() {
  return useContext(FileSyncContext);
}
