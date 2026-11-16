/**
 * "Stay unlocked on this browser" (docs/crypto.md "Trusted browser").
 *
 * Opting in makes a random 32-byte device secret D here, asks the server for
 * a random 32-byte share S, and keeps D plus enc(HKDF(D || S), MK) in the
 * extension's own IndexedDB (trust-store.ts). When the vault is locked and something needs it, the share
 * is fetched again and the vault opens without the password. The server alone
 * never has D; this browser's disk alone never has S - and the server stops
 * handing S out when the browser is removed, after 30 days, or once the vault
 * password changes, or to any later sign-in of the extension. Auto-lock still
 * drops the keys; re-opening is just silent.
 */
import { verifyMkCheck } from "@vault/crypto/kdf";
import { unwrapPrivateKey } from "@vault/crypto/keys";
import { b64, unb64, wipe } from "@vault/crypto/bytes";
import { newDeviceSecret, unwrapForDevice, wrapForDevice } from "@vault/crypto/device";
import type { TrustEnded, TrustView } from "../shared/messages";
import { ApiError, vaultApi } from "./api";
import { account } from "./auth";
import { getKeys, setKeys } from "./session";
import { getLocal, getSession, LOCAL, removeLocal, SESSION, setLocal } from "./storage";
import { clearTrust, readTrust, writeTrust, type TrustRecord } from "./trust-store";

/** The master key open here is not the account's current one: the vault password was changed on another device. */
export class StaleKeyError extends Error { constructor() { super("vault password changed elsewhere"); } }

async function record(userId: number): Promise<TrustRecord | null> {
  const r = await readTrust();
  return r && r.userId === userId ? r : null;
}

/**
 * Trust this browser from now on. Needs the vault open: the master key is what
 * gets wrapped - and it must still be the account's (checked against /vault/me,
 * and again by the server, which stores the trust only while that mk_check is
 * current), or the wrap would open nothing.
 */
export async function trustThisBrowser(): Promise<void> {
  const k = await getKeys();
  if (!k) throw new Error("vault is locked");
  const me = await vaultApi.me();
  if (!me.mkCheck || !(await verifyMkCheck(k.mk, me.mkCheck))) throw new StaleKeyError();
  const old = await readTrust();
  const dev = await vaultApi.trustBrowser(me.mkCheck).catch((e) => { throw e instanceof ApiError && e.code === "STALE_KEY" ? new StaleKeyError() : e; });
  const d = newDeviceSecret(), s = unb64(dev.share);
  try {
    const wrap = await wrapForDevice(k.mk, d, s, dev.id);
    await writeTrust({ userId: k.userId, deviceId: dev.id, d: b64(d), wrap, expiresAt: Date.parse(dev.expiresAt) });
    await removeLocal(LOCAL.trustEnded);
  } finally {
    wipe(d, s);
  }
  // A row this browser no longer uses should not sit in the list until it expires.
  if (old && old.deviceId !== dev.id) void vaultApi.forgetBrowser(old.deviceId).catch(() => {});
}

/**
 * Stop trusting this browser: the local half goes now, and - when there is a
 * usable token to ask with - the server is asked to wipe its half. (Without
 * one, the server's half is bound to a sign-in that has ended: it is never
 * handed out again, and drops out of the web vault's list.)
 */
export async function forgetThisBrowser(tellServer = true): Promise<void> {
  const r = await readTrust();
  await clearTrust();
  if (r && tellServer) await vaultApi.forgetBrowser(r.deviceId).catch(() => {});
}

/** Trust over: remember why, so the unlock screen can say so and offer it again. */
async function ended(r: TrustRecord, why: TrustEnded, tellServer: boolean): Promise<false> {
  await clearTrust();
  await setLocal(LOCAL.trustEnded, { userId: r.userId, why });
  if (tellServer) void vaultApi.forgetBrowser(r.deviceId).catch(() => {});
  return false;
}

async function attempt(): Promise<boolean> {
  const who = await account();
  if (!who) return false;
  const r = await record(who.id);
  if (!r || (await getSession<boolean>(SESSION.manualLock))) return false;
  if (r.expiresAt <= Date.now()) return ended(r, "expired", true);
  let share: string;
  try {
    share = (await vaultApi.browserShare(r.deviceId)).share;
  } catch (e) {
    // 404/410: the server no longer trusts this browser. Anything else (offline, 5xx) leaves it trusted for next time.
    if (e instanceof ApiError && (e.status === 404 || e.status === 410)) return ended(r, e.code === "DEVICE_EXPIRED" ? "expired" : "revoked", false);
    return false;
  }
  const me = await vaultApi.me();
  if (!me.setUp || !me.mkCheck || !me.encPrivateKey || !me.publicKey) return ended(r, "revoked", true);
  const d = unb64(r.d), s = unb64(share);
  let mk: CryptoKey;
  try {
    mk = await unwrapForDevice(r.wrap, d, s, r.deviceId);
  } catch {
    return ended(r, "revoked", true);
  } finally {
    wipe(d, s);
  }
  // A wrap of an older master key opens, but not this vault: same as a revoked browser.
  if (!(await verifyMkCheck(mk, me.mkCheck))) return ended(r, "revoked", true);
  const priv = await unwrapPrivateKey(mk, me.encPrivateKey);
  await setKeys({ mk, priv, publicRaw: me.publicKey, userId: who.id });
  return true;
}

let inflight: Promise<boolean> | null = null;

/** Open the vault without the password if this browser is trusted. Single-flight: a burst of requests makes one round trip. */
export function silentUnlock(): Promise<boolean> {
  inflight ??= attempt().catch(() => false).finally(() => { inflight = null; });
  return inflight;
}

/** For anything that needs the vault open: already open, or opened silently on a trusted browser. */
export async function ensureUnlocked(): Promise<boolean> {
  return !!(await getKeys()) || silentUnlock();
}

export async function trustView(): Promise<TrustView> {
  const who = await account();
  if (!who) return { on: false, until: null, ended: null };
  const r = await record(who.id);
  const e = await getLocal<{ userId: number; why: TrustEnded }>(LOCAL.trustEnded);
  return { on: !!r, until: r?.expiresAt ?? null, ended: !r && e?.userId === who.id ? e.why : null };
}
