/**
 * The unlocked state: master key, account private key and the vault keys
 * opened so far. Module-level memory, plus one per-tab copy of the master
 * key in sessionStorage (session-store.ts) so a reload does not ask for the
 * password again; a closed tab or the auto-lock timer leaves nothing behind.
 */
import { wipe } from "./bytes";
import { clearStored, persistMasterKey, touchStored } from "./session-store";

export interface Unlocked {
  masterKey: CryptoKey;
  privateKey: CryptoKey;
  publicRaw: string;
  fingerprint: string;
}

type Listener = () => void;

const DEFAULT_LOCK_MS = 15 * 60 * 1000;

let unlocked: Unlocked | null = null;
const vaultKeys = new Map<string, { key: CryptoKey; raw: Uint8Array; version: number }>();
const listeners = new Set<Listener>();
let lockTimer: ReturnType<typeof setTimeout> | null = null;
let lockAfterMs = DEFAULT_LOCK_MS;
let lastActivity = Date.now();

function notify() { for (const l of listeners) l(); }

export function onSessionChange(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export const isUnlocked = () => unlocked !== null;
export function current(): Unlocked {
  if (!unlocked) throw new Error("vault is locked");
  return unlocked;
}

export function setUnlocked(u: Unlocked): void {
  unlocked = u;
  touch();
  void persistMasterKey(u.masterKey);
  notify();
}

export function lock(): void {
  for (const v of vaultKeys.values()) wipe(v.raw);
  vaultKeys.clear();
  unlocked = null;
  clearStored();
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = null;
  notify();
}

/** Any user activity pushes the auto-lock out again. */
export function touch(): void {
  lastActivity = Date.now();
  if (unlocked) touchStored();
  if (lockTimer) clearTimeout(lockTimer);
  if (unlocked && lockAfterMs > 0) lockTimer = setTimeout(() => { if (Date.now() - lastActivity >= lockAfterMs) lock(); }, lockAfterMs);
}

export function setLockAfter(ms: number): void {
  lockAfterMs = ms;
  touch();
}
export const getLockAfter = () => lockAfterMs;

export function rememberVaultKey(vaultId: string, raw: Uint8Array, key: CryptoKey, version: number): void {
  const old = vaultKeys.get(vaultId);
  if (old) wipe(old.raw);
  vaultKeys.set(vaultId, { key, raw, version });
}

export function vaultKey(vaultId: string): { key: CryptoKey; raw: Uint8Array; version: number } | null {
  return vaultKeys.get(vaultId) ?? null;
}

export function forgetVaultKey(vaultId: string): void {
  const v = vaultKeys.get(vaultId);
  if (v) wipe(v.raw);
  vaultKeys.delete(vaultId);
}

/** Lock when the tab has been hidden for the lock period. */
export function installVisibilityLock(): () => void {
  if (typeof document === "undefined") return () => {};
  let hiddenAt: number | null = null;
  const onVis = () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else if (hiddenAt !== null && unlocked && Date.now() - hiddenAt >= lockAfterMs) lock();
    else hiddenAt = null;
  };
  const onActivity = () => touch();
  document.addEventListener("visibilitychange", onVis);
  for (const ev of ["pointerdown", "keydown"]) document.addEventListener(ev, onActivity, { passive: true });
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    for (const ev of ["pointerdown", "keydown"]) document.removeEventListener(ev, onActivity);
  };
}
