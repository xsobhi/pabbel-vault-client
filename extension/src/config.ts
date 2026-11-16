/**
 * Every address and identifier the extension talks to, in one place.
 *
 * The OAuth client is a PUBLIC client: an extension ships to the person's
 * machine, so it carries no secret and proves its code exchange with PKCE
 * alone. Its id is fixed here, independent of the extension id: one client
 * serves Chrome (store and local builds share the store's id via the --local
 * manifest's `key`) and Firefox, each with its own redirect URI.
 */
export const OAUTH = {
  clientId: "pabbel-vault-extension",
  /** The consent screen: account chooser, sign-in, every second factor - all at accounts.pabbel.com. */
  authorizeUrl: "https://accounts.pabbel.com/authorize",
  /** The token endpoint: the code exchange and the refresh-token rotation. */
  tokenUrl: "https://accounts.pabbel.com/api/oauth/token",
  /** The vault data plane, and who the token belongs to. Both are needed; nothing else is asked for. */
  scope: "vault profile",
  /** chrome.identity.getRedirectURL(redirectPath) - an exact path, never the bare origin. */
  redirectPath: "oauth",
} as const;

export const API = {
  /** The vault API: ciphertext, membership and device records. */
  vault: "https://vault.pabbel.com/api/vault",
} as const;

export const WEB_VAULT_URL = "https://vault.pabbel.com/";
export const PRIVACY_URL = "https://pabbel.com/privacy";

/** Refresh this long before the access token runs out. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;
/** Re-fetch vault data when the cached copy is older than this (the web vault polls every 60 s). */
export const DATA_STALE_MS = 60 * 1000;
/** A copied secret is blanked from the clipboard after this long. */
export const CLIPBOARD_CLEAR_MS = 45 * 1000;
/** A captured login waits this long for its save prompt. */
export const PENDING_SAVE_MS = 3 * 60 * 1000;
/** A login picked on a two-page sign-in fills the password that appears within this long. */
export const NEXT_STEP_MS = 2 * 60 * 1000;
/** A 2-step code with this little time left is not typed in; the next one is, once it starts. */
export const CODE_MIN_LEFT_MS = 3 * 1000;

export const LOCK_CHOICES = [1, 5, 15, 30, 60, 0] as const;
/** 0 = only when the browser closes (storage.session dies with the browser). */
export type LockMinutes = (typeof LOCK_CHOICES)[number];
export const DEFAULT_LOCK_MINUTES: LockMinutes = 15;
