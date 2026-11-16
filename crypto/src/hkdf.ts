import { utf8, wipe } from "./bytes";

/**
 * HKDF-SHA256 (RFC 5869), the one KDF for keys that are already random: the
 * ECIES wrap key, a trusted browser's wrapping key and the recovery key's.
 * (Passwords go through PBKDF2 in kdf.ts instead - they are not random.)
 * `info` names the purpose, so one input can never yield another purpose's key.
 */
export async function hkdf(ikm: Uint8Array, info: string | Uint8Array, length = 32, salt: Uint8Array = new Uint8Array(0)): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: (typeof info === "string" ? utf8(info) : info) as BufferSource },
    base,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** An AES-256-GCM key straight from HKDF; the derived bytes are wiped once imported. */
export async function hkdfAesKey(ikm: Uint8Array, info: string): Promise<CryptoKey> {
  const bits = await hkdf(ikm, info);
  try {
    return await crypto.subtle.importKey("raw", bits as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } finally {
    wipe(bits);
  }
}

/** The master key's raw 32 bytes, for wrapping it under another key. Needs an extractable MK (unlock derives one). */
export async function rawMasterKey(mk: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey("raw", mk));
}
