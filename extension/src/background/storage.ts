/**
 * The two stores and what is allowed in each.
 *
 * chrome.storage.local (on disk): the OAuth tokens, settings, the never-save
 * list, the icon cache (encrypted). Nothing that decrypts anything - a token
 * only reaches ciphertext. Content scripts can read this area, which is why a
 * trusted browser's record (D and the wrapped master key) lives in the
 * extension's own IndexedDB instead (trust-store.ts).
 *
 * chrome.storage.session (memory only, gone when the browser closes, and not
 * readable by content scripts): the unlocked key material, the ciphertext
 * cache, pending save prompts. It is what lets the vault survive the service
 * worker being stopped every 30 seconds without asking for the password again.
 */
export const LOCAL = {
  auth: "pv.auth",
  settings: "pv.settings",
  never: "pv.never",
  hasVault: "pv.hasVault",
  icons: "pv.icons",
  /** Only where an earlier build kept the trust record; moved out on startup (trust-store.ts). */
  trust: "pv.trust",
  trustEnded: "pv.trustEnded",
} as const;

export const SESSION = {
  keys: "pv.keys",
  activity: "pv.activity",
  data: "pv.data",
  frames: "pv.frames",
  pending: "pv.pending",
  lastUser: "pv.lastUser",
  nextStep: "pv.nextStep",
  codeStep: "pv.codeStep",
  /** Locked by hand: a trusted browser asks for the password until it is typed once (or the browser restarts). */
  manualLock: "pv.manualLock",
} as const;

export async function getLocal<T>(key: string): Promise<T | undefined> {
  return (await chrome.storage.local.get(key))[key] as T | undefined;
}
export async function setLocal(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}
export async function removeLocal(key: string): Promise<void> {
  await chrome.storage.local.remove(key);
}

export async function getSession<T>(key: string): Promise<T | undefined> {
  return (await chrome.storage.session.get(key))[key] as T | undefined;
}
export async function setSession(key: string, value: unknown): Promise<void> {
  await chrome.storage.session.set({ [key]: value });
}
export async function removeSession(...keys: string[]): Promise<void> {
  await chrome.storage.session.remove(keys);
}

/**
 * Session storage defaults to trusted contexts only; say so explicitly so a
 * future change has to be deliberate. Firefox has no setAccessLevel (its
 * session storage is never exposed to content scripts) - and an unguarded call
 * there throws before any listener is registered, killing the background.
 */
export function lockDownSessionStorage(): void {
  try {
    void chrome.storage.session.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" })?.catch(() => {});
  } catch { /* not supported here */ }
}
