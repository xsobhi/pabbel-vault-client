/**
 * "Change vault password" in the extension: no old password, the standard
 * re-wrap (recovery key included), and a trusted browser trusted again under
 * the new master key - against a fake vault API.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt } from "@vault/crypto/aead";
import { b64 } from "@vault/crypto/bytes";
import { deriveMasterKey, verifyMkCheck } from "@vault/crypto/kdf";
import { aad, unwrapPrivateKey } from "@vault/crypto/keys";
import { openWithRecoveryKey, recoveryKeyFrom } from "@vault/crypto/recovery";
import { fakeVault, installChrome, PASSWORD, rawOf } from "./fake-vault";

const idb = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../../src/background/idb-kv", () => ({
  idbGet: async (k: string) => structuredClone(idb.get(k)),
  idbSet: async (k: string, v: unknown) => { idb.set(k, structuredClone(v)); },
  idbDelete: async (k: string) => { idb.delete(k); },
}));

const NEXT = "a whole new vault password";
let store: ReturnType<typeof installChrome>;
let server: Awaited<ReturnType<typeof fakeVault>>;
let unlock: typeof import("../../src/background/unlock");
let password: typeof import("../../src/background/password");
let session: typeof import("../../src/background/session");
let trust: typeof import("../../src/background/trust");

beforeEach(async () => {
  vi.resetModules();
  idb.clear();
  store = installChrome();
  server = await fakeVault({ recovery: true });
  unlock = await import("../../src/background/unlock");
  password = await import("../../src/background/password");
  session = await import("../../src/background/session");
  trust = await import("../../src/background/trust");
});

const sentBody = () => server.s.requests.filter((r) => r.path === "/password").at(-1)?.body as Record<string, any>;

describe("changing the vault password from the extension", () => {
  it("refuses while locked, and a password under 12 characters, before anything is sent", async () => {
    expect(await password.changeVaultPassword(NEXT)).toEqual({ ok: false, error: "locked" });
    await unlock.unlock(PASSWORD);
    expect(await password.changeVaultPassword("short")).toEqual({ ok: false, error: "too-short" });
    expect(sentBody()).toBeUndefined();
  });

  it("re-wraps the private key, the personal vault key and the recovery key under the new master key", async () => {
    await unlock.unlock(PASSWORD);
    expect(await password.changeVaultPassword(NEXT)).toEqual({ ok: true });
    const body = sentBody();
    const mk = await deriveMasterKey(NEXT, { salt: body.salt, iterations: body.iterations }, true);
    expect(await verifyMkCheck(mk, body.mkCheck)).toBe(true);
    expect(await rawOf((await session.getKeys())!.mk)).toBe(await rawOf(mk));
    await unwrapPrivateKey(mk, body.encPrivateKey);
    expect(b64(await decrypt(mk, body.personalKeys[0].encKey, aad.personalVaultKey("pv-1")))).toBe(b64(server.vk));
    // The recovery key the person saved still opens the vault - now with the new master key.
    expect(await rawOf(await openWithRecoveryKey(body.recovery.wrap, server.rk))).toBe(await rawOf(mk));
    expect(b64(await recoveryKeyFrom(mk, body.recovery.keyEnc))).toBe(b64(server.rk));
    // And the old password no longer opens anything.
    expect(await verifyMkCheck(server.mk, body.mkCheck)).toBe(false);
  });

  it("the next unlock takes the new password, not the old one", async () => {
    await unlock.unlock(PASSWORD);
    await password.changeVaultPassword(NEXT);
    await session.lock(true);
    expect(await unlock.unlock(PASSWORD)).toEqual({ ok: false, error: "wrong-password" });
    expect(await unlock.unlock(NEXT)).toEqual({ ok: true });
  });

  it("a trusted browser is trusted again under the new key (the server revoked the old trust)", async () => {
    await unlock.unlock(PASSWORD, true);
    const before = (idb.get("trust") as { deviceId: string }).deviceId;
    expect(await password.changeVaultPassword(NEXT)).toEqual({ ok: true });
    const after = (idb.get("trust") as { deviceId: string }).deviceId;
    expect(after).not.toBe(before);
    expect(server.s.devices.get(before)!.revoked).toBe(true);
    await session.lock();
    expect(await trust.ensureUnlocked()).toBe(true);
    expect(await rawOf((await session.getKeys())!.mk)).not.toBe(await rawOf(server.mk));
  });

  it("a browser that was not trusted stays untrusted", async () => {
    await unlock.unlock(PASSWORD);
    await password.changeVaultPassword(NEXT);
    expect(idb.get("trust")).toBeUndefined();
  });

  it("proves the account's private key with a fresh challenge: the server takes no change on the session alone", async () => {
    await unlock.unlock(PASSWORD);
    expect(await password.changeVaultPassword(NEXT)).toEqual({ ok: true });
    const paths = server.s.requests.map((r) => r.path);
    expect(paths.indexOf("/key-proof")).toBeGreaterThan(-1);
    expect(paths.indexOf("/key-proof")).toBeLessThan(paths.indexOf("/password"));
    expect(sentBody().keyProof).toMatchObject({ challenge: expect.any(String), proof: expect.any(String) });
  });

  it("sends the mk_check the old key matched, so the server replaces only that key", async () => {
    await unlock.unlock(PASSWORD);
    const before = server.s.me.mkCheck;
    await password.changeVaultPassword(NEXT);
    expect(sentBody().currentMkCheck).toBe(before);
  });

  it("the password was changed on another device: refused here before anything is sent", async () => {
    await unlock.unlock(PASSWORD);
    server.s.me = { ...server.s.me, mkCheck: "Y2hhbmdlZCBlbHNld2hlcmU=" };
    expect(await password.changeVaultPassword(NEXT)).toEqual({ ok: false, error: "stale" });
    expect(sentBody()).toBeUndefined();
  });

  it("a change landing in between: the server's 409 is reported as stale, and the old keys stay", async () => {
    await unlock.unlock(PASSWORD);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/password")) server.s.me = { ...server.s.me, mkCheck: "bW92ZWQ=" };
      return realFetch(url, init);
    }) as typeof fetch;
    expect(await password.changeVaultPassword(NEXT)).toEqual({ ok: false, error: "stale" });
    expect(await rawOf((await session.getKeys())!.mk)).toBe(await rawOf(server.mk));
  });

  it("a server failure changes nothing here: the old keys stay", async () => {
    await unlock.unlock(PASSWORD);
    server.s.failPassword = true;
    expect(await password.changeVaultPassword(NEXT)).toEqual({ ok: false, error: "failed" });
    expect(await rawOf((await session.getKeys())!.mk)).toBe(await rawOf(server.mk));
  });

  it("with no recovery key, none is sent (and none invented)", async () => {
    server.s.me = { ...server.s.me, recovery: null };
    await unlock.unlock(PASSWORD);
    await password.changeVaultPassword(NEXT);
    expect(sentBody().recovery).toBeUndefined();
  });
});
