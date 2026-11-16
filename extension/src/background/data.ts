/**
 * The vaults and their items, decrypted in the worker.
 *
 * Ciphertext is cached in storage.session (so a worker restart decrypts
 * locally instead of refetching everything) and the decrypted index lives only
 * in this module's memory. Data older than DATA_STALE_MS is refetched - the
 * same 60-second rhythm as the web vault - and a write marks it stale at once.
 */
import { decryptJson } from "@vault/crypto/aead";
import { aad } from "@vault/crypto/keys";
import type { ItemRow, VaultSummary } from "../vault-types";
import { DATA_STALE_MS } from "../config";
import type { Item, ItemData } from "../shared/items";
import { vaultApi } from "./api";
import { getSession, SESSION, setSession } from "./storage";
import { forgetVaultKeys, openVaultKey } from "./vault-keys";
import { getKeys } from "./session";

interface Snapshot { userId: number; at: number; vaults: VaultSummary[]; rows: Record<string, ItemRow[]> }

let snapshot: Snapshot | null = null;
let items = new Map<string, Item>();
const changeListeners = new Set<() => void>();
export const onDataChange = (fn: () => void) => { changeListeners.add(fn); };

const BROKEN = "(cannot decrypt)";

export async function decryptRow(v: VaultSummary, row: ItemRow): Promise<Item> {
  const base = { id: row.id, vaultId: v.id, type: row.type, updatedAt: row.updatedAt, createdAt: row.createdAt };
  try {
    const key = await openVaultKey(v);
    return { ...base, data: await decryptJson<ItemData>(key, row.ciphertext, aad.item(row.id)) };
  } catch {
    return { ...base, data: { t: "note", name: BROKEN, body: "" }, broken: true };
  }
}

async function index(s: Snapshot): Promise<void> {
  const next = new Map<string, Item>();
  for (const v of s.vaults) {
    for (const row of s.rows[v.id] ?? []) {
      if (!row.ciphertext) continue; // a reserved id whose bytes never arrived
      next.set(row.id, await decryptRow(v, row));
    }
  }
  items = next;
  snapshot = s;
}

async function fetchAll(userId: number): Promise<Snapshot> {
  const vaults = await vaultApi.vaults();
  const rows: Record<string, ItemRow[]> = {};
  await Promise.all(vaults.map(async (v) => { rows[v.id] = (await vaultApi.items(v.id)).items; }));
  return { userId, at: Date.now(), vaults, rows };
}

let loading: Promise<void> | null = null;

/** Make sure the index is loaded and fresh enough. `force` refetches regardless. */
export function ensureData(force = false): Promise<void> {
  loading ??= (async () => {
    const k = await getKeys();
    if (!k) throw new Error("vault is locked");
    if (!snapshot) {
      const cached = await getSession<Snapshot>(SESSION.data);
      if (cached && cached.userId === k.userId) await index(cached);
    }
    if (force || !snapshot || Date.now() - snapshot.at > DATA_STALE_MS) {
      const fresh = await fetchAll(k.userId);
      await index(fresh);
      await setSession(SESSION.data, fresh);
      for (const fn of changeListeners) fn();
    }
  })().finally(() => { loading = null; });
  return loading;
}

export const isStale = () => !snapshot || Date.now() - snapshot.at > DATA_STALE_MS;

/**
 * For anything a person is waiting on: the copy we hold, straight away, with a
 * stale one refreshed behind them. Only an empty cache makes them wait.
 */
export async function readyData(): Promise<void> {
  const k = await getKeys();
  if (!k) throw new Error("vault is locked");
  if (!snapshot) {
    const cached = await getSession<Snapshot>(SESSION.data);
    if (cached && cached.userId === k.userId) await index(cached);
  }
  if (!snapshot) return ensureData();
  if (isStale()) void ensureData().catch(() => {});
}

/** What is in memory right now, without touching the network (badge counts). */
export async function cachedItems(): Promise<Item[]> {
  if (!snapshot && (await getKeys())) {
    const k = await getKeys();
    const cached = await getSession<Snapshot>(SESSION.data);
    if (k && cached && cached.userId === k.userId) await index(cached);
  }
  return [...items.values()];
}

export const allItems = (): Item[] => [...items.values()];
export const itemById = (id: string): Item | undefined => items.get(id);
export const vaults = (): VaultSummary[] => snapshot?.vaults ?? [];
export const vaultById = (id: string): VaultSummary | undefined => vaults().find((v) => v.id === id);

/** The next read goes to the network. */
export function markStale(): void {
  if (snapshot) snapshot = { ...snapshot, at: 0 };
}

export function forgetData(): void {
  snapshot = null;
  items = new Map();
  forgetVaultKeys();
}

/** A fresh, single item (the web's openItem): the list's copy can be a minute old. */
export async function freshItem(id: string): Promise<Item> {
  await ensureData();
  const row = await vaultApi.item(id);
  const v = vaultById(row.vaultId) ?? (await ensureData(true), vaultById(row.vaultId));
  if (!v) throw new Error("no such vault");
  const it = await decryptRow(v, row);
  items.set(it.id, it);
  return it;
}

/** Apply a local write to the index straight away, ahead of the next fetch. */
export function putLocal(it: Item): void { items.set(it.id, it); markStale(); for (const fn of changeListeners) fn(); }
export function dropLocal(id: string): void { items.delete(id); markStale(); for (const fn of changeListeners) fn(); }
