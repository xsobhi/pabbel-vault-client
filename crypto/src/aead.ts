import { b64, concat, random, unb64, utf8 } from "./bytes";

/**
 * The one symmetric envelope every platform must produce identically
 * (docs/crypto.md "Formats"):
 *
 *   base64( 0x01 || iv(12) || AES-256-GCM(key, plaintext, aad) )
 *
 * `aad` is a context string ("item:<id>", "vault:<id>", …) bound into the
 * tag, so a blob moved to another slot by the server fails to open.
 */
const VERSION = 0x01;
const IV_BYTES = 12;

export async function importAesKey(raw: Uint8Array, extractable = false): Promise<CryptoKey> {
  if (raw.length !== 32) throw new Error("AES key must be 32 bytes");
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, extractable, ["encrypt", "decrypt"]);
}

export async function generateAesKeyBytes(): Promise<Uint8Array> {
  return random(32);
}

export async function encrypt(key: CryptoKey, plaintext: Uint8Array, aad: string): Promise<string> {
  const iv = random(IV_BYTES);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: utf8(aad) as BufferSource, tagLength: 128 },
    key,
    plaintext as BufferSource,
  );
  return b64(concat(new Uint8Array([VERSION]), iv, new Uint8Array(ct)));
}

export async function decrypt(key: CryptoKey, blob: string, aad: string): Promise<Uint8Array> {
  const bytes = unb64(blob);
  if (bytes.length < 1 + IV_BYTES + 16 || bytes[0] !== VERSION) throw new Error("unsupported blob");
  const iv = bytes.subarray(1, 1 + IV_BYTES);
  const ct = bytes.subarray(1 + IV_BYTES);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: utf8(aad) as BufferSource, tagLength: 128 },
    key,
    ct as BufferSource,
  );
  return new Uint8Array(pt);
}

export const encryptString = (key: CryptoKey, text: string, aad: string) => encrypt(key, utf8(text), aad);
export async function decryptString(key: CryptoKey, blob: string, aad: string): Promise<string> {
  return new TextDecoder().decode(await decrypt(key, blob, aad));
}
export const encryptJson = (key: CryptoKey, value: unknown, aad: string) => encryptString(key, JSON.stringify(value), aad);
export async function decryptJson<T>(key: CryptoKey, blob: string, aad: string): Promise<T> {
  return JSON.parse(await decryptString(key, blob, aad)) as T;
}
