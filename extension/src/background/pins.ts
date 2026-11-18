/**
 * The pins for signed team keys (docs/crypto.md "Trust on first use"),
 * loaded once per unlocked session: the account's sealed copy on the server,
 * merged with this browser's copy in storage.local (public keys only - nothing
 * here decrypts anything). The rules live in crypto/src/trust; this is the storage.
 */
import { decrypt, importAesKey } from "@vault/crypto/aead";
import { wipe } from "@vault/crypto/bytes";
import { aad } from "@vault/crypto/keys";
import { TrustBook } from "@vault/crypto/trust/book";
import { normalise, type TrustState } from "@vault/crypto/trust/state";
import type { TeamKeyError } from "@vault/crypto/trust/team-wrap";
import { vaultApi } from "./api";
import { getLocal, setLocal } from "./storage";
import { getKeys, onLock } from "./session";

let book: Promise<TrustBook> | null = null;
/** Teams whose key was refused this session, and why: their items are not shown. */
export const refusedTeams = new Map<string, TeamKeyError>();
onLock(() => { book = null; refusedTeams.clear(); });

const localKey = (userId: number) => `pv.pins.${userId}`;

export function pins(): Promise<TrustBook> {
  book ??= (async () => {
    const k = await getKeys();
    if (!k) throw new Error("vault is locked");
    const personal = (await vaultApi.vaults()).find((v) => v.kind === "personal");
    if (!personal) throw new Error("no personal vault");
    const raw = await decrypt(k.mk, personal.wrappedKey, aad.personalVaultKey(personal.id));
    const personalKey = await importAesKey(raw);
    wipe(raw);
    return TrustBook.load({
      personalKey,
      readLocal: async () => normalise((await getLocal<TrustState>(localKey(k.userId))) ?? null),
      writeLocal: (s) => setLocal(localKey(k.userId), s),
      fetchServer: async () => (await vaultApi.me()).trustState ?? null,
      putServer: async (state, previous) => { await vaultApi.putTrust(state, previous); },
    });
  })();
  // A failed load (offline) is not remembered: the next team open tries again.
  book.catch(() => { book = null; });
  return book;
}
