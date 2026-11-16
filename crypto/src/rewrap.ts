import { decrypt, encrypt } from "./aead";
import { wipe } from "./bytes";
import { deriveMasterKey, makeMkCheck, newKdfParams } from "./kdf";
import { aad, wrapPrivateKey } from "./keys";
import { recoveryFields, type RecoveryFields } from "./recovery";
import type { KeyProof } from "./key-proof";

/** POST /vault/password. `recovery` is left out only when there is no recovery key to carry. */
export interface PasswordChangeBody {
  salt: string;
  iterations: number;
  encPrivateKey: string;
  mkCheck: string;
  personalKeys: { vaultId: string; encKey: string }[];
  recovery?: RecoveryFields;
  /** The mk_check the OLD master key matched: the server replaces only that key (compare-and-set). */
  currentMkCheck?: string;
  /** Proof of the account's private key (key-proof.ts): without it the server asks for the account password and a 2-step code. */
  keyProof?: KeyProof;
}

/**
 * Everything a new vault password changes, built from the CURRENT master key
 * (however this client got it: the password, a trusted browser or the
 * recovery key). A new salt, a new MK, and under it the private key, every
 * personal vault key and the recovery key's wrap - the recovery key itself
 * stays the same, so the copy the person saved keeps working. Team keys are
 * wrapped to the public key, which does not change, so they are not touched.
 */
export async function buildPasswordChange(input: {
  oldMk: CryptoKey;
  privateKey: CryptoKey;
  newPassword: string;
  personalVaults: { id: string; wrappedKey: string }[];
  recoveryKey: Uint8Array | null;
}): Promise<{ mk: CryptoKey; body: PasswordChangeBody }> {
  const kdf = newKdfParams();
  const mk = await deriveMasterKey(input.newPassword, kdf, true);
  const personalKeys: PasswordChangeBody["personalKeys"] = [];
  for (const v of input.personalVaults) {
    const raw = await decrypt(input.oldMk, v.wrappedKey, aad.personalVaultKey(v.id));
    try {
      personalKeys.push({ vaultId: v.id, encKey: await encrypt(mk, raw, aad.personalVaultKey(v.id)) });
    } finally {
      wipe(raw);
    }
  }
  const body: PasswordChangeBody = {
    ...kdf,
    encPrivateKey: await wrapPrivateKey(mk, input.privateKey),
    mkCheck: await makeMkCheck(mk),
    personalKeys,
  };
  if (input.recoveryKey) body.recovery = await recoveryFields(mk, input.recoveryKey);
  return { mk, body };
}
