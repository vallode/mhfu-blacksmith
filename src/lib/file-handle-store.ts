const DB_NAME = "mhfu-file-sync";
const DB_VERSION = 1;
const STORE = "meta";
const RECORD_KEY = "save-handle";

export interface FileHandleRecord {
  handle: FileSystemFileHandle;
  region: string;
  lastModified: number;
  /** Index into the save's character slots to auto-load on future syncs, or null until chosen. */
  characterIndex: number | null;
}

export function fileHandleSupported(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function getHandleRecord(): Promise<FileHandleRecord | null> {
  try {
    const rec = await withStore<FileHandleRecord | undefined>("readonly", (s) => s.get(RECORD_KEY));
    return rec ?? null;
  } catch {
    return null;
  }
}

export async function setHandleRecord(record: FileHandleRecord): Promise<void> {
  await withStore("readwrite", (s) => s.put(record, RECORD_KEY));
}

export async function patchHandleRecord(
  patch: Partial<Omit<FileHandleRecord, "handle">>,
): Promise<FileHandleRecord | null> {
  const rec = await getHandleRecord();
  if (!rec) return null;
  const next = { ...rec, ...patch };
  await setHandleRecord(next);
  return next;
}

export async function clearHandleRecord(): Promise<void> {
  await withStore("readwrite", (s) => s.delete(RECORD_KEY));
}
