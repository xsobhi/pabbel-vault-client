import { decrypt, encrypt, importAesKey } from "./aead";
import { b64, concat, hex, random, unb64, utf8, wipe } from "./bytes";

/**
 * Account key pair (ECDH P-256) and the ECIES envelope used to hand a team
 * vault key to a member (docs/crypto.md "Wrapped key to a public key"):
 *
 *   base64( 0x02 || ephemeralPublic(65, uncompressed) || iv(12) || AES-GCM(wrapKey, VK, aad) )
 *   wrapKey = HKDF-SHA256(ECDH(ephemeral, recipient), salt = "", info = "pabbel-vault-wrap-v1")
 *
 * Public keys travel as raw uncompressed points (65 bytes, base64); the
 * private key only ever leaves the device wrapped under the master key.
 */
const CURVE = "P-256";
const WRAP_VERSION = 0x02;
const WRAP_INFO = "pabbel-vault-wrap-v1";
const PRIVATE_KEY_AAD = "account-private-key";

export interface AccountKeys { publicKey: CryptoKey; privateKey: CryptoKey; publicRaw: string; fingerprint: string }

export async function generateAccountKeys(): Promise<AccountKeys> {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: CURVE }, true, ["deriveBits"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { publicKey: pair.publicKey, privateKey: pair.privateKey, publicRaw: b64(raw), fingerprint: await fingerprintOf(raw) };
}

/** SHA-256 of the raw public point, hex - what members compare out of band. */
export async function fingerprintOf(publicRaw: Uint8Array | string): Promise<string> {
  const bytes = typeof publicRaw === "string" ? unb64(publicRaw) : publicRaw;
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)));
}

export function importPublicKey(publicRaw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", unb64(publicRaw) as BufferSource, { name: "ECDH", namedCurve: CURVE }, true, []);
}

/** Private key at rest = enc(MK, pkcs8, "account-private-key"). */
export async function wrapPrivateKey(mk: CryptoKey, privateKey: CryptoKey): Promise<string> {
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
  try {
    return await encrypt(mk, pkcs8, PRIVATE_KEY_AAD);
  } finally {
    wipe(pkcs8);
  }
}

export async function unwrapPrivateKey(mk: CryptoKey, blob: string): Promise<CryptoKey> {
  const pkcs8 = await decrypt(mk, blob, PRIVATE_KEY_AAD);
  try {
    return await crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, { name: "ECDH", namedCurve: CURVE }, true, ["deriveBits"]);
  } finally {
    wipe(pkcs8);
  }
}

async function wrapKeyFor(shared: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", shared as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0) as BufferSource, info: utf8(WRAP_INFO) as BufferSource },
    base,
    256,
  ));
  try {
    return await importAesKey(bits);
  } finally {
    wipe(bits, shared);
  }
}

/** Wrap a 32-byte vault key to a member's public key. */
export async function wrapToPublic(recipientPublicRaw: string, vaultKey: Uint8Array, aad: string): Promise<string> {
  const recipient = await importPublicKey(recipientPublicRaw);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: CURVE }, true, ["deriveBits"]);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: recipient }, eph.privateKey, 256));
  const key = await wrapKeyFor(shared);
  const iv = random(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: utf8(aad) as BufferSource, tagLength: 128 }, key, vaultKey as BufferSource,
  ));
  const ephRaw = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  return b64(concat(new Uint8Array([WRAP_VERSION]), ephRaw, iv, ct));
}

/** The inverse, with this account's private key. Returns the raw 32 bytes. */
export async function unwrapWithPrivate(privateKey: CryptoKey, blob: string, aad: string): Promise<Uint8Array> {
  const bytes = unb64(blob);
  if (bytes[0] !== WRAP_VERSION || bytes.length < 1 + 65 + 12 + 16) throw new Error("unsupported wrapped key");
  const ephRaw = bytes.subarray(1, 66), iv = bytes.subarray(66, 78), ct = bytes.subarray(78);
  const eph = await crypto.subtle.importKey("raw", ephRaw as BufferSource, { name: "ECDH", namedCurve: CURVE }, true, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: eph }, privateKey, 256));
  const key = await wrapKeyFor(shared);
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource, additionalData: utf8(aad) as BufferSource, tagLength: 128 }, key, ct as BufferSource,
  ));
}

/** AAD strings, in one place so web and Android cannot drift. */
export const aad = {
  personalVaultKey: (vaultId: string) => `vault:${vaultId}`,
  memberWrap: (vaultId: string, userId: number) => `vault:${vaultId}:member:${userId}`,
  item: (itemId: string) => `item:${itemId}`,
  /** An email mask's meta (label, site) under the personal vault key. */
  mask: (maskId: string) => `mask:${maskId}`,
};
