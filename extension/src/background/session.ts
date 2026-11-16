/**
 * The unlocked state: master key + account private key, in memory and in
 * storage.session (memory-only, trusted contexts only). MV3 stops an idle
 * worker after ~30 s; on the next wake the keys come back from storage.session
 * instead of asking for the password again - unless the auto-lock period ran
 * out while the worker slept, which is checked before anything is restored.
 *
 * The master key is derived here and never leaves the worker: popups get
 * decrypted items, content scripts get one picked item's fields, nobody gets
 * a key.
 */
import { importAesKey } from "@vault/crypto/aead";
import { b64, unb64, wipe } from "@vault/crypto/bytes";
import { getSession, removeSession, SESSION, setSession } from "./storage";
import { getSettings, lockMsOf } from "./settings";

export interface Keys { mk: CryptoKey; priv: CryptoKey; publicRaw: string; userId: number }
interface StoredKeys { mk: string; priv: string; publicRaw: string; userId: number }

let keys: Keys | null = null;
let lockMs = 15 * 60 * 1000;
let lastActivity = 0;
const lockListeners = new Set<() => void>();
export const onLock = (fn: () => void) => { lockListeners.add(fn); };

/** 0 = never by time; storage.session still dies with the browser. */
export function setLockMs(ms: number): void { lockMs = ms; }
export const getLockMs = () => lockMs;

export async function setKeys(k: Keys): Promise<void> {
  const mkRaw = new Uint8Array(await crypto.subtle.exportKey("raw", k.mk));
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", k.priv));
  keys = k;
  await setSession(SESSION.keys, { mk: b64(mkRaw), priv: b64(pkcs8), publicRaw: k.publicRaw, userId: k.userId } satisfies StoredKeys);
  wipe(mkRaw, pkcs8);
  await touch(true);
}

let restoring: Promise<Keys | null> | null = null;

/** The keys, restored after a worker restart if the lock period has not run out. Null = locked. */
export function getKeys(): Promise<Keys | null> {
  if (keys) return Promise.resolve(keys);
  restoring ??= (async () => {
    const stored = await getSession<StoredKeys>(SESSION.keys);
    if (!stored) return null;
    // A fresh worker has not read the lock period yet - it decides whether these keys are still valid.
    lockMs = lockMsOf(await getSettings());
    const at = (await getSession<number>(SESSION.activity)) ?? 0;
    if (lockMs > 0 && Date.now() - at >= lockMs) { await lock(); return null; }
    const mkRaw = unb64(stored.mk), pkcs8 = unb64(stored.priv);
    try {
      const mk = await importAesKey(mkRaw, true);
      const priv = await crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      keys = { mk, priv, publicRaw: stored.publicRaw, userId: stored.userId };
      lastActivity = at;
      return keys;
    } finally { wipe(mkRaw, pkcs8); }
  })().finally(() => { restoring = null; });
  return restoring;
}

export const isUnlockedNow = () => keys !== null;

/**
 * `manual`: the person locked it themselves (popup, settings, the toolbar
 * menu). A trusted browser then waits for the password instead of opening
 * silently the next time something needs the vault - locking by hand means
 * "nobody gets in here now", which an automatic re-unlock would undo.
 */
export async function lock(manual = false): Promise<void> {
  const was = keys !== null || (await getSession(SESSION.keys)) !== undefined;
  keys = null;
  await removeSession(SESSION.keys, SESSION.data, SESSION.activity, SESSION.nextStep, SESSION.codeStep);
  if (manual) await setSession(SESSION.manualLock, true);
  if (was) for (const fn of lockListeners) fn();
}

const TOUCH_WRITE_MS = 10_000;
let lastWrite = 0;
const activityListeners = new Set<(at: number) => void>();
export const onActivity = (fn: (at: number) => void) => { activityListeners.add(fn); };

/** The person used the vault: push the auto-lock out. Writes are throttled; the alarm follows. */
export async function touch(force = false): Promise<void> {
  if (!keys && !force) return;
  lastActivity = Date.now();
  if (force || lastActivity - lastWrite >= TOUCH_WRITE_MS) {
    lastWrite = lastActivity;
    await setSession(SESSION.activity, lastActivity);
    for (const fn of activityListeners) fn(lastActivity);
  }
}

export async function lastActivityAt(): Promise<number> {
  return lastActivity || (await getSession<number>(SESSION.activity)) || 0;
}
