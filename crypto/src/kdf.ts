import { decryptString, encryptString, importAesKey } from "./aead";
import { b64, random, unb64, utf8, wipe } from "./bytes";

/**
 * Vault password -> master key.
 *
 * PBKDF2-HMAC-SHA256, 600 000 iterations (OWASP 2023), 16-byte salt, 256-bit
 * output. Chosen over Argon2 because WebCrypto has it natively and Android's
 * javax.crypto produces the identical bytes; the iteration count travels
 * with the salt so it can be raised for new passwords later.
 */
export const KDF_ITERATIONS = 600_000;
export const MK_CHECK_PLAINTEXT = "pabbel-vault-check";
const MK_CHECK_AAD = "mk-check";

export interface KdfParams { salt: string; iterations: number }

/**
 * The client's own bounds on the server-supplied iteration count
 * (docs/crypto.md "Floor"): fewer would hand a malicious server a fast
 * offline guess at the password, more would hang the device. Every stored
 * account had exactly 600 000 when the floor was set (2026-11-17).
 */
export const MIN_KDF_ITERATIONS = 600_000;
export const MAX_KDF_ITERATIONS = 10_000_000;
export class KdfParamsError extends Error {
  constructor(readonly iterations: unknown) { super("the server asked for an unsafe key-derivation setting"); }
}
export function assertKdfParams(params: KdfParams): void {
  const n = params.iterations;
  if (!Number.isInteger(n) || n < MIN_KDF_ITERATIONS || n > MAX_KDF_ITERATIONS) throw new KdfParamsError(n);
}

export function newKdfParams(): KdfParams {
  return { salt: b64(random(16)), iterations: KDF_ITERATIONS };
}

/** Derive the master key. The raw bytes are wiped; only the CryptoKey survives (extractable when the session must survive a reload). */
export async function deriveMasterKey(password: string, params: KdfParams, extractable = false): Promise<CryptoKey> {
  assertKdfParams(params);
  const pw = utf8(password.normalize("NFKC"));
  const base = await crypto.subtle.importKey("raw", pw as BufferSource, "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: unb64(params.salt) as BufferSource, iterations: params.iterations },
    base,
    256,
  ));
  wipe(pw);
  try {
    return await importAesKey(bits, extractable);
  } finally {
    wipe(bits);
  }
}

/** A known plaintext under MK: lets the client confirm a password before touching data. */
export const makeMkCheck = (mk: CryptoKey) => encryptString(mk, MK_CHECK_PLAINTEXT, MK_CHECK_AAD);

export async function verifyMkCheck(mk: CryptoKey, check: string): Promise<boolean> {
  try {
    return (await decryptString(mk, check, MK_CHECK_AAD)) === MK_CHECK_PLAINTEXT;
  } catch {
    return false;
  }
}

/** Rough strength guide for the setup screen - not a gate, a nudge. */
export function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^\w]/].filter((r) => r.test(pw)).length;
  // Under the 12-character floor is "too short", full stop - the same line the setup copy draws.
  if (pw.length < 12) return 0;
  if (pw.length >= 16 && classes >= 3) return 3;
  return classes >= 2 ? 2 : 1;
}
