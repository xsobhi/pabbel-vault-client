/** The parts of finding a site's icon that need no browser: which hosts to ask, and what a page's <link> tags offer. */
import { isIpHost } from "./psl";
import { isLoopback } from "./site";

const PRIVATE_TLD = /\.(local|localdomain|internal|intranet|lan|home|corp|test|invalid|example|onion)$/i;

/** Only names on the public internet: a saved router or NAS login is never contacted for a picture. */
export function isPublicHost(host: string): boolean {
  return host.includes(".") && !isIpHost(host) && !isLoopback(host) && !PRIVATE_TLD.test(host);
}

const LINK = /<link\b[^>]*>/gi;
const ATTR = /\b(rel|href|sizes|type)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(ATTR)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}

const sideOf = (a: Record<string, string>) => {
  if ((a.sizes ?? "").toLowerCase() === "any" || /svg/i.test(a.type ?? "") || /\.svg(\?|$)/i.test(a.href ?? "")) return 512;
  return Math.max(0, ...[...(a.sizes ?? "").matchAll(/(\d+)x\d+/gi)].map((m) => Number(m[1])));
};

/** https icon URLs offered by a page's <head>, biggest first. */
export function iconLinks(html: string, base: string): string[] {
  const found: { url: string; side: number }[] = [];
  for (const tag of html.match(LINK) ?? []) {
    const a = attrs(tag);
    const rel = (a.rel ?? "").toLowerCase().split(/\s+/);
    if (!a.href || !(rel.includes("icon") || rel.includes("apple-touch-icon") || rel.includes("apple-touch-icon-precomposed"))) continue;
    try {
      const url = new URL(a.href, base);
      if (url.protocol === "https:") found.push({ url: url.href, side: sideOf(a) });
    } catch { /* not a URL */ }
  }
  return found.sort((x, y) => y.side - x.side).map((f) => f.url).slice(0, 3);
}
