import { encKeyStatement, generateIdentity, sign, unwrapSigningKey, wrapSigningKey, type Identity } from "../identity";
import { answerKeyProof, type KeyProof, type KeyProofChallenge } from "../key-proof";

/**
 * This account's identity key at unlock (docs/crypto.md "Identity keys"):
 * opened from its wrap, or - for an account made before identities existed -
 * created now and registered with a key proof. Null = this client must not
 * sign this session (offline, a race, or a server serving some other key).
 */
export interface IdentityBody { signPublicKey: string; encSignPrivateKey: string; encKeySig: string; keyProof: KeyProof }
export interface IdentityApi {
  keyProofChallenge(): Promise<KeyProofChallenge>;
  setIdentity(body: IdentityBody): Promise<unknown>;
}
export interface IdentityInput {
  mk: CryptoKey;
  encPrivateKey: CryptoKey;
  encPublicRaw: string;
  userId: number;
  me: { signPublicKey?: string | null; encSignPrivateKey?: string | null };
}

export async function openIdentity(input: IdentityInput): Promise<Identity | null> {
  const { me } = input;
  if (!me.encSignPrivateKey || !me.signPublicKey) return null;
  const id = await unwrapSigningKey(input.mk, me.encSignPrivateKey).catch(() => null);
  // The served public key must be the one our private key belongs to, or contacts would pin a stranger.
  return id && id.publicRaw === me.signPublicKey ? id : null;
}

export async function ensureIdentity(input: IdentityInput, api: IdentityApi): Promise<Identity | null> {
  if (input.me.encSignPrivateKey) return openIdentity(input);
  const id = await generateIdentity();
  const body: IdentityBody = {
    signPublicKey: id.publicRaw,
    encSignPrivateKey: await wrapSigningKey(input.mk, id.privateKey),
    encKeySig: await sign(id.privateKey, encKeyStatement(input.userId, input.encPublicRaw)),
    keyProof: await answerKeyProof(input.encPrivateKey, await api.keyProofChallenge()),
  };
  try {
    await api.setIdentity(body);
    return id;
  } catch {
    return null; // e.g. 409 IDENTITY_EXISTS from another device's unlock: the next unlock opens that one
  }
}
