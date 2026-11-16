/**
 * Email masks for the in-page dropdown and the popup. The list comes from
 * /vault/masks: addresses and states in the clear (the mail server needs
 * them), and what each mask is for as `meta`, sealed under the personal vault
 * key (@vault/crypto/mask-meta). Which masks belong to THIS site is decided
 * here, after opening their meta - the server is never asked and never knows.
 * Held in this worker's memory for a minute at most, forgotten on lock.
 */
import type { Mask } from "../vault-types";
import { openMaskMeta, sealMaskMeta, tidyMaskMeta, type MaskMeta } from "@vault/crypto/mask-meta";
import { DATA_STALE_MS } from "../config";
import { siteName } from "../shared/brand";
import { isMaskAddress, type InlineMask, type NewMaskReply } from "../shared/masks";
import { isIpHost } from "../shared/psl";
import { isLoopback, type SiteInfo } from "../shared/site";
import { ApiError, vaultApi } from "./api";
import { readyData, vaults } from "./data";
import { openVaultKey } from "./vault-keys";

/** A mask, and its meta once opened on this device. */
interface Held extends Mask { opened?: MaskMeta & { broken?: true } }

let cache: { at: number; masks: Held[] } | null = null;
let inflight: Promise<Held[]> | null = null;

export function forgetMasks(): void {
  cache = null;
  inflight = null;
}

/** The account's masks, a minute old at most. Throws when the server cannot answer. */
function allMasks(): Promise<Held[]> {
  if (cache && Date.now() - cache.at < DATA_STALE_MS) return Promise.resolve(cache.masks);
  inflight ??= vaultApi.masks()
    .then((r) => { cache = { at: Date.now(), masks: r.masks }; return r.masks; })
    .finally(() => { inflight = null; });
  return inflight;
}

/** The personal vault's key: what mask meta is sealed under. Null when there is no personal vault. */
async function personalKey(): Promise<CryptoKey | null> {
  await readyData();
  const personal = vaults().find((v) => v.kind === "personal");
  return personal ? openVaultKey(personal) : null;
}

async function metaOf(m: Held, key: CryptoKey): Promise<MaskMeta> {
  m.opened ??= await openMaskMeta(key, m.id, m.meta);
  return m.opened;
}

/**
 * The active masks made for this site, newest first: what someone coming back
 * to a site picks from. Null when masks cannot be offered at all (offline, a
 * server without them, no personal vault to seal with) - then the dropdown
 * offers no mask rather than one that would fail.
 */
export async function masksForSite(site: SiteInfo): Promise<InlineMask[] | null> {
  try {
    const [all, key] = await Promise.all([allMasks(), personalKey()]);
    if (!key) return null;
    const out: InlineMask[] = [];
    for (const m of all) if (m.state === "active" && m.meta && (await metaOf(m, key)).site === site.site) out.push({ id: m.id, address: m.address });
    return out;
  } catch {
    return null;
  }
}

/** The site a mask records: a registrable domain, never an IP or a loopback name. */
export function maskSiteOf(site: SiteInfo): string | undefined {
  return isIpHost(site.host) || isLoopback(site.host) || !site.site.includes(".") ? undefined : site.site;
}

/**
 * A new mask, then its meta - the name people know the site by ("GitHub", not
 * "github.com") and the site - sealed with the new id. The address works from
 * the first step on; if the second fails it is simply unlabelled.
 */
export async function createMaskFor(site: SiteInfo, pageNames: string[]): Promise<NewMaskReply> {
  let held: Held;
  try {
    held = await vaultApi.createMask({});
  } catch (e) {
    return { error: e instanceof ApiError && e.status === 429 ? "rate" : "failed" };
  }
  try {
    const meta = tidyMaskMeta({ label: siteName(site, pageNames), site: maskSiteOf(site) });
    const key = await personalKey();
    const sealed = key ? await sealMaskMeta(key, held.id, meta) : null;
    if (sealed) held = { ...(await vaultApi.updateMask(held.id, { meta: sealed })), opened: meta };
  } catch { /* unlabelled, still a working address */ }
  if (cache) cache = { at: cache.at, masks: [held, ...cache.masks] };
  return { address: held.address };
}

/** A saved username's state as a mask, for the popup; null when it is not one of this account's masks. */
export async function maskState(address: string): Promise<Mask["state"] | null> {
  if (!isMaskAddress(address)) return null;
  const want = address.trim().toLowerCase();
  try {
    return (await allMasks()).find((m) => m.address === want)?.state ?? null;
  } catch {
    return null;
  }
}
