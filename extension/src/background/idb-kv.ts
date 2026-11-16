/**
 * A tiny key-value store in the extension origin's IndexedDB. Unlike
 * chrome.storage.local, which content scripts running inside web pages can
 * read, IndexedDB belongs to the origin that opened it: here the
 * chrome-extension:// (moz-extension://) origin, so only the background and
 * the extension's own pages can reach it. Same in Chrome and Firefox.
 */
const DB = "pabbel-vault";
const STORE = "kv";

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => { opening = null; }; // the browser may close it under us; reopen next time
      resolve(db);
    };
    req.onerror = () => { opening = null; reject(req.error); };
  });
  return opening;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const idbGet = <T>(key: string): Promise<T | undefined> => run<T | undefined>("readonly", (s) => s.get(key));
export const idbSet = (key: string, value: unknown): Promise<void> => run<void>("readwrite", (s) => s.put(value, key));
export const idbDelete = (key: string): Promise<void> => run<void>("readwrite", (s) => s.delete(key));
