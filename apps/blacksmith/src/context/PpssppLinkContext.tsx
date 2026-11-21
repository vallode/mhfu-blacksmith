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
import { parseHunterBlock } from "@/hooks/useSaveWorker";
import { useSave } from "@/context/SaveContext";
import { saveFromCharacter } from "@/lib/save-store";
import {
  connectFirst,
  discoverPorts,
  HUNTER_ADDRESSES,
  readLiveHunter,
  type PpssppDebugger,
} from "@/lib/ppsspp-link";

/**
 * What the last sync found:
 * - `off`: the link isn't turned on.
 * - `searching`: looking for PPSSPP (the first sync, or after losing it).
 * - `linked`: the hunter loaded in the game was read.
 * - `notFound`: no PPSSPP answered (not running, or the remote debugger is off).
 * - `noGame`: PPSSPP is running without a game.
 * - `otherGame`: PPSSPP is running another game.
 * - `noHunter`: MHFU is running, but no hunter is loaded (the title screen).
 */
export type LinkStatus =
  "off" | "searching" | "linked" | "notFound" | "noGame" | "otherGame" | "noHunter";

export interface PpssppLinkState {
  enabled: boolean;
  status: LinkStatus;
  syncing: boolean;
  port: number | null;
  gameId: string | null;
  lastSynced: number | null;
  /** The browser's or PPSSPP's own message when a sync failed. */
  error: string | null;
}

interface PpssppLinkValue extends PpssppLinkState {
  enable: () => Promise<void>;
  disable: () => void;
  syncNow: () => Promise<void>;
  /**
   * Uses this port for PPSSPP from now on, then syncs. For when PPSSPP's
   * discovery list can't match this browser to PPSSPP (Safari's list comes
   * back empty), so the port has to be typed in.
   */
  setPort: (port: number) => Promise<void>;
}

const STORAGE_KEY = "mhfu-ppsspp-link";

interface Stored {
  enabled: boolean;
  /** The port PPSSPP last answered on (it keeps its port between runs). */
  port?: number;
  /** Hunter addresses found by scanning, by game ID, for releases the site doesn't list. */
  addresses?: Record<string, number>;
}

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

function writeStored(patch: Partial<Stored>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStored(), ...patch }));
  } catch {
    // Private windows can refuse storage; the link then lasts this visit.
  }
}

const DEFAULT_STATE: PpssppLinkState = {
  enabled: false,
  status: "off",
  syncing: false,
  port: null,
  gameId: null,
  lastSynced: null,
  error: null,
};

const PpssppLinkContext = createContext<PpssppLinkValue>({
  ...DEFAULT_STATE,
  enable: async () => {},
  disable: () => {},
  syncNow: async () => {},
  setPort: async () => {},
});

/**
 * Syncs from coming back to the tab run at most this often, so flicking
 * between the game and the site doesn't pause the game each time. "Sync now"
 * and the other buttons sync straight away.
 */
const AUTO_SYNC_INTERVAL = 15_000;

/** A scan of the game's memory for a hunter (a release the site doesn't list) runs at most this often. */
const SCAN_INTERVAL = 60_000;

/**
 * Keeps the hunter in sync with the one loaded in a running PPSSPP, read
 * from its memory over the remote debugger (src/lib/ppsspp-link.ts). Syncs
 * when the link is turned on, when the site's tab comes back into view or
 * focus (as after switching from the game; at most every AUTO_SYNC_INTERVAL,
 * catching up once that has passed if the tab is still in view), and on
 * "Sync now". While
 * linked, the save file sync (FileSyncContext) leaves the hunter alone.
 */
export function PpssppLinkProvider({ children }: { children: React.ReactNode }) {
  const { load } = useSave();
  const [state, setState] = useState<PpssppLinkState>(DEFAULT_STATE);
  const enabledRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const rerunRef = useRef(false);
  const lastScanRef = useRef(0);
  /** When the last sync started, of any kind. */
  const lastSyncRef = useRef(0);

  const patch = useCallback((p: Partial<PpssppLinkState>) => {
    setState((s) =>
      (Object.keys(p) as (keyof PpssppLinkState)[]).every((k) => s[k] === p[k])
        ? s
        : { ...s, ...p },
    );
  }, []);

  const connect = useCallback(async (): Promise<PpssppDebugger | null> => {
    const stored = readStored();
    if (stored.port) {
      const known = await connectFirst([stored.port]);
      if (known) {
        patch({ port: known.port });
        return known.debugger;
      }
    }
    patch({ status: "searching" });
    const found = await connectFirst(await discoverPorts());
    if (!found) return null;
    writeStored({ port: found.port });
    patch({ port: found.port });
    return found.debugger;
  }, [patch]);

  const syncOnce = useCallback(async () => {
    if (!enabledRef.current) return;
    lastSyncRef.current = Date.now();
    patch({ syncing: true, error: null });
    let dbg: PpssppDebugger | null = null;
    try {
      dbg = await connect();
      if (!dbg) {
        patch({ status: "notFound", syncing: false, gameId: null });
        return;
      }
      const stored = readStored();
      const scan = Date.now() - lastScanRef.current > SCAN_INTERVAL;
      const read = await readLiveHunter(dbg, { known: stored.addresses, scan });
      if (read.kind === "noGame") {
        patch({ status: "noGame", syncing: false, gameId: null });
        return;
      }
      if (read.kind !== "hunter") {
        if (read.kind === "noHunter" && scan) lastScanRef.current = Date.now();
        patch({ status: read.kind, syncing: false, gameId: read.gameId });
        return;
      }
      const listed = HUNTER_ADDRESSES[read.gameId] === read.address;
      if (!listed && stored.addresses?.[read.gameId] !== read.address) {
        writeStored({ addresses: { ...stored.addresses, [read.gameId]: read.address } });
      }
      const result = await parseHunterBlock(read.block, read.region);
      const character = result.characters[0];
      // A disable while the read was in flight wins.
      if (!enabledRef.current) return;
      if (character) load({ ...saveFromCharacter(character, read.region), source: "ppsspp" });
      patch({
        status: character ? "linked" : "noHunter",
        syncing: false,
        gameId: read.gameId,
        lastSynced: Date.now(),
      });
    } catch (err) {
      patch({
        syncing: false,
        error: err instanceof Error && err.message ? err.message : String(err),
      });
    } finally {
      dbg?.close();
    }
  }, [connect, load, patch]);

  // Focus and visibilitychange both fire on returning to the tab: overlapping
  // calls join the one running and ask for one more pass after it.
  const runSync = useCallback((): Promise<void> => {
    if (inFlightRef.current) {
      rerunRef.current = true;
      return inFlightRef.current;
    }
    const run = (async () => {
      try {
        do {
          rerunRef.current = false;
          await syncOnce();
        } while (rerunRef.current);
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = run;
    return run;
  }, [syncOnce]);

  const enable = useCallback(async () => {
    enabledRef.current = true;
    writeStored({ enabled: true });
    lastScanRef.current = 0;
    patch({ enabled: true, status: "searching" });
    await runSync();
  }, [patch, runSync]);

  const setPort = useCallback(
    async (port: number) => {
      writeStored({ port });
      patch({ port });
      await runSync();
    },
    [patch, runSync],
  );

  const disable = useCallback(() => {
    enabledRef.current = false;
    writeStored({ enabled: false });
    setState(DEFAULT_STATE);
  }, []);

  useEffect(() => {
    const stored = readStored();
    if (!stored.enabled) return;
    enabledRef.current = true;
    patch({ enabled: true, status: "searching", port: stored.port ?? null });
    runSync();
    // Once on mount: later syncs come from focus and the buttons.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!state.enabled) return;
    let catchUp: ReturnType<typeof setTimeout> | undefined;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(catchUp);
      const wait = lastSyncRef.current + AUTO_SYNC_INTERVAL - Date.now();
      if (wait <= 0) {
        runSync();
        return;
      }
      // Too soon after the last sync: sync once the interval is up, if the
      // tab is still in view then.
      catchUp = setTimeout(() => {
        if (document.visibilityState === "visible") runSync();
      }, wait);
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") clearTimeout(catchUp);
    };
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("focus", onVisible);
    return () => {
      clearTimeout(catchUp);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("focus", onVisible);
    };
  }, [state.enabled, runSync]);

  const value = useMemo(
    () => ({ ...state, enable, disable, syncNow: runSync, setPort }),
    [state, enable, disable, runSync, setPort],
  );

  return <PpssppLinkContext.Provider value={value}>{children}</PpssppLinkContext.Provider>;
}

export function usePpssppLink() {
  return useContext(PpssppLinkContext);
}
