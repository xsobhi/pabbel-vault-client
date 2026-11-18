/**
 * Opening a vault key from its wrap - the web vault's openVaultKey, with the
 * worker's keys instead of the page's module state. Personal vaults are
 * wrapped under the master key, team vaults to this account's public key and
 * signed (docs/crypto.md "Signed team keys")
 * (docs/crypto.md "Personal vault key" / "Wrapped key to a public key").
 */
import { decrypt, importAesKey } from "@vault/crypto/aead";
import { wipe } from "@vault/crypto/bytes";
import { aad } from "@vault/crypto/keys";
import { openTeamWrap, TeamKeyError } from "@vault/crypto/trust/team-wrap";
import { pins, refusedTeams } from "./pins";
import type { VaultSummary } from "../vault-types";
import { getKeys } from "./session";

const cache = new Map<string, { key: CryptoKey; version: number }>();

export async function openVaultKey(v: VaultSummary): Promise<CryptoKey> {
  const hit = cache.get(v.id);
  if (hit && hit.version === v.keyVersion) return hit.key;
  const k = await getKeys();
  if (!k) throw new Error("vault is locked");
  // Team keys follow the format-2 rules (signed by a pinned identity, never rolled back; unsigned only before migration).
  const raw = v.kind === "personal"
    ? await decrypt(k.mk, v.wrappedKey, aad.personalVaultKey(v.id))
    : (await openTeamWrap(v, { userId: k.userId, encPrivateKey: k.priv, encPublicRaw: k.publicRaw }, await pins())
      .catch((e) => { if (e instanceof TeamKeyError) refusedTeams.set(v.id, e); throw e; })).raw;
  refusedTeams.delete(v.id);
  try {
    const key = await importAesKey(raw);
    cache.set(v.id, { key, version: v.keyVersion });
    return key;
  } finally {
    wipe(raw);
  }
}

export function forgetVaultKeys(): void {
  cache.clear();
}
