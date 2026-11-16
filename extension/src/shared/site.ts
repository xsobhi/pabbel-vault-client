/**
 * What a URL means for filling: which site it belongs to, and whether a
 * secret may go there at all.
 *
 * The PSL is installed once by whoever owns it (the service worker bundles
 * the list; unit tests read it from vendor/). Content scripts never load it:
 * every decision that needs a registrable domain is made in the worker.
 */
import { createPsl, isIpHost, type Psl } from "./psl";

let psl: Psl | null = null;
export function installPsl(listText: string): void { psl = createPsl(listText); }
function list(): Psl {
  if (!psl) throw new Error("public suffix list not installed");
  return psl;
}

export interface SiteInfo {
  /** "https://login.example.com" */
  origin: string;
  /** "login.example.com" */
  host: string;
  /** Registrable domain ("example.com"); the host itself for IPs and localhost. */
  site: string;
  protocol: string;
  /** https, or plain http on the loopback - the only places a secret may be filled. */
  secure: boolean;
}

export const isLoopback = (host: string) => host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1" || host === "[::1]";

/** Parse a page URL; null for anything that is not http(s). */
export function siteOf(url: string | undefined | null): SiteInfo | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (!host) return null;
  const site = isIpHost(host) || isLoopback(host) ? host : (list().registrable(host) ?? host);
  const secure = u.protocol === "https:" || isLoopback(host);
  return { origin: u.origin, host, site, protocol: u.protocol, secure };
}

/**
 * A saved login's URL as people type it: "github.com", "https://github.com/login",
 * "app.example.co.uk:8443". Schemes other than http(s) never match a page.
 */
export function siteOfItemUrl(raw: string | undefined | null): SiteInfo | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return siteOf(s);
  return siteOf(`https://${s}`);
}

/** The label people recognise a site by: "github.com" -> "github", "bbc.co.uk" -> "bbc". */
export function brandLabel(site: SiteInfo): string {
  if (isIpHost(site.host) || isLoopback(site.host)) return site.host;
  const suffix = list().suffix(site.site) ?? "";
  const head = suffix ? site.site.slice(0, -(suffix.length + 1)) : site.site;
  return head.split(".").pop() ?? head;
}

/**
 * May a frame receive a secret? The frame must be secure, the top page must be
 * secure, and both must belong to the same registrable domain: a login form in
 * an ad iframe from another site never gets one, even on a page you trust.
 */
export function frameMayFill(frameUrl: string | undefined, topUrl: string | undefined): SiteInfo | null {
  const frame = siteOf(frameUrl);
  const top = siteOf(topUrl);
  if (!frame || !top || !frame.secure || !top.secure) return null;
  return frame.site === top.site ? frame : null;
}
