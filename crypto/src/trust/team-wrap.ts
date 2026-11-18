import { encKeyStatement, sign, verify, wrapStatement } from "../identity";
import { aad, unwrapWithPrivate, wrapToPublic } from "../keys";
import type { TrustBook } from "./book";

/**
 * Opening and making team-key wraps under the format-2 rules
 * (docs/crypto.md "Opening a team key", "Wrapping a key to someone").
 * Shared by the web vault and the extension; Android mirrors it in Kotlin.
 */
export type TeamKeyReason = "unsigned" | "bad-signature" | "key-changed" | "rollback" | "bad-binding" | "no-identity";

export class TeamKeyError extends Error {
  constructor(readonly reason: TeamKeyReason, readonly vaultId: string, readonly userId?: number) {
    super(`team key refused (${reason})`);
  }
}

/** The fields of GET /vault/vaults that a member's wrap travels with. */
export interface TeamWrapRow {
  id: string;
  wrappedKey: string;
  memberKeyVersion: number;
  signed?: boolean;
  wrapSig?: string | null;
  wrapSigner?: number | null;
  signerKey?: string | null;
}

export interface Me { userId: number; encPrivateKey: CryptoKey; encPublicRaw: string }

/** The vault key's raw bytes and whether it came signed (`legacy` = format 1, accepted only before migration). Throws TeamKeyError. */
export async function openTeamWrap(v: TeamWrapRow, me: Me, book: TrustBook): Promise<{ raw: Uint8Array; legacy: boolean }> {
  const migrated = !!v.signed || book.isMigrated(v.id);
  if (!v.wrapSig) {
    if (migrated) throw new TeamKeyError("unsigned", v.id);
  } else {
    const signer = Number(v.wrapSigner);
    if (!Number.isInteger(signer) || signer <= 0 || !v.signerKey) throw new TeamKeyError("bad-signature", v.id);
    const ok = await verify(v.signerKey, wrapStatement({
      vaultId: v.id, recipientId: me.userId, keyVersion: v.memberKeyVersion, wrappedKey: v.wrappedKey, recipientEncPublic: me.encPublicRaw, signerId: signer,
    }), v.wrapSig);
    if (!ok) throw new TeamKeyError("bad-signature", v.id, signer);
    // Pinned only once the signature holds, so a forged first contact leaves no pin behind.
    if (book.pin(signer, v.signerKey) === "changed") throw new TeamKeyError("key-changed", v.id, signer);
    if (v.memberKeyVersion < book.floor(v.id)) throw new TeamKeyError("rollback", v.id);
  }
  const raw = await unwrapWithPrivate(me.encPrivateKey, v.wrappedKey, aad.memberWrap(v.id, me.userId));
  if (v.wrapSig && v.signed) book.markSigned(v.id, v.memberKeyVersion);
  void book.flush();
  return { raw, legacy: !v.wrapSig };
}

/** A recipient as GET /vault/keys/:email or GET /vault/pending describe them. */
export interface Recipient { userId: number; publicKey: string; signKey?: string | null; encKeySig?: string | null }
export interface Signer { userId: number; signingKey: CryptoKey }

/**
 * Wrap `raw` to the recipient and sign it. The recipient's identity must pass
 * the pins and vouch for the ECDH key we wrap to; a recipient with no identity
 * yet (legacy account) gets the wrap on the fingerprint alone, as before.
 */
export async function makeTeamWrap(vaultId: string, keyVersion: number, raw: Uint8Array, to: Recipient, by: Signer, book: TrustBook): Promise<{ wrappedKey: string; wrapSig: string }> {
  if (to.signKey && !(to.encKeySig && (await verify(to.signKey, encKeyStatement(to.userId, to.publicKey), to.encKeySig)))) {
    throw new TeamKeyError("bad-binding", vaultId, to.userId);
  }
  if (book.pin(to.userId, to.signKey) === "changed") throw new TeamKeyError("key-changed", vaultId, to.userId);
  const wrappedKey = await wrapToPublic(to.publicKey, raw, aad.memberWrap(vaultId, to.userId));
  const wrapSig = await sign(by.signingKey, wrapStatement({
    vaultId, recipientId: to.userId, keyVersion, wrappedKey, recipientEncPublic: to.publicKey, signerId: by.userId,
  }));
  void book.flush();
  return { wrappedKey, wrapSig };
}
