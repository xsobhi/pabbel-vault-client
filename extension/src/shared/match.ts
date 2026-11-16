/**
 * Which saved items belong to the page in front of you.
 *
 * Logins match on registrable domain (eTLD+1). The web vault stores one URL
 * per login and has no exact-host option, so neither does this - an item
 * saved for login.example.com is offered on www.example.com too, and never on
 * example.org or on another github.io site.
 *
 * Two-step codes carry no URL (issuer + account only), so they match when the
 * issuer names the site ("GitHub" on github.com, "Amazon Web Services" on
 * aws.amazon.com) or when the code's account is the username of a login that
 * matches.
 */
import type { Item, LoginData, TotpData } from "./items";
import { brandLabel, siteOfItemUrl, type SiteInfo } from "./site";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

export function loginMatches(d: LoginData, page: SiteInfo): boolean {
  const s = siteOfItemUrl(d.url);
  return !!s && s.site === page.site;
}

export function issuerMatches(issuer: string, page: SiteInfo): boolean {
  const name = norm(issuer);
  const label = norm(brandLabel(page));
  if (!name || !label) return false;
  if (name === label) return true;
  // "amazonwebservices" on amazon.com; "google" on googleworkspace.com - long enough to mean something.
  return (label.length >= 4 && name.startsWith(label)) || (name.length >= 4 && label.startsWith(name));
}

export function totpMatches(d: TotpData, page: SiteInfo, usernames: Set<string>): boolean {
  if (issuerMatches(d.issuer, page) || issuerMatches(d.name, page)) return true;
  const account = d.account.trim().toLowerCase();
  return !!account && usernames.has(account);
}

export interface SiteMatches { logins: Item[]; totps: Item[] }

/** Matching logins and codes, best first: pinned, then most recently updated. */
export function matchesFor(items: Iterable<Item>, page: SiteInfo): SiteMatches {
  const logins: Item[] = [];
  const totps: Item[] = [];
  const all = [...items].filter((i) => !i.broken);
  for (const it of all) if (it.data.t === "login" && loginMatches(it.data, page)) logins.push(it);
  const usernames = new Set(logins.map((l) => (l.data as LoginData).username.trim().toLowerCase()).filter(Boolean));
  for (const it of all) if (it.data.t === "totp" && totpMatches(it.data, page, usernames)) totps.push(it);
  return { logins: logins.sort(rank), totps: totps.sort(rank) };
}

function rank(a: Item, b: Item): number {
  const pa = !!a.data.pinned, pb = !!b.data.pinned;
  if (pa !== pb) return pa ? -1 : 1;
  return b.updatedAt.localeCompare(a.updatedAt);
}

/** The login the keyboard shortcut fills: the one whose username was typed, else the best ranked. */
export function bestLogin(logins: Item[], typedUsername?: string): Item | null {
  const typed = (typedUsername ?? "").trim().toLowerCase();
  if (typed) {
    const exact = logins.find((l) => (l.data as LoginData).username.trim().toLowerCase() === typed);
    if (exact) return exact;
  }
  return logins[0] ?? null;
}

/** The code for a login, when one is wanted after a password (same account first). */
export function bestTotp(totps: Item[], username?: string): Item | null {
  const u = (username ?? "").trim().toLowerCase();
  return (u && totps.find((t) => (t.data as TotpData).account.trim().toLowerCase() === u)) || totps[0] || null;
}

const accountOf = (t: Item) => (t.data as TotpData).account.trim().toLowerCase();
const userOf = (l: Item) => (l.data as LoginData).username.trim().toLowerCase();

/**
 * The code to type by itself after this login's password, or null at the first
 * doubt. Logins hold no code of their own: a code is this login's when its
 * account is the login's username, and there must be exactly one such. Failing
 * that, the site's only code - unless its account names another of the site's
 * logins, which would put someone else's code into this sign-in.
 */
export function codeForLogin(m: SiteMatches, login: Item): Item | null {
  const user = userOf(login);
  const own = user ? m.totps.filter((t) => accountOf(t) === user) : [];
  if (own.length) return own.length === 1 ? own[0] : null;
  if (m.totps.length !== 1) return null;
  const others = new Set(m.logins.filter((l) => l.id !== login.id).map(userOf).filter(Boolean));
  return others.has(accountOf(m.totps[0])) ? null : m.totps[0];
}
