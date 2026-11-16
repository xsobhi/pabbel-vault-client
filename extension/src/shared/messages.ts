/**
 * The message protocol between the extension's parts.
 *
 * Two trust levels. Extension pages (popup, options) are ours and may ask for
 * anything. Content scripts run inside web pages, so their requests ("cs:*")
 * are checked against the frame that sent them, and they only ever receive a
 * secret in answer to the user picking an item - and then only that item's.
 */
import type { ItemData, ItemSummary, VaultInfo, Item } from "./items";
import type { LockMinutes } from "../config";
import type { GeneratorOptions } from "./generator";
import type { InlineMask } from "./masks";

export type VaultState = "unknown" | "none" | "locked" | "unlocked";

/** "Stay unlocked on this browser": on, until when (ms), or why it ended last time. */
export type TrustEnded = "expired" | "revoked";
export interface TrustView { on: boolean; until: number | null; ended: TrustEnded | null }

export interface StateView {
  signedIn: boolean;
  account: { email: string; name: string | null } | null;
  vault: VaultState;
  trust?: TrustView;
}

export interface Settings {
  lockMinutes: LockMinutes;
  inlineButton: boolean;
  savePrompts: boolean;
  /** After a password fill, put the matching 2-step code on the clipboard (cleared after 45 s). */
  copyTotp: boolean;
  /** After a password fill, type the login's 2-step code into the code field that follows (same tab, same site). */
  typeTotp: boolean;
  /** Show website icons in the list (fetched directly from each site). */
  showIcons: boolean;
  generator: Required<GeneratorOptions>;
}

export interface DataView {
  vaults: VaultInfo[];
  items: ItemSummary[];
  /** The active tab's site, when it is one we would fill. */
  site: { host: string; site: string } | null;
  /** Ids of the items that match that site, best first. */
  matches: string[];
  /** Origin -> image, for the rows that have one. Missing ones arrive later (storage key pv.icons changes). */
  icons: Record<string, string>;
  /** This copy is older than the refresh interval: one is under way. */
  stale: boolean;
}

export type PopupRequest =
  /** `peek`: report only - the settings page must not open a trusted browser's vault just by being looked at. */
  | { type: "state"; peek?: boolean }
  | { type: "signIn" }
  | { type: "signOut" }
  | { type: "unlock"; password: string; trust?: boolean }
  | { type: "lock" }
  | { type: "data"; refresh?: boolean }
  | { type: "item"; id: string }
  | { type: "save"; vaultId: string; id?: string; data: ItemData }
  | { type: "delete"; id: string }
  | { type: "pin"; id: string }
  | { type: "audit"; id: string; what: "reveal" | "copy" | "code" }
  | { type: "copied" }
  | { type: "generate"; options?: GeneratorOptions }
  | { type: "settings" }
  | { type: "setSettings"; patch: Partial<Settings> }
  | { type: "neverList" }
  | { type: "neverRemove"; site: string }
  | { type: "fillTab"; id: string }
  | { type: "activity" }
  | { type: "trust"; on: boolean }
  | { type: "changePassword"; password: string }
  | { type: "maskState"; address: string };

export type UnlockResult = { ok: true; trustFailed?: boolean } | { ok: false; error: "wrong-password" | "no-vault" | "signed-out" | "failed"; message?: string };
export type ChangePasswordResult = { ok: true; trustFailed?: boolean } | { ok: false; error: "locked" | "too-short" | "stale" | "failed" };

/** A row of the in-page dropdown: never a secret. */
export interface InlineItem { id: string; name: string; subtitle: string; kind: "login" | "totp" }

export type FieldKind = "login" | "otp" | "new";

export type ContentRequest =
  | { type: "cs:hello"; kinds: FieldKind[] }
  | { type: "cs:focus"; kind: FieldKind; username?: string }
  /** signup: the field is the email box of a sign-up form, where a new email mask is offered. */
  | { type: "cs:list"; kind: FieldKind; signup?: boolean }
  | { type: "cs:createMask"; names?: string[] }
  | { type: "cs:fill"; id: string }
  | { type: "cs:generate" }
  | { type: "cs:capture"; username: string; password: string; names?: string[]; iconHref?: string }
  | { type: "cs:awaitPassword"; id: string }
  | { type: "cs:nextStep" }
  | { type: "cs:passwordFilled"; id: string }
  | { type: "cs:codeStep" }
  | { type: "cs:pending" }
  | { type: "cs:saveBar"; action: "save" | "never" | "dismiss" | "unlock"; vaultId?: string }
  | { type: "cs:openPopup" };

export interface HelloReply { allowed: boolean; inline: boolean }
export interface ListReply {
  allowed: boolean; signedIn: boolean; locked: boolean; items: InlineItem[]; generate: boolean;
  /** Sign-up email fields only: the masks made for this site, and whether a new one can be made. */
  masks?: InlineMask[]; maskOffer?: boolean;
}
/** `id` names the login whose password this is (never a secret): the page says when it went in. */
export type FillReply = { id?: string; username?: string; password?: string; code?: string; codeCopied?: boolean; error?: string };

export interface SaveBarInfo {
  kind: "save" | "update";
  locked: boolean;
  host: string;
  /** What the site is called: "Google", for accounts.google.com. */
  name: string;
  username: string;
  vaults: VaultInfo[];
  /** For "update": the item whose password changes. */
  itemName?: string;
}

/** Worker -> content script. */
export type WorkerPush =
  | { type: "sw:probe" }
  | { type: "sw:fill"; id?: string; username?: string; password?: string; code?: string }
  | { type: "sw:saveBar"; info: SaveBarInfo }
  | { type: "sw:fillGenerated"; password: string }
  | { type: "sw:locked" };

export interface ProbeReply { kind: FieldKind | "none"; username?: string }

export type AnyRequest = PopupRequest | ContentRequest;
export type { Item };
