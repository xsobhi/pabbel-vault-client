/**
 * "Sign in with Pabbel": authorization code + PKCE through
 * chrome.identity.launchWebAuthFlow, against accounts.pabbel.com. No Pabbel
 * password is ever typed into the extension - the consent window is Pabbel's
 * own sign-in page, with every second factor it already has.
 *
 * Tokens live in storage.local: a pbl_ access token (1 hour) and a pblr_
 * refresh token that rotates on every use. Refreshing is single-flight - two
 * concurrent refreshes would burn the rotated token and sign the person out.
 */
import { OAUTH, REFRESH_MARGIN_MS } from "../config";
import { challengeFor, codeFrom, consentUrl, randomToken, type Endpoints } from "./pkce";
import { getLocal, LOCAL, removeLocal, setLocal } from "./storage";

export interface Account { id: number; email: string; name: string | null }
export interface Tokens { accessToken: string; refreshToken: string | null; expiresAt: number | null; issuedAt?: number; user: Account }

interface TokenBundle {
  accessToken: string; refreshToken?: string | null; expiresIn?: number | null;
  user?: { id: number; email: string; name?: string | null };
}

const REFRESH_ALARM = "pv.refresh";
/** Refresh ahead of expiry - by the margin, or half the lifetime for short-lived tokens (never on every call). */
const marginOf = (t: Tokens) => Math.min(REFRESH_MARGIN_MS, t.expiresAt && t.issuedAt ? (t.expiresAt - t.issuedAt) / 2 : REFRESH_MARGIN_MS);
const signedOutListeners = new Set<() => void>();
export const onSignedOut = (fn: () => void) => { signedOutListeners.add(fn); };
/**
 * Run (and awaited) BEFORE the tokens go, with whether they can still be used:
 * the trusted-browser record has to go with the account, and the server can
 * only be told while there is a working token to tell it with.
 */
const signingOutListeners = new Set<(tokenUsable: boolean) => Promise<void>>();
export const onSigningOut = (fn: (tokenUsable: boolean) => Promise<void>) => { signingOutListeners.add(fn); };

const endpoints = (): Endpoints => ({ authorizeUrl: OAUTH.authorizeUrl, tokenUrl: OAUTH.tokenUrl, clientId: OAUTH.clientId });

export const redirectUri = () => chrome.identity.getRedirectURL(OAUTH.redirectPath);

export const getTokens = () => getLocal<Tokens>(LOCAL.auth);
export async function account(): Promise<Account | null> { return (await getTokens())?.user ?? null; }

export async function saveTokens(t: Tokens): Promise<void> {
  await setLocal(LOCAL.auth, t);
  await chrome.alarms.clear(REFRESH_ALARM);
  if (t.expiresAt && t.refreshToken) {
    await chrome.alarms.create(REFRESH_ALARM, { when: Math.max(Date.now() + 30_000, t.expiresAt - marginOf(t)) });
  }
}

async function tokenCall(body: Record<string, unknown>): Promise<TokenBundle> {
  const ep = endpoints();
  const res = await fetch(ep.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: ep.clientId, ...body }),
    credentials: "omit",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as (TokenBundle & { error?: string; message?: string }) | null;
  if (!res.ok || !data?.accessToken) {
    const err = new Error(data?.message || data?.error || `token endpoint ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return data;
}

function toTokens(b: TokenBundle, previous?: Account): Tokens {
  const user = b.user?.id ? { id: Number(b.user.id), email: b.user.email, name: b.user.name ?? null } : previous;
  if (!user) throw new Error("the token response named no account");
  const now = Date.now();
  return { accessToken: b.accessToken, refreshToken: b.refreshToken ?? null, expiresAt: b.expiresIn ? now + b.expiresIn * 1000 : null, issuedAt: now, user };
}

/** The whole interactive flow. Resolves to the account that signed in. */
export async function signIn(): Promise<Account> {
  const ep = endpoints();
  const verifier = randomToken(32);
  const state = randomToken(16);
  const url = consentUrl(ep, redirectUri(), state, await challengeFor(verifier));
  const back = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  if (!back) throw new Error("sign-in was closed");
  const code = codeFrom(back, state);
  const tokens = toTokens(await tokenCall({ grantType: "authorization_code", code, codeVerifier: verifier, redirectUri: redirectUri() }));
  const previous = await account();
  if (previous && previous.id !== tokens.user.id) await signOut();
  await saveTokens(tokens);
  return tokens.user;
}

let inflight: Promise<Tokens | null> | null = null;

/** Rotate the refresh token. Null = signed out (refused, or there was nothing to refresh with). */
export function refresh(): Promise<Tokens | null> {
  inflight ??= (async () => {
    const t = await getTokens();
    if (!t?.refreshToken) return t ?? null;
    try {
      const next = toTokens(await tokenCall({ grantType: "refresh_token", refreshToken: t.refreshToken }), t.user);
      await saveTokens(next);
      return next;
    } catch (e) {
      const status = (e as { status?: number }).status;
      // 400/401: the provider no longer honours this refresh token. Anything else is the network - keep it.
      // No token works any more, so nothing may call the API on the way out (it would come back here).
      if (status === 400 || status === 401) { await signOut(false); return null; }
      throw e;
    }
  })().finally(() => { inflight = null; });
  return inflight;
}

/** A token that is good for at least the refresh margin, refreshing first if needed. */
export async function accessToken(): Promise<string | null> {
  const t = await getTokens();
  if (!t) return null;
  if (t.expiresAt && t.refreshToken && t.expiresAt - Date.now() < marginOf(t)) return (await refresh())?.accessToken ?? null;
  return t.accessToken;
}

export async function signOut(tokenUsable = true): Promise<void> {
  for (const fn of signingOutListeners) await fn(tokenUsable).catch(() => {});
  await removeLocal(LOCAL.auth);
  await removeLocal(LOCAL.hasVault);
  await chrome.alarms.clear(REFRESH_ALARM);
  for (const fn of signedOutListeners) fn();
}

export function handleRefreshAlarm(name: string): boolean {
  if (name !== REFRESH_ALARM) return false;
  void refresh().catch(() => {});
  return true;
}
