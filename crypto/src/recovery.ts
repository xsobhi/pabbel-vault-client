import { decrypt, encrypt, importAesKey } from "./aead";
import { random, wipe } from "./bytes";
import { hkdfAesKey, rawMasterKey } from "./hkdf";
import { base32Decode, base32Encode } from "./totp";

/**
 * The recovery key (docs/crypto.md "Recovery key"): 32 random bytes
 * made on the device, shown once, held by the person - never by Pabbel.
 *
 *   wrap   = enc(HKDF-SHA256(RK, salt = "", info = "pabbel-vault-recovery-v1"), MK, "recovery-wrap")
 *   keyEnc = enc(MK, RK, "recovery-key")
 *
 * `wrap` lets a locked client that has RK get the master key back. `keyEnc`
 * lets any UNLOCKED client re-make `wrap` after a password change without
 * asking for RK again - whoever holds MK can already read everything, so it
 * learns nothing new from RK.
 *
 * Shown as RFC 4648 base32 (A-Z, 2-7), 52 characters in 13 groups of four.
 */
export const RECOVERY_INFO = "pabbel-vault-recovery-v1";
const WRAP_AAD = "recovery-wrap";
const KEY_AAD = "recovery-key";
const CHARS = 52;

export interface RecoveryFields { wrap: string; keyEnc: string }

export const newRecoveryKey = (): Uint8Array => random(32);

/** "ABCD EFGH …" - 13 groups of four. */
export function formatRecoveryKey(rk: Uint8Array): string {
  if (rk.length !== 32) throw new Error("recovery key must be 32 bytes");
  return (base32Encode(rk).match(/.{1,4}/g) ?? []).join(" ");
}

/**
 * What the person typed, back to 32 bytes - or null when it cannot be a key.
 * Forgiving about what people do when copying a code: case, spaces, dashes,
 * and the digits that look like base32 letters (0/O, 1/I, 8/B).
 */
export function parseRecoveryKey(typed: string): Uint8Array | null {
  const clean = typed.toUpperCase().replace(/[\s-]/g, "").replace(/0/g, "O").replace(/1/g, "I").replace(/8/g, "B");
  if (clean.length !== CHARS || !/^[A-Z2-7]+$/.test(clean)) return null;
  // 52 characters carry 260 bits: the last four must be zero, or this was not one of ours.
  if ("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(clean[CHARS - 1]) & 0b1111) return null;
  const bytes = base32Decode(clean);
  return bytes.length === 32 ? bytes : null;
}

/** The last group, which the person types back to show they saved the key. */
export const lastGroup = (rk: Uint8Array): string => formatRecoveryKey(rk).split(" ").at(-1) ?? "";

/** Both blobs for the server, for the master key `mk`. */
export async function recoveryFields(mk: CryptoKey, rk: Uint8Array): Promise<RecoveryFields> {
  const raw = await rawMasterKey(mk);
  try {
    return {
      wrap: await encrypt(await hkdfAesKey(rk, RECOVERY_INFO), raw, WRAP_AAD),
      keyEnc: await encrypt(mk, rk, KEY_AAD),
    };
  } finally {
    wipe(raw);
  }
}

/** The master key from the recovery key (extractable, as after a password unlock). Throws on a wrong key. */
export async function openWithRecoveryKey(wrap: string, rk: Uint8Array): Promise<CryptoKey> {
  const raw = await decrypt(await hkdfAesKey(rk, RECOVERY_INFO), wrap, WRAP_AAD);
  try {
    return await importAesKey(raw, true);
  } finally {
    wipe(raw);
  }
}

/** An unlocked client's way to the recovery key, for re-wrapping it under a new master key. Caller wipes. */
export const recoveryKeyFrom = (mk: CryptoKey, keyEnc: string): Promise<Uint8Array> => decrypt(mk, keyEnc, KEY_AAD);
