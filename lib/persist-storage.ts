import { create } from "zustand";
import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * Persistence for the project store.
 *
 * Projects can embed the uploaded plot drawing as a base64 image, which quickly exceeds the ~5 MB
 * localStorage quota and made saves fail silently. State is therefore kept in IndexedDB (hundreds
 * of MB available), with localStorage as a fallback for browsers where IndexedDB is unavailable.
 *
 * Writes are coalesced (the latest state wins) and flushed when the tab is hidden or closed.
 * Any failure is surfaced through `useSaveStatus` so the UI can warn the user instead of losing work.
 */

const DB_NAME = "dubai-plot-analysis";
const STORE = "kv";
const WRITE_DELAY_MS = 250;

interface SaveStatus {
  error: string | null;
  lastSavedAt: number | null;
}

export const useSaveStatus = create<SaveStatus>(() => ({ error: null, lastSavedAt: null }));

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not available"));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("Could not open IndexedDB"));
      req.onblocked = () => reject(new Error("IndexedDB is blocked by another tab"));
    });
    // Let a later call retry instead of caching the failure forever.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error ?? req.error ?? new Error("IndexedDB request failed"));
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      })
  );
}

function readLocal<S>(name: string): StorageValue<S> | null {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(name) : null;
    return raw ? (JSON.parse(raw) as StorageValue<S>) : null;
  } catch {
    return null;
  }
}

/* ---------- write queue ---------- */

const pending = new Map<string, unknown>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> = Promise.resolve();
let listenersBound = false;

async function writeOne(name: string, value: unknown) {
  try {
    await run("readwrite", (s) => s.put(value, name));
    // Once IndexedDB holds the data, drop any legacy localStorage copy to free quota.
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
    useSaveStatus.setState({ error: null, lastSavedAt: Date.now() });
  } catch (idbError) {
    try {
      localStorage.setItem(name, JSON.stringify(value));
      useSaveStatus.setState({ error: null, lastSavedAt: Date.now() });
    } catch {
      const reason = idbError instanceof Error ? idbError.message : String(idbError);
      useSaveStatus.setState({
        error: `Your latest changes could not be saved in this browser (${reason}). Export your projects as JSON to keep a copy.`,
      });
    }
  }
}

/** Write every queued value now. Resolves once the data is committed. */
export function flushPersist(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const batch = Array.from(pending.entries());
  pending.clear();
  inFlight = inFlight.then(async () => {
    for (const [name, value] of batch) await writeOne(name, value);
  });
  return inFlight;
}

function bindFlushListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  const flushIfPending = () => {
    if (pending.size > 0) void flushPersist();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushIfPending();
  });
  window.addEventListener("pagehide", flushIfPending);
}

export function createIdbStorage<S>(): PersistStorage<S> {
  return {
    getItem: async (name) => {
      if (typeof window === "undefined") return null;
      try {
        const stored = await run<StorageValue<S> | undefined>("readonly", (s) => s.get(name));
        if (stored) return stored;
      } catch {
        /* fall back to localStorage below */
      }
      // First run after the switch to IndexedDB, or IndexedDB unavailable.
      return readLocal<S>(name);
    },
    setItem: (name, value) => {
      if (typeof window === "undefined") return;
      bindFlushListeners();
      // State objects are replaced (never mutated) on every update, so keeping the reference is safe.
      pending.set(name, value);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flushPersist(), WRITE_DELAY_MS);
    },
    removeItem: async (name) => {
      pending.delete(name);
      try {
        await run("readwrite", (s) => s.delete(name));
      } catch {
        /* ignore */
      }
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}
