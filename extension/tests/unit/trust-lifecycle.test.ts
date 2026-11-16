/**
 * A trusted browser's record: where it lives (the extension's IndexedDB, not
 * storage.local), that it goes with every kind of sign-out, and that a master
 * key from before a password change elsewhere is never trusted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeVault, installChrome, PASSWORD } from "./fake-vault";

const idb = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../../src/background/idb-kv", () => ({
  idbGet: async (k: string) => structuredClone(idb.get(k)),
  idbSet: async (k: string, v: unknown) => { idb.set(k, structuredClone(v)); },
  idbDelete: async (k: string) => { idb.delete(k); },
}));

let store: ReturnType<typeof installChrome>;
let server: Awaited<ReturnType<typeof fakeVault>>;
let auth: typeof import("../../src/background/auth");
let trust: typeof import("../../src/background/trust");
let unlock: typeof import("../../src/background/unlock");
let trustStore: typeof import("../../src/background/trust-store");

beforeEach(async () => {
  vi.resetModules();
  idb.clear();
  store = installChrome();
  server = await fakeVault();
  auth = await import("../../src/background/auth");
  trust = await import("../../src/background/trust");
  unlock = await import("../../src/background/unlock");
  trustStore = await import("../../src/background/trust-store");
  // What index.ts registers.
  auth.onSigningOut((usable) => trust.forgetThisBrowser(usable));
});

const deletes = () => server.s.requests.filter((r) => r.method === "DELETE" && r.path.startsWith("/devices/"));
const old = { userId: 7, deviceId: "00000000-0000-4000-8000-000000000009", d: "ZA==", wrap: "dw==", expiresAt: Date.now() + 1e9 };

describe("where the record lives", () => {
  it("a record an earlier build left in storage.local moves to IndexedDB, and the storage.local copy is gone", async () => {
    store.local.set("pv.trust", old);
    await trustStore.migrateTrust();
    expect(idb.get("trust")).toEqual(old);
    expect(store.local.has("pv.trust")).toBe(false);
  });

  it("one already in IndexedDB wins; the stray copy is still removed", async () => {
    idb.set("trust", { ...old, deviceId: "newer" });
    store.local.set("pv.trust", old);
    await trustStore.migrateTrust();
    expect((idb.get("trust") as typeof old).deviceId).toBe("newer");
    expect(store.local.has("pv.trust")).toBe(false);
  });
});

describe("every sign-out ends the trust", () => {
  beforeEach(async () => { await unlock.unlock(PASSWORD, true); });

  it("signing out by hand: the local half goes and the server is told, while the token still works", async () => {
    const id = (idb.get("trust") as typeof old).deviceId;
    await auth.signOut();
    expect(idb.has("trust")).toBe(false);
    expect(deletes().map((r) => r.path)).toEqual([`/devices/${id}`]);
    expect(server.s.devices.get(id)!.revoked).toBe(true);
  });

  it("a refused refresh signs out: the local half goes, and nothing tries the dead token", async () => {
    server.s.refreshRefused = true;
    store.local.set("pv.auth", { ...(store.local.get("pv.auth") as object), refreshToken: "pblr_old", expiresAt: Date.now() + 1000, issuedAt: Date.now() - 3_600_000 });
    expect(await auth.refresh()).toBeNull();
    expect(store.local.has("pv.auth")).toBe(false);
    expect(idb.has("trust")).toBe(false);
    expect(deletes()).toEqual([]);
    // Signed out means locked (index.ts); signing the same account in again cannot open the vault without the password.
    await (await import("../../src/background/session")).lock();
    store.local.set("pv.auth", { accessToken: "pbl_new", refreshToken: null, expiresAt: null, user: { id: 7, email: "ada@example.com", name: "Ada" } });
    expect(await trust.ensureUnlocked()).toBe(false);
  });
});

describe("a master key from before a password change elsewhere", () => {
  it("is never trusted: refused here, and nothing reaches /devices", async () => {
    await unlock.unlock(PASSWORD);
    server.s.me = { ...server.s.me, mkCheck: "Y2hhbmdlZCBlbHNld2hlcmU=" };
    await expect(trust.trustThisBrowser()).rejects.toBeInstanceOf(trust.StaleKeyError);
    expect(server.s.requests.some((r) => r.path === "/devices")).toBe(false);
    expect(idb.has("trust")).toBe(false);
  });

  it("the server's compare-and-set refusal (409) is the same error, and nothing is stored", async () => {
    await unlock.unlock(PASSWORD);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/devices")) server.s.me = { ...server.s.me, mkCheck: "bW92ZWQ=" };
      return realFetch(url, init);
    }) as typeof fetch;
    await expect(trust.trustThisBrowser()).rejects.toBeInstanceOf(trust.StaleKeyError);
    expect(idb.has("trust")).toBe(false);
  });
});
