import type { TotpAlgorithm } from "./totp";

/**
 * Item plaintext (docs/crypto.md "Item plaintext"): the JSON that is encrypted
 * under the vault key, with the item id in the AAD. The name is inside the
 * ciphertext, so the server never sees it. `pinned` lives inside the
 * ciphertext like everything else.
 */
export interface LoginData { t: "login"; name: string; username: string; password: string; url: string; notes: string; pinned?: boolean }
export interface TotpData { t: "totp"; name: string; issuer: string; account: string; secret: string; algorithm: TotpAlgorithm; digits: number; period: number; pinned?: boolean }
export interface NoteData { t: "note"; name: string; body: string; pinned?: boolean }
export type ItemData = LoginData | TotpData | NoteData;
