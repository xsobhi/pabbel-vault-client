import { decrypt, encrypt, importAesKey } from "./aead";
import { concat, random, wipe } from "./bytes";
import { hkdfAesKey, rawMasterKey } from "./hkdf";

/**
 * "Stay unlocked on this browser" (docs/crypto.md "Trusted browser").
 *
 *   W    = HKDF-SHA256(D || S, salt = "", info = "pabbel-vault-device-v1")
 *   blob = enc(W, MK, "device:<device id>")
 *
 * D is 32 random bytes the browser makes and keeps; S is 32 random bytes the
 * server makes and keeps per browser. The browser stores D and the blob, the
 * server stores S, and only both together give W: a copy of the browser's
 * storage without the server's say-so opens nothing, and neither does
 * anything the server holds.
 */
export const DEVICE_INFO = "pabbel-vault-device-v1";
export const deviceAad = (deviceId: string) => `device:${deviceId}`;

export const newDeviceSecret = (): Uint8Array => random(32);

async function wrapKey(d: Uint8Array, s: Uint8Array): Promise<CryptoKey> {
  if (d.length !== 32 || s.length !== 32) throw new Error("device secret and share must be 32 bytes each");
  const ikm = concat(d, s);
  try {
    return await hkdfAesKey(ikm, DEVICE_INFO);
  } finally {
    wipe(ikm);
  }
}

/** The master key, wrapped for this browser. */
export async function wrapForDevice(mk: CryptoKey, d: Uint8Array, s: Uint8Array, deviceId: string): Promise<string> {
  const raw = await rawMasterKey(mk);
  try {
    return await encrypt(await wrapKey(d, s), raw, deviceAad(deviceId));
  } finally {
    wipe(raw);
  }
}

/** The master key back (extractable, like a password unlock's), or a throw when D, S, the id or the blob do not belong together. */
export async function unwrapForDevice(blob: string, d: Uint8Array, s: Uint8Array, deviceId: string): Promise<CryptoKey> {
  const raw = await decrypt(await wrapKey(d, s), blob, deviceAad(deviceId));
  try {
    return await importAesKey(raw, true);
  } finally {
    wipe(raw);
  }
}
