/**
 * Items as the popup and the in-page dropdown show them. A login named after
 * its own domain (what earlier versions saved) reads as the brand, without
 * touching what is stored; and every row says which origin's icon it wears,
 * codes borrowing the icon of the login they belong to.
 */
import { siteName } from "../shared/brand";
import { summarize, type Item, type ItemData, type ItemSummary } from "../shared/items";
import { brandLabel, siteOfItemUrl } from "../shared/site";

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function displayName(d: ItemData): string {
  if (d.t !== "login") return d.name;
  const s = siteOfItemUrl(d.url);
  const name = d.name.trim().toLowerCase();
  return s && (name === s.site || name === s.host) ? siteName(s) : d.name;
}

export function summaries(items: Item[]): ItemSummary[] {
  const originByBrand = new Map<string, string>();
  for (const it of items) {
    if (it.data.t !== "login") continue;
    const s = siteOfItemUrl(it.data.url);
    if (s) originByBrand.set(squash(brandLabel(s)), s.origin);
  }
  return items.map((it) => {
    const d = it.data;
    const iconKey = d.t === "login" ? siteOfItemUrl(d.url)?.origin : d.t === "totp" ? originByBrand.get(squash(d.issuer || d.name)) : undefined;
    return { ...summarize(it), name: displayName(d), iconKey };
  });
}
