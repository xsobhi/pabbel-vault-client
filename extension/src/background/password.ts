/**
 * "Change vault password" from the extension, while it is unlocked - no old
 * password asked: whoever has it open can already read everything, and this
 * is the way to keep everything when the password itself is forgotten.
 *
 * The same re-wrap as the web vault (@vault/crypto/rewrap): new salt and
 * master key, and under it the private key, every personal vault key and the
 * recovery key's wrap (the saved recovery key keeps working). The server then
 * revokes every trusted browser - this one included - so if this browser was
 * trusted, it is trusted again under the new master key.
 */
import { wipe } from "@vault/crypto/bytes";
import { recoveryKeyFrom } from "@vault/crypto/recovery";
import { buildPasswordChange } from "@vault/crypto/rewrap";
import { answerKeyProof } from "@vault/crypto/key-proof";
import type { ChangePasswordResult } from "../shared/messages";
import { verifyMkCheck } from "@vault/crypto/kdf";
import { ApiError, vaultApi } from "./api";
import { ensureData } from "./data";
import { getKeys, setKeys } from "./session";
import { forgetThisBrowser, trustThisBrowser, trustView } from "./trust";

export const MIN_PASSWORD = 12;

export async function changeVaultPassword(next: string): Promise<ChangePasswordResult> {
  if (next.length < MIN_PASSWORD) return { ok: false, error: "too-short" };
  const k = await getKeys();
  if (!k) return { ok: false, error: "locked" };
  const wasTrusted = (await trustView()).on;
  let recoveryKey: Uint8Array | null = null;
  try {
    const me = await vaultApi.me();
    // The key open here must still be the account's: if the password was changed on another
    // device, re-wrapping from this one would undo that change. The server checks it again
    // (compare-and-set on currentMkCheck) in case a change lands in between.
    if (!me.mkCheck || !(await verifyMkCheck(k.mk, me.mkCheck))) return { ok: false, error: "stale" };
    // A key we cannot open is a key we cannot carry: the server then marks it for replacing.
    recoveryKey = me.recovery ? await recoveryKeyFrom(k.mk, me.recovery.keyEnc).catch(() => null) : null;
    const personalVaults = (await vaultApi.vaults()).filter((v) => v.kind === "personal");
    const { mk, body } = await buildPasswordChange({ oldMk: k.mk, privateKey: k.priv, newPassword: next, personalVaults, recoveryKey });
    // The server replaces key material only for a client that proves it holds the private key.
    const keyProof = await answerKeyProof(k.priv, await vaultApi.keyProofChallenge());
    await vaultApi.changePassword({ ...body, currentMkCheck: me.mkCheck, keyProof });
    await setKeys({ ...k, mk });
  } catch (e) {
    return { ok: false, error: e instanceof ApiError && e.code === "STALE_KEY" ? "stale" : "failed" };
  } finally {
    if (recoveryKey) wipe(recoveryKey);
  }
  // The cached personal-vault wraps were made under the old master key: fetch the new ones.
  await ensureData(true).catch(() => {});
  if (!wasTrusted) return { ok: true };
  try {
    await trustThisBrowser();
    return { ok: true };
  } catch {
    await forgetThisBrowser(false); // its share is gone on the server already
    return { ok: true, trustFailed: true };
  }
}
