/**
 * Website icons for the popup's list. Kept on disk, encrypted under the
 * personal vault key: which sites someone has logins for is vault content, so
 * the cache must say nothing while the vault is locked. Keyed by origin, shown
 * at once on every open, looked up again after a month; a site with no usable
 * icon is left alone for a week. Settings can turn all of it off.
 */
import { decryptJson, encryptJson } from "@vault/crypto/aead";
import { siteOf } from "../shared/site";
import { vaults } from "./data";
import { fetchIcon } from "./icon-fetch";
import { getSettings } from "./settings";
import { getLocal, LOCAL, removeLocal, setLocal } from "./storage";
import { openVaultKey } from "./vault-keys";

const AAD = "extension-site-icons-v1";
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 1500;
/** Looked up per popup open, so a big vault fills in over a few opens rather than in one burst. */
const BATCH = 40;
const PARALLEL = 4;
const SAVE_EVERY = 8;

interface Entry { d?: string; at: number }

let icons: Map<string, Entry> | null = null;
let fetching = false;

async function keyOf(): Promise<CryptoKey | null> {
  const v = vaults().find((x) => x.kind === "personal");
  return v ? openVaultKey(v) : null;
}

async function load(): Promise<Map<string, Entry>> {
  if (icons) return icons;
  const key = await keyOf();
  const blob = await getLocal<string>(LOCAL.icons);
  // A changed vault key just means fetching them again.
  const held = key && blob ? await decryptJson<Record<string, Entry>>(key, blob, AAD).catch(() => ({})) : {};
  icons = new Map(Object.entries(held));
  return icons;
}

async function persist(): Promise<void> {
  const key = await keyOf();
  if (!key || !icons) return;
  const newest = [...icons].sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES);
  await setLocal(LOCAL.icons, await encryptJson(key, Object.fromEntries(newest), AAD));
}

const isDue = (e: Entry | undefined, now: number) => !e || now - e.at > (e.d ? KEEP_MS : RETRY_MS);

async function lookUp(origin: string, hint?: string): Promise<void> {
  const site = siteOf(origin)?.site;
  const data = site ? await fetchIcon(origin, site, hint).catch(() => null) : null;
  // A failed refresh keeps the icon we have.
  icons?.set(origin, { d: data ?? icons.get(origin)?.d, at: Date.now() });
}

async function fetchAll(origins: string[]): Promise<void> {
  if (fetching) return;
  fetching = true;
  try {
    const queue = [...origins];
    let done = 0;
    await Promise.all(Array.from({ length: PARALLEL }, async () => {
      for (let o = queue.shift(); o; o = queue.shift()) {
        await lookUp(o);
        if (++done % SAVE_EVERY === 0) await persist(); // the worker can be stopped at any moment
      }
    }));
    await persist();
  } finally { fetching = false; }
}

/** What we hold for these origins, straight away. Anything missing or old is looked up behind the reply. */
export async function iconsFor(origins: string[]): Promise<Record<string, string>> {
  if (!(await getSettings()).showIcons) return {};
  const held = await load();
  const out: Record<string, string> = {};
  const now = Date.now();
  const due: string[] = [];
  for (const o of origins) {
    const e = held.get(o);
    if (e?.d) out[o] = e.d;
    if (isDue(e, now)) due.push(o);
  }
  if (due.length) void fetchAll(due.slice(0, BATCH));
  return out;
}

/** A login was just saved: the page has shown us which icon it uses, so take that one. */
export async function noteIcon(origin: string, hint?: string): Promise<void> {
  if (!(await getSettings()).showIcons) return;
  await load();
  await lookUp(origin, hint);
  await persist();
}

/** Locked: drop the readable copy. The encrypted one stays for the next unlock. */
export function forgetIcons(): void { icons = null; }

export async function clearIcons(): Promise<void> {
  icons = null;
  await removeLocal(LOCAL.icons);
}
