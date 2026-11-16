/**
 * Item shapes, taken from the web vault so the two can never disagree about
 * what is inside the ciphertext (docs/crypto.md "Item plaintext").
 */
import type { ItemData, LoginData, NoteData, TotpData } from "@vault/crypto/items";
import type { ItemType, VaultSummary } from "../vault-types";

export type { ItemData, LoginData, NoteData, TotpData, ItemType, VaultSummary };

/** A decrypted item as the worker holds it. */
export interface Item {
  id: string;
  vaultId: string;
  type: ItemType;
  data: ItemData;
  updatedAt: string;
  createdAt: string;
  /** Could not be decrypted: kept and shown, never hidden (same rule as the web). */
  broken?: boolean;
}

/** What the popup's list needs - no password, no TOTP secret, no note body. */
export interface ItemSummary {
  id: string;
  vaultId: string;
  type: ItemType;
  name: string;
  /** login: username; totp: account; note: empty. */
  subtitle: string;
  url: string;
  pinned: boolean;
  updatedAt: string;
  broken: boolean;
  /** Key into DataView.icons: the site's origin, when the item belongs to one. */
  iconKey?: string;
}

export interface VaultInfo { id: string; kind: "personal" | "team"; name: string; role: string }

export function summarize(it: Item): ItemSummary {
  const d = it.data;
  const subtitle = d.t === "login" ? d.username : d.t === "totp" ? d.account || d.issuer : "";
  return {
    id: it.id, vaultId: it.vaultId, type: it.type, name: d.name, subtitle,
    url: d.t === "login" ? d.url : "", pinned: !!d.pinned, updatedAt: it.updatedAt, broken: !!it.broken,
  };
}

export const vaultInfo = (v: VaultSummary): VaultInfo => ({ id: v.id, kind: v.kind, name: v.name, role: v.role });

/** Pinned first, then by name - the web vault's default order. */
export function byPinnedThenName(a: ItemSummary, b: ItemSummary): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/** The same defaulting as the web editor: an unnamed item is named after what it holds. */
export function withDefaultName(d: ItemData): ItemData {
  if (d.name.trim()) return d;
  const name = d.t === "totp" ? d.issuer || d.account : d.t === "login" ? d.username || d.url : d.body.slice(0, 40);
  return { ...d, name } as ItemData;
}
