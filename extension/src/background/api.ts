/**
 * The vault API, from the worker. Same routes and shapes as the web vault's
 * vault-api.ts, with the token as Bearer instead of a cookie.
 *
 * `credentials: "omit"` everywhere: the extension holds host permission for
 * pabbel.com, so the browser WOULD attach the person's .pabbel.com cookies,
 * and a request that carries one is CSRF-checked against an origin list this
 * extension is not on. The Bearer is the only credential we mean to send.
 */
import { API } from "../config";
import type { ItemRow, ItemType, Mask, MaskList, MeResponse, VaultSummary } from "../vault-types";
import type { PasswordChangeBody } from "@vault/crypto/rewrap";
import type { KeyProofChallenge } from "@vault/crypto/key-proof";
import { accessToken, refresh } from "./auth";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

async function once(method: string, path: string, token: string, body?: unknown): Promise<Response> {
  return fetch(`${API.vault}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "omit",
    cache: "no-store",
  });
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let token = await accessToken();
  if (!token) throw new ApiError(401, "signed out");
  let res = await once(method, path, token, body);
  if (res.status === 401) {
    // Expired or revoked: one refresh, one retry. A second 401 means signed out.
    token = (await refresh())?.accessToken ?? null;
    if (!token) throw new ApiError(401, "signed out");
    res = await once(method, path, token, body);
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const d = data as { error?: string; code?: string } | null;
    throw new ApiError(res.status, d?.error || `HTTP ${res.status}`, d?.code);
  }
  return data as T;
}

export const vaultApi = {
  me: () => request<MeResponse>("GET", "/me"),
  vaults: () => request<VaultSummary[]>("GET", "/vaults"),
  items: (vaultId: string) => request<{ keyVersion: number; items: ItemRow[] }>("GET", `/vaults/${encodeURIComponent(vaultId)}/items`),
  item: (id: string) => request<ItemRow & { vaultId: string }>("GET", `/items/${encodeURIComponent(id)}`),
  reserveItem: (vaultId: string, type: ItemType) => request<{ id: string }>("POST", `/vaults/${encodeURIComponent(vaultId)}/items`, { type }),
  putItem: (id: string, ciphertext: string) => request<{ ok: true; keyVersion: number }>("PUT", `/items/${encodeURIComponent(id)}`, { ciphertext }),
  deleteItem: (id: string) => request<{ ok: true }>("DELETE", `/items/${encodeURIComponent(id)}`),
  readItem: (id: string, what: "reveal" | "copy" | "code" | "autofill") =>
    request<{ ok: true }>("POST", `/items/${encodeURIComponent(id)}/read`, { what }),
  /** A one-time challenge, answered with the account's private key (@vault/crypto/key-proof). */
  keyProofChallenge: () => request<KeyProofChallenge>("POST", "/key-proof", {}),
  changePassword: (body: PasswordChangeBody) => request<{ ok: true }>("POST", "/password", body),
  /** Trusted browsers (trust.ts): a new share S, S for a silent unlock, and removal. */
  trustBrowser: (currentMkCheck: string) => request<{ id: string; share: string; expiresAt: string }>("POST", "/devices", { currentMkCheck }),
  browserShare: (id: string) => request<{ share: string; expiresAt: string }>("POST", `/devices/${encodeURIComponent(id)}/unlock`),
  forgetBrowser: (id: string) => request<{ ok: true }>("DELETE", `/devices/${encodeURIComponent(id)}`),
  masks: () => request<MaskList>("GET", "/masks"),
  /** An address only; its meta is sealed with the new id and follows in updateMask (like an item). */
  createMask: (body: { domain?: string }) => request<Mask>("POST", "/masks", body),
  updateMask: (id: string, body: { meta?: string | null; state?: "active" | "paused" }) => request<Mask>("PUT", `/masks/${encodeURIComponent(id)}`, body),
};
