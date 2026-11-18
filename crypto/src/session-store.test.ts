import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateAesKeyBytes, importAesKey } from "./aead";
import { hex } from "./bytes";
import type { SessionKeyRecord, SessionKeyStore } from "./session-idb";
import { clearStored, persistMasterKey, setSessionKeyStore, setSessionScope, storedMasterKey } from "./session-store";

/** sessionStorage and the IndexedDB key store, in memory - and inspectable. */
const web = new Map<string, string>();
const idb = new Map<string, SessionKeyRecord>();
const keys: SessionKeyStore = {
  get: async (id) => idb.get(id) ?? null,
  put: async (id, rec) => { idb.set(id, rec); },
  delete: async (id) => { idb.delete(id); },
  purge: async (before) => { for (const [id, r] of idb) if (r.touched < before) idb.delete(id); },
};

beforeEach(() => {
  web.clear(); idb.clear();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => web.get(k) ?? null, setItem: (k: string, v: string) => web.set(k, v), removeItem: (k: string) => web.delete(k),
  });
  setSessionKeyStore(keys);
  setSessionScope(7);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const LOCK = 15 * 60 * 1000;
async function unlocked() {
  const raw = await generateAesKeyBytes();
  await persistMasterKey(await importAesKey(raw, true));
  return hex(raw);
}

describe("web session across a reload (session-store.ts)", () => {
  it("brings the master key back within the lock period", async () => {
    const mk = await unlocked();
    expect(hex((await storedMasterKey(LOCK))!)).toBe(mk);
  });

  it("never writes key material to Web Storage, and the IndexedDB key is non-extractable", async () => {
    const mk = await unlocked();
    const stored = [...web.values()].join("");
    expect(stored).not.toContain(mk);
    expect(stored).not.toContain(Buffer.from(mk, "hex").toString("base64"));
    const [rec] = [...idb.values()];
    expect(rec.key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", rec.key)).rejects.toThrow();
  });

  it("neither half alone opens anything", async () => {
    await unlocked();
    idb.clear();
    expect(await storedMasterKey(LOCK)).toBeNull();
    expect(web.size).toBe(0); // the orphaned blob is dropped
    await unlocked();
    web.clear();
    expect(await storedMasterKey(LOCK)).toBeNull();
  });

  it("refuses after the lock period and drops both halves", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await unlocked();
    vi.setSystemTime(Date.now() + LOCK + 1000);
    expect(await storedMasterKey(LOCK)).toBeNull();
    expect(web.size).toBe(0);
    expect(idb.size).toBe(0);
  });

  it("lock wipes both halves", async () => {
    await unlocked();
    clearStored();
    await new Promise((r) => setTimeout(r, 0));
    expect(web.size).toBe(0);
    expect(idb.size).toBe(0);
  });

  it("is per account", async () => {
    await unlocked();
    setSessionScope(8);
    expect(await storedMasterKey(LOCK)).toBeNull();
  });
});
