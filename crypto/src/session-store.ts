/**
 * What outlives a reload (docs/crypto.md "Web vault, surviving a
 * reload"). No key material is ever written to Web Storage:
 *
 *  - IndexedDB holds a per-tab session key, a NON-extractable AES-GCM CryptoKey
 *    (session-idb.ts) - script can use it, never read it;
 *  - sessionStorage holds { tab, blob = enc(sessionKey, MK, "session:<tab>"), at }
 *    - per tab, per Pabbel account, gone when the tab closes.
 *
 * Neither half opens anything alone. A reload past the lock period, a lock, or
 * a closed tab (its IndexedDB record is purged once idle) asks the password.
 */
import { decrypt, encrypt } from "./aead";
import { hex, random, wipe } from "./bytes";
import { idbSessionKeys, type SessionKeyStore } from "./session-idb";

let KEY = "pv.session";
/** One stored key per Pabbel account, so switching accounts never clears (or resumes) another account's session. */
export function setSessionScope(userId: number | null): void { KEY = userId == null ? "pv.session" : `pv.session.${userId}`; }
const TOUCH_EVERY_MS = 30_000;
/** How long an untouched session key may sit when auto-lock is off. */
const NO_LOCK_PURGE_MS = 24 * 60 * 60 * 1000;
let lastWrite = 0;

let keys: SessionKeyStore | null = typeof indexedDB === "undefined" ? null : idbSessionKeys;
/** Tests only: an in-memory stand-in for IndexedDB. */
export function setSessionKeyStore(s: SessionKeyStore | null): void { keys = s; }

interface Rec { tab: string; blob: string; at: number }
const store = () => (typeof sessionStorage === "undefined" ? null : sessionStorage);
const aadFor = (tab: string) => `session:${tab}`;

function readRec(): Rec | null {
  try {
    const r = JSON.parse(store()?.getItem(KEY) ?? "null") as Partial<Rec> | null;
    return r && typeof r.tab === "string" && typeof r.blob === "string" && typeof r.at === "number" ? (r as Rec) : null;
  } catch { return null; }
}

export async function persistMasterKey(mk: CryptoKey): Promise<void> {
  const s = store();
  if (!s || !keys || !mk.extractable) return;
  const tab = readRec()?.tab ?? hex(random(16));
  const sessionKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", mk));
  try {
    const blob = await encrypt(sessionKey, raw, aadFor(tab));
    const now = Date.now();
    await keys.put(tab, { key: sessionKey, touched: now });
    s.setItem(KEY, JSON.stringify({ tab, blob, at: now } satisfies Rec));
    lastWrite = now;
  } catch { /* storage blocked - password on reload instead */ } finally { wipe(raw); }
}

/** The master key's bytes if this tab's session is younger than the lock period; otherwise both halves go. Caller wipes. */
export async function storedMasterKey(maxAgeMs: number): Promise<Uint8Array | null> {
  if (!keys) return null;
  await keys.purge(Date.now() - (maxAgeMs > 0 ? maxAgeMs : NO_LOCK_PURGE_MS)).catch(() => {});
  const rec = readRec();
  if (!rec) return null;
  if (maxAgeMs > 0 && Date.now() - rec.at > maxAgeMs) { clearStored(); return null; }
  try {
    const k = await keys.get(rec.tab);
    if (!k) { clearStored(); return null; }
    return await decrypt(k.key, rec.blob, aadFor(rec.tab));
  } catch { clearStored(); return null; }
}

/** Activity keeps both halves alive alongside the in-memory timer. */
export function touchStored(): void {
  const s = store();
  const now = Date.now();
  if (!s || now - lastWrite < TOUCH_EVERY_MS) return;
  const rec = readRec();
  if (!rec) return;
  lastWrite = now;
  try { s.setItem(KEY, JSON.stringify({ ...rec, at: now })); } catch { /* ignore */ }
  void keys?.get(rec.tab).then((k) => (k ? keys?.put(rec.tab, { ...k, touched: now }) : undefined)).catch(() => {});
}

export function clearStored(): void {
  const rec = readRec();
  try { store()?.removeItem(KEY); } catch { /* ignore */ }
  if (rec) void keys?.delete(rec.tab).catch(() => {});
}
