import { decrypt, encrypt } from "./aead";
import { b64, unb64, utf8, wipe } from "./bytes";

/**
 * The account's identity key (docs/crypto.md "Signed team keys"): an
 * ECDSA P-256 pair whose private half is wrapped under the master key like
 * the ECDH private key. It signs the account's own ECDH public key (the key
 * binding) and every team-key wrap this account makes.
 *
 * Signatures are ECDSA-SHA256 in IEEE P1363 form (r || s, 64 bytes, base64)
 * over UTF-8 lines joined by "\n". Every field is a UUID, a decimal integer or
 * base64, none of which can hold a newline, so the encoding is unambiguous.
 */
const ALG = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIG = { name: "ECDSA", hash: "SHA-256" } as const;
const SIGNING_KEY_AAD = "account-signing-key";
export const ENC_KEY_LABEL = "pabbel-vault-enc-key-v1";
export const WRAP_SIG_LABEL = "pabbel-vault-wrap-sig-v1";

export interface Identity { privateKey: CryptoKey; publicRaw: string }

export async function generateIdentity(): Promise<Identity> {
  const pair = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
  return { privateKey: pair.privateKey, publicRaw: b64(await crypto.subtle.exportKey("raw", pair.publicKey)) };
}

/** enc(MK, pkcs8, "account-signing-key"). */
export async function wrapSigningKey(mk: CryptoKey, privateKey: CryptoKey): Promise<string> {
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
  try { return await encrypt(mk, pkcs8, SIGNING_KEY_AAD); } finally { wipe(pkcs8); }
}

/**
 * The private key back, with the public point it belongs to (from its JWK) - so
 * a caller can refuse a server that serves some other identity public key.
 */
export async function unwrapSigningKey(mk: CryptoKey, blob: string): Promise<Identity> {
  const pkcs8 = await decrypt(mk, blob, SIGNING_KEY_AAD);
  try {
    const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, ALG, true, ["sign"]);
    const jwk = await crypto.subtle.exportKey("jwk", privateKey);
    const point = new Uint8Array(65);
    point[0] = 0x04;
    point.set(unb64url(jwk.x!), 1);
    point.set(unb64url(jwk.y!), 33);
    return { privateKey, publicRaw: b64(point) };
  } finally { wipe(pkcs8); }
}

/** Re-wrap the signing key's bytes under a new master key (password change), without parsing them. */
export async function rewrapSigningKey(oldMk: CryptoKey, newMk: CryptoKey, blob: string): Promise<string> {
  const pkcs8 = await decrypt(oldMk, blob, SIGNING_KEY_AAD);
  try { return await encrypt(newMk, pkcs8, SIGNING_KEY_AAD); } finally { wipe(pkcs8); }
}

const message = (lines: (string | number)[]): Uint8Array => {
  for (const l of lines) if (String(l).includes("\n")) throw new Error("signed field holds a newline");
  return utf8(lines.join("\n"));
};

export async function sign(privateKey: CryptoKey, lines: (string | number)[]): Promise<string> {
  return b64(await crypto.subtle.sign(SIG, privateKey, message(lines) as BufferSource));
}

/** False for a bad signature, a malformed key or a malformed signature - never a throw. */
export async function verify(publicRaw: string, lines: (string | number)[], signature: string): Promise<boolean> {
  try {
    const sig = unb64(signature);
    if (sig.length !== 64) return false;
    const key = await crypto.subtle.importKey("raw", unb64(publicRaw) as BufferSource, ALG, false, ["verify"]);
    return await crypto.subtle.verify(SIG, key, sig as BufferSource, message(lines) as BufferSource);
  } catch {
    return false;
  }
}

/** The identity vouching for the account's own ECDH public key. */
export const encKeyStatement = (userId: number, encPublicRaw: string) => [ENC_KEY_LABEL, userId, encPublicRaw];

export interface WrapFields { vaultId: string; recipientId: number; keyVersion: number; wrappedKey: string; recipientEncPublic: string; signerId: number }
export const wrapStatement = (f: WrapFields) =>
  [WRAP_SIG_LABEL, f.vaultId, f.recipientId, f.keyVersion, f.wrappedKey, f.recipientEncPublic, f.signerId];

function unb64url(s: string): Uint8Array {
  const out = unb64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  if (out.length !== 32) throw new Error("bad JWK coordinate");
  return out;
}
