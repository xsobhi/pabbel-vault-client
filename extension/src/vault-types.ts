/**
 * The shapes of the Pabbel Vault API's replies that this extension reads.
 * Types only: the calls themselves are in background/api.ts. Everything an
 * item, key or mask carries is ciphertext (base64 strings) except the ids,
 * kinds, roles and timestamps the server needs to route and order them.
 */
import type { RecoveryFields } from "@vault/crypto/recovery";

export interface MeResponse {
  setUp: boolean;
  kdf?: { salt: string; iterations: number };
  publicKey?: string;
  encPrivateKey?: string;
  mkCheck?: string;
  fingerprint?: string;
  /** The recovery key's blobs (ciphertext under keys Pabbel never holds), or null when there is none. */
  recovery?: (RecoveryFields & { createdAt: string | null }) | null;
  /** A password change from a client that cannot carry the recovery key dropped it: it needs replacing. */
  recoveryStale?: boolean;
}

export interface VaultSummary {
  id: string;
  kind: "personal" | "team";
  name: string;
  role: "owner" | "admin" | "member";
  keyVersion: number;
  wrappedKey: string;
  memberKeyVersion: number;
  memberCount: number;
  itemCount: number;
}

export type ItemType = "login" | "totp" | "note";
export interface ItemRow { id: string; type: ItemType; ciphertext: string; keyVersion: number; createdAt: string; updatedAt: string }

/** An email mask. `meta` (label, site) is sealed on the device under the personal vault key (crypto mask-meta). */
export interface Mask {
  id: string;
  address: string;
  meta: string | null;
  state: "active" | "paused";
  createdAt: string;
  lastReceivedAt: string | null;
  receivedCount: number;
}

export interface MaskList { masks: Mask[]; domains: string[]; defaultDomain: string }
