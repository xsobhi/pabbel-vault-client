/**
 * "Stay unlocked on this browser", end to end in the worker against a fake
 * vault API: opting in, the silent unlock, and every way it must fail closed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { b64, unb64 } from "@vault/crypto/bytes";
import { fakeVault, installChrome, PASSWORD, rawOf, USER } from "./fake-vault";

// The extension's IndexedDB (idb-kv.ts) in memory: where the trust record must live.
const idb = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../../src/background/idb-kv", () => ({
  idbGet: async (k: string) => structuredClone(idb.get(k)),
  idbSet: async (k: string, v: unknown) => { idb.set(k, structuredClone(v)); },
  idbDelete: async (k: string) => { idb.delete(k); },
}));

let store: ReturnType<typeof installChrome>;
let server: Awaited<ReturnType<typeof fakeVault>>;
let unlock: typeof import("../../src/background/unlock");
let trust: typeof import("../../src/background/trust");
let session: typeof import("../../src/background/session");

beforeEach(async () => {
  vi.resetModules();
  idb.clear();
  store = installChrome();
  server = await fakeVault();
  unlock = await import("../../src/background/unlock");
  trust = await import("../../src/background/trust");
  session = await import("../../src/background/session");
});

type Rec = { userId: number; deviceId: string; d: string; wrap: string; expiresAt: number };
const record = () => idb.get("trust") as Rec | undefined;
const setRecord = (r: Rec) => idb.set("trust", r);
const deviceCalls = () => server.s.requests.filter((r) => r.path.startsWith("/devices"));
/** The keys gone the way auto-lock or a browser restart takes them (not a lock by hand). */
const dropKeys = () => session.lock();

describe("opting in", () => {
  it("is off unless asked: a plain unlock talks to no /devices route", async () => {
    expect(await unlock.unlock(PASSWORD)).toEqual({ ok: true });
    expect(record()).toBeUndefined();
    expect(deviceCalls()).toEqual([]);
  });

  it("needs the vault open", async () => {
    await expect(trust.trustThisBrowser()).rejects.toThrow(/locked/);
  });

  it("keeps D and the wrapped master key in the extension's IndexedDB, S on the server - the master key in clear nowhere", async () => {
    expect(await unlock.unlock(PASSWORD, true)).toEqual({ ok: true });
    const r = record()!;
    expect(r.userId).toBe(USER.id);
    expect(unb64(r.d)).toHaveLength(32);
    const mk = await rawOf(server.mk);
    const everything = JSON.stringify([...store.local.values(), ...idb.values()]);
    expect(everything).not.toContain(mk);
    // Nothing of it in storage.local, which content scripts can read.
    expect(JSON.stringify([...store.local.values()])).not.toContain(r.d);
    expect(JSON.stringify([...store.local.values()])).not.toContain(r.wrap);
    expect(everything).not.toContain(server.s.devices.get(r.deviceId)!.share);
    // The server was never sent D (or anything at all) when trusting.
    expect(JSON.stringify(server.s.requests)).not.toContain(r.d);
    // The server got only the mk_check this key matches (its compare-and-set), never D.
    expect(deviceCalls()).toEqual([{ method: "POST", path: "/devices", body: { currentMkCheck: server.s.me.mkCheck } }]);
    expect(await trust.trustView()).toMatchObject({ on: true, until: r.expiresAt, ended: null });
  });
});

describe("silent unlock", () => {
  beforeEach(async () => { await unlock.unlock(PASSWORD, true); });

  it("opens the same vault without the password once the keys are gone", async () => {
    await dropKeys();
    expect(await session.getKeys()).toBeNull();
    expect(await trust.ensureUnlocked()).toBe(true);
    expect(await rawOf((await session.getKeys())!.mk)).toBe(await rawOf(server.mk));
  });

  it("the popup opening counts as needing the vault; the settings page peeking does not", async () => {
    await dropKeys();
    expect(await unlock.vaultState(false)).toBe("locked");
    expect(await unlock.vaultState()).toBe("unlocked");
  });

  it("a burst of requests makes one round trip", async () => {
    await dropKeys();
    server.s.requests.length = 0;
    expect(await Promise.all([trust.ensureUnlocked(), trust.ensureUnlocked(), trust.ensureUnlocked()])).toEqual([true, true, true]);
    expect(deviceCalls()).toHaveLength(1);
  });

  it("a lock by hand holds until the password is typed", async () => {
    await session.lock(true);
    expect(await trust.ensureUnlocked()).toBe(false);
    expect(await unlock.unlock(PASSWORD)).toEqual({ ok: true });
    await dropKeys();
    expect(await trust.ensureUnlocked()).toBe(true);
  });

  it("removed on the web: refused, the local half deleted, and the unlock screen told why", async () => {
    const id = record()!.deviceId;
    server.s.devices.get(id)!.revoked = true;
    await dropKeys();
    expect(await trust.ensureUnlocked()).toBe(false);
    expect(record()).toBeUndefined();
    expect(await trust.trustView()).toEqual({ on: false, until: null, ended: "revoked" });
  });

  it("the vault password changed elsewhere: refused the same way", async () => {
    server.s.passwordChangedAt = Date.now() + 1;
    await dropKeys();
    expect(await trust.ensureUnlocked()).toBe(false);
    expect((await trust.trustView()).ended).toBe("revoked");
  });

  it("30 days up: asks for the password, and offers trust again", async () => {
    setRecord({ ...record()!, expiresAt: Date.now() - 1 });
    await dropKeys();
    expect(await trust.ensureUnlocked()).toBe(false);
    expect((await trust.trustView()).ended).toBe("expired");
    // The server is told to wipe its half as well.
    await new Promise((r) => setTimeout(r, 0));
    expect(deviceCalls().at(-1)?.method).toBe("DELETE");
    // The server's own clock says the same thing.
    await unlock.unlock(PASSWORD, true);
    const id = record()!.deviceId;
    server.s.devices.get(id)!.expiresAt = Date.now() - 1;
    await dropKeys();
    expect(await trust.ensureUnlocked()).toBe(false);
    expect((await trust.trustView()).ended).toBe("expired");
  });

  it("offline: stays locked now, and stays trusted for next time", async () => {
    await dropKeys();
    server.s.offline = true;
    expect(await trust.ensureUnlocked()).toBe(false);
    expect(record()).toBeDefined();
    server.s.offline = false;
    expect(await trust.ensureUnlocked()).toBe(true);
  });

  it("a copied D from another browser, or a tampered wrap, opens nothing and ends the trust", async () => {
    setRecord({ ...record()!, d: b64(new Uint8Array(32).fill(1)) });
    await dropKeys();
    expect(await trust.ensureUnlocked()).toBe(false);
    expect(record()).toBeUndefined();
  });

  it("only for the account that trusted it", async () => {
    store.local.set("pv.auth", { accessToken: "pbl_other", refreshToken: null, expiresAt: null, user: { id: 8, email: "bob@example.com", name: null } });
    await dropKeys();
    server.s.requests.length = 0;
    expect(await trust.ensureUnlocked()).toBe(false);
    expect(deviceCalls()).toEqual([]);
  });

  it("unticking the box at unlock forgets this browser on both sides", async () => {
    const id = record()!.deviceId;
    await session.lock(true);
    expect(await unlock.unlock(PASSWORD, false)).toEqual({ ok: true });
    expect(record()).toBeUndefined();
    expect(server.s.devices.get(id)!.revoked).toBe(true);
  });

  it("a trust the server refuses to create still leaves the vault unlocked, and says so", async () => {
    await trust.forgetThisBrowser();
    await session.lock(true);
    server.s.devices.set = () => { throw new Error("db down"); };
    expect(await unlock.unlock(PASSWORD, true)).toEqual({ ok: true, trustFailed: true });
    expect(await session.getKeys()).not.toBeNull();
  });
});
