import { decryptJson, encryptJson } from "../aead";

/**
 * The trust state (docs/crypto.md "Trust on first use"): identity keys
 * pinned per contact, and per team the highest key version verified as
 * signed. Pure functions; trust/book.ts does the storage.
 */
export interface TrustState {
  v: 1;
  /** userId -> identity public key (raw point, base64), pinned on first use. */
  contacts: Record<string, string>;
  /** vaultId -> highest key version verified under a signed wrap. Presence = migrated: never un-learnt. */
  vaults: Record<string, number>;
}

const AAD = "trust-state";
export const emptyTrust = (): TrustState => ({ v: 1, contacts: {}, vaults: {} });

/** Sealed under the personal vault key, which never rotates. */
export const sealTrust = (personalKey: CryptoKey, s: TrustState) => encryptJson(personalKey, s, AAD);

/** Null when absent, unreadable or not ours - the device copy then stands alone. */
export async function openTrust(personalKey: CryptoKey, blob: string | null | undefined): Promise<TrustState | null> {
  if (!blob) return null;
  try { return normalise(await decryptJson<unknown>(personalKey, blob, AAD)); } catch { return null; }
}

/** Anything that is not a well-formed state becomes null; stray fields are dropped. */
export function normalise(raw: unknown): TrustState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { v?: unknown; contacts?: unknown; vaults?: unknown };
  if (r.v !== 1) return null;
  const out = emptyTrust();
  for (const [k, val] of Object.entries((r.contacts ?? {}) as object)) if (/^\d+$/.test(k) && typeof val === "string") out.contacts[k] = val;
  for (const [k, val] of Object.entries((r.vaults ?? {}) as object)) if (Number.isInteger(val)) out.vaults[k] = val as number;
  return out;
}

/**
 * Device copy and server copy together. Contacts: union, and where they
 * disagree the DEVICE copy wins - the server cannot rewrite a pin this device
 * has seen; the server's key then shows as a change when it is used. Vaults:
 * the higher version.
 */
export function mergeTrust(device: TrustState | null, server: TrustState | null): TrustState {
  const out = emptyTrust();
  for (const s of [server, device]) if (s) Object.assign(out.contacts, s.contacts);
  for (const s of [server, device]) if (s) for (const [id, n] of Object.entries(s.vaults)) out.vaults[id] = Math.max(out.vaults[id] ?? 0, n);
  return out;
}

export const sameTrust = (a: TrustState, b: TrustState) => canonical(a) === canonical(b);
const canonical = (s: TrustState) => JSON.stringify([Object.entries(s.contacts).sort(), Object.entries(s.vaults).sort()]);

/** What a served identity key means against the pins. `legacy` = no identity, never pinned. */
export type PinVerdict = "new" | "same" | "changed" | "legacy";
export function judgePin(s: TrustState, userId: number, served: string | null | undefined): PinVerdict {
  const pinned = s.contacts[String(userId)];
  if (!served) return pinned ? "changed" : "legacy";
  if (!pinned) return "new";
  return pinned === served ? "same" : "changed";
}
