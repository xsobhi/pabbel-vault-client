/**
 * Where a tab's session key lives (docs/crypto.md "Web vault, surviving a
 * reload"): IndexedDB, as a NON-extractable CryptoKey (a structured clone, so
 * script can use it but never read its bytes). One record per tab id.
 */
export interface SessionKeyRecord { key: CryptoKey; touched: number }
export interface SessionKeyStore {
  get(id: string): Promise<SessionKeyRecord | null>;
  put(id: string, rec: SessionKeyRecord): Promise<void>;
  delete(id: string): Promise<void>;
  /** Drop every record untouched since `before` (tabs closed long ago). */
  purge(before: number): Promise<void>;
}

const DB = "pv-session";
const STORE = "keys";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export const idbSessionKeys: SessionKeyStore = {
  get: async (id) => ((await run<SessionKeyRecord>("readonly", (s) => s.get(id))) ?? null),
  put: async (id, rec) => { await run("readwrite", (s) => { s.put(rec, id); }); },
  delete: async (id) => { await run("readwrite", (s) => { s.delete(id); }); },
  purge: async (before) => {
    await run("readwrite", (s) => {
      const cur = s.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return;
        if (((c.value as SessionKeyRecord).touched ?? 0) < before) c.delete();
        c.continue();
      };
    });
  },
};
