/**
 * Vault password -> master key, in the worker, exactly as the web vault does
 * it (vault-client.ts unlockVault): PBKDF2-SHA256 with the account's own salt
 * and iteration count, checked against mk_check BEFORE anything else is
 * touched, then the account private key unwrapped under it.
 */
import { deriveMasterKey, verifyMkCheck } from "@vault/crypto/kdf";
import { unwrapPrivateKey } from "@vault/crypto/keys";
import type { UnlockResult, VaultState } from "../shared/messages";
import { ApiError, vaultApi } from "./api";
import { account } from "./auth";
import { getKeys, setKeys } from "./session";
import { getLocal, LOCAL, removeSession, SESSION, setLocal } from "./storage";
import { forgetThisBrowser, silentUnlock, trustThisBrowser, trustView } from "./trust";

interface HasVault { userId: number; setUp: boolean }

/**
 * `trust`: the "Stay unlocked on this browser" box. true trusts this browser
 * (if it is not already), false stops trusting it, undefined leaves it as is.
 * The vault is open either way; a trust that could not be set up is reported
 * beside the success, never instead of it.
 */
export async function unlock(password: string, trust?: boolean): Promise<UnlockResult> {
  const who = await account();
  if (!who) return { ok: false, error: "signed-out" };
  let me;
  try { me = await vaultApi.me(); } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { ok: false, error: "signed-out" };
    return { ok: false, error: "failed", message: (e as Error).message };
  }
  await setLocal(LOCAL.hasVault, { userId: who.id, setUp: me.setUp } satisfies HasVault);
  if (!me.setUp || !me.kdf || !me.encPrivateKey || !me.mkCheck || !me.publicKey) return { ok: false, error: "no-vault" };
  const mk = await deriveMasterKey(password, me.kdf, true);
  if (!(await verifyMkCheck(mk, me.mkCheck))) return { ok: false, error: "wrong-password" };
  const priv = await unwrapPrivateKey(mk, me.encPrivateKey);
  await setKeys({ mk, priv, publicRaw: me.publicKey, userId: who.id });
  await removeSession(SESSION.manualLock);
  const trusted = (await trustView()).on;
  if (trust === false && trusted) await forgetThisBrowser();
  if (trust === true && !trusted) {
    try { await trustThisBrowser(); } catch { return { ok: true, trustFailed: true }; }
  }
  return { ok: true };
}

/**
 * Locked or not set up? Answered from what /vault/me said last time for this
 * account, asking again only when we have never asked - so opening the popup
 * does not cost a round trip every time. `open`: a trusted browser may open
 * the vault silently to answer "unlocked".
 */
export async function vaultState(open = true): Promise<VaultState> {
  const who = await account();
  if (!who) return "unknown";
  if (await getKeys()) return "unlocked";
  // Opening the popup is "something needs the vault": a trusted browser opens it now.
  if (open && (await silentUnlock())) return "unlocked";
  const known = await getLocal<HasVault>(LOCAL.hasVault);
  if (known && known.userId === who.id && known.setUp) return "locked";
  try {
    const me = await vaultApi.me();
    await setLocal(LOCAL.hasVault, { userId: who.id, setUp: me.setUp } satisfies HasVault);
    return me.setUp ? "locked" : "none";
  } catch {
    return known?.userId === who.id ? (known.setUp ? "locked" : "none") : "unknown";
  }
}
