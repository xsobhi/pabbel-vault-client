/**
 * Creating, editing, moving, pinning and deleting - with the web vault's two
 * rules that make the server unable to shuffle ciphertext between slots:
 *
 *  - The item id is inside the AAD ("item:<id>"), and ids are minted by the
 *    server, so a create is two-phase: reserve an id, then PUT bytes bound to it.
 *  - Moving between vaults is create-in-target + delete-here (each vault has
 *    its own key, and the id cannot change under existing ciphertext).
 */
import { encryptJson } from "@vault/crypto/aead";
import { aad } from "@vault/crypto/keys";
import type { VaultSummary } from "../vault-types";
import { withDefaultName, type Item, type ItemData } from "../shared/items";
import { vaultApi } from "./api";
import { dropLocal, ensureData, freshItem, putLocal, vaultById } from "./data";
import { openVaultKey } from "./vault-keys";
import { touch } from "./session";

const TYPES = new Set(["login", "totp", "note"]);

function clean(data: ItemData): ItemData {
  if (!data || !TYPES.has(data.t)) throw new Error("unknown item type");
  return withDefaultName(data);
}

async function target(vaultId: string): Promise<VaultSummary> {
  await ensureData();
  const v = vaultById(vaultId);
  if (!v) throw new Error("no such vault");
  return v;
}

export async function createItem(vaultId: string, input: ItemData): Promise<Item> {
  const data = clean(input);
  const v = await target(vaultId);
  const key = await openVaultKey(v);
  const { id } = await vaultApi.reserveItem(v.id, data.t);
  await vaultApi.putItem(id, await encryptJson(key, data, aad.item(id)));
  const now = new Date().toISOString();
  const it: Item = { id, vaultId: v.id, type: data.t, data, createdAt: now, updatedAt: now };
  putLocal(it);
  await touch();
  return it;
}

export async function updateItem(id: string, vaultId: string, input: ItemData): Promise<Item> {
  const data = clean(input);
  const current = await freshItem(id);
  if (current.broken) throw new Error("this item cannot be decrypted, so it cannot be edited here");
  if (current.vaultId !== vaultId) return moveItem(current, vaultId, data);
  const v = await target(vaultId);
  const key = await openVaultKey(v);
  await vaultApi.putItem(id, await encryptJson(key, data, aad.item(id)));
  const it: Item = { ...current, type: data.t, data, updatedAt: new Date().toISOString() };
  putLocal(it);
  await touch();
  return it;
}

async function moveItem(current: Item, vaultId: string, data: ItemData): Promise<Item> {
  const created = await createItem(vaultId, data);
  await vaultApi.deleteItem(current.id);
  dropLocal(current.id);
  return created;
}

export async function deleteItem(id: string): Promise<void> {
  await vaultApi.deleteItem(id);
  dropLocal(id);
  await touch();
}

/** `pinned` is inside the ciphertext: re-encrypt the fresh copy with it flipped. */
export async function togglePin(id: string): Promise<Item> {
  const current = await freshItem(id);
  return updateItem(id, current.vaultId, { ...current.data, pinned: !current.data.pinned });
}

/** Reveal / copy / code / autofill: metadata only, for a team's audit trail. Never blocks the action. */
export function recordRead(id: string, what: "reveal" | "copy" | "code" | "autofill"): void {
  void vaultApi.readItem(id, what).catch(() => {});
  void touch();
}
