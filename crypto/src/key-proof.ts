import { b64, unb64, wipe } from "./bytes";
import { hkdf } from "./hkdf";

/**
 * Proof that this client holds the account's private key (docs/crypto.md
 * "Key proof"). The server answers POST /vault/key-proof with a one-time
 * challenge and an ephemeral P-256 public key; only the holder of the account
 * private key can derive
 *
 *   proof = base64( HKDF-SHA256(ECDH(account private, ephemeral public), salt = "", info = "pabbel-vault-proof-v1", 32) )
 *
 * The routes that replace key material (POST /vault/password, PUT
 * /vault/recovery) need it, because everything else a client could send is
 * served to the signed-in session by GET /vault/me. Shared with the extension.
 */
export const PROOF_INFO = "pabbel-vault-proof-v1";

export interface KeyProofChallenge { challenge: string; publicKey: string; expiresAt?: number }
export interface KeyProof { challenge: string; proof: string }

export async function answerKeyProof(privateKey: CryptoKey, c: KeyProofChallenge): Promise<KeyProof> {
  const eph = await crypto.subtle.importKey("raw", unb64(c.publicKey) as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: eph }, privateKey, 256));
  const bits = await hkdf(shared, PROOF_INFO);
  try {
    return { challenge: c.challenge, proof: b64(bits) };
  } finally {
    wipe(shared, bits);
  }
}
