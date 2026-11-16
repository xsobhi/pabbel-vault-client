/**
 * Where a trusted browser's record lives: the device secret D and the master
 * key wrapped under HKDF(D || S). It sits in the extension's own IndexedDB
 * (idb-kv.ts), out of reach of content scripts - not in storage.local next to
 * the refresh token, where an earlier build kept it.
 */
import { getLocal, LOCAL, removeLocal } from "./storage";
import { idbDelete, idbGet, idbSet } from "./idb-kv";

export interface TrustRecord { userId: number; deviceId: string; d: string; wrap: string; expiresAt: number }

const KEY = "trust";

export const readTrust = () => idbGet<TrustRecord>(KEY);
export const writeTrust = (r: TrustRecord) => idbSet(KEY, r);
export const clearTrust = () => idbDelete(KEY);

/**
 * Startup: a record an earlier build left in storage.local moves into
 * IndexedDB (unless one is there already) and the storage.local copy is
 * deleted either way, so content scripts can no longer read it.
 */
export async function migrateTrust(): Promise<void> {
  const old = await getLocal<TrustRecord>(LOCAL.trust);
  if (!old) return;
  try {
    if (!(await readTrust())) await writeTrust(old);
  } finally {
    await removeLocal(LOCAL.trust);
  }
}
