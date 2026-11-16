/**
 * The one thing that outlives a reload: the master key, in sessionStorage.
 * sessionStorage is per tab and gone when the tab closes, so a reload or a
 * navigation inside the tab keeps the vault open, while a new tab, a closed
 * tab or the auto-lock period still ask for the password. Lock wipes it.
 */
import { b64, unb64, wipe } from "./bytes";

let KEY = "pv.session";
/** One stored key per Pabbel account, so switching accounts never clears (or resumes) another account's session. */
export function setSessionScope(userId: number | null): void { KEY = userId == null ? "pv.session" : `pv.session.${userId}`; }
const TOUCH_EVERY_MS = 30_000;
let lastWrite = 0;

const store = () => (typeof sessionStorage === "undefined" ? null : sessionStorage);

export async function persistMasterKey(mk: CryptoKey): Promise<void> {
  const s = store();
  if (!s || !mk.extractable) return;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", mk));
  try { s.setItem(KEY, JSON.stringify({ mk: b64(raw), at: Date.now() })); lastWrite = Date.now(); } catch { /* storage blocked - password on reload instead */ }
  wipe(raw);
}

/** The stored key if it is younger than the lock period; otherwise gone. Caller wipes. */
export function storedMasterKey(maxAgeMs: number): Uint8Array | null {
  const s = store();
  if (!s) return null;
  try {
    const rec = JSON.parse(s.getItem(KEY) ?? "null") as { mk: string; at: number } | null;
    if (!rec) return null;
    if (maxAgeMs > 0 && Date.now() - rec.at > maxAgeMs) { s.removeItem(KEY); return null; }
    return unb64(rec.mk);
  } catch { s.removeItem(KEY); return null; }
}

/** Activity keeps the stored copy alive alongside the in-memory timer. */
export function touchStored(): void {
  const s = store();
  if (!s || Date.now() - lastWrite < TOUCH_EVERY_MS) return;
  try {
    const rec = JSON.parse(s.getItem(KEY) ?? "null") as { mk: string; at: number } | null;
    if (rec) { s.setItem(KEY, JSON.stringify({ ...rec, at: Date.now() })); lastWrite = Date.now(); }
  } catch { /* ignore */ }
}

export function clearStored(): void {
  try { store()?.removeItem(KEY); } catch { /* ignore */ }
}
