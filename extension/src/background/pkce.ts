/** PKCE (RFC 7636, S256 only - the provider refuses "plain") and the consent URL. */
import { OAUTH } from "../config";

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

export interface Endpoints { authorizeUrl: string; tokenUrl: string; clientId: string }

export function consentUrl(ep: Endpoints, redirectUri: string, state: string, challenge: string): string {
  const q = new URLSearchParams({
    client_id: ep.clientId,
    redirect_uri: redirectUri,
    scope: OAUTH.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${ep.authorizeUrl}?${q.toString()}`;
}

/** The code from the redirect, after checking it answers OUR request (state) and is not an error. */
export function codeFrom(redirected: string, state: string): string {
  const u = new URL(redirected);
  const params = u.searchParams.size ? u.searchParams : new URLSearchParams(u.hash.slice(1));
  if (params.get("error")) throw new Error(params.get("error_description") || params.get("error") || "denied");
  if (params.get("state") !== state) throw new Error("state mismatch");
  const code = params.get("code");
  if (!code) throw new Error("no code");
  return code;
}
