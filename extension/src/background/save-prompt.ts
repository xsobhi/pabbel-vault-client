/**
 * "Save to Pabbel Vault?" - deciding when to ask, and doing what was answered.
 *
 * A content script reports a submitted login (username + password, or just a
 * username on the first step of a two-step sign-in). If the site is not on the
 * never list and prompts are on, the worker compares it with the saved logins
 * for that site: same username + same password -> nothing; same username, new
 * password -> offer to update; otherwise -> offer to save. The pending capture
 * waits in storage.session (memory only) so the bar can appear on the page
 * the form navigated to, and is dropped after a few minutes either way.
 */
import { PENDING_SAVE_MS } from "../config";
import { siteName } from "../shared/brand";
import { matchesFor } from "../shared/match";
import { vaultInfo, type LoginData } from "../shared/items";
import type { SaveBarInfo } from "../shared/messages";
import { allItems, ensureData, vaults } from "./data";
import { noteIcon } from "./icons";
import { senderSite } from "./fill";
import { ensureUnlocked } from "./trust";
import { addNever, getSettings, isNever } from "./settings";
import { getSession, SESSION, setSession } from "./storage";
import { createItem, updateItem } from "./writes";
import { freshItem } from "./data";
import { displayName } from "./item-views";

interface Pending { site: string; host: string; origin: string; username: string; password: string; at: number; names?: string[]; iconHref?: string; itemId?: string; shownAt?: number }

/** After its first showing, the bar may follow the person to the next page (the form navigated) - not to every page after that. */
const FOLLOW_MS = 8_000;
type Store = Record<string, Pending>;

const load = async (key: string) => (await getSession<Store>(key)) ?? {};
const fresh = (p: Pending | undefined, site?: string) => !!p && Date.now() - p.at < PENDING_SAVE_MS && (!site || p.site === site);

async function setPending(tabId: number, p: Pending | null): Promise<void> {
  const all = await load(SESSION.pending);
  if (p) all[tabId] = p; else delete all[tabId];
  await setSession(SESSION.pending, all);
}

export interface PageHints { names: string[]; iconHref?: string }

export async function capture(sender: chrome.runtime.MessageSender, username: string, password: string, page: PageHints): Promise<void> {
  const site = senderSite(sender);
  const tabId = sender.tab?.id;
  if (!site || tabId === undefined || !(await getSettings()).savePrompts || (await isNever(site.site))) return;
  const users = await load(SESSION.lastUser);
  if (!password) {
    if (username) { users[tabId] = { site: site.site, host: site.host, origin: site.origin, username, password: "", at: Date.now() }; await setSession(SESSION.lastUser, users); }
    return;
  }
  const earlier = users[tabId];
  const name = username || (fresh(earlier, site.site) ? earlier.username : "");
  await setPending(tabId, { site: site.site, host: site.host, origin: site.origin, username: name, password, at: Date.now(), ...page });
  // The form may stay on this page (SPA) or navigate; the new page asks for the bar itself.
  setTimeout(() => void push(tabId), 900);
}

/** Work out what to ask, or null when there is nothing to ask. */
async function info(tabId: number): Promise<SaveBarInfo | null> {
  const p = (await load(SESSION.pending))[tabId];
  if (!fresh(p)) return null;
  // A login is waiting to be saved: that needs the vault, so a trusted browser opens it here.
  const locked = !(await ensureUnlocked());
  const page = { origin: p.origin, host: p.host, site: p.site, protocol: "https:", secure: true };
  const name = siteName(page, p.names);
  if (locked) return { kind: "save", locked, host: p.host, name, username: p.username, vaults: [] };
  await ensureData();
  const same = matchesFor(allItems(), page).logins.filter((l) => (l.data as LoginData).username.trim().toLowerCase() === p.username.trim().toLowerCase());
  if (same.some((l) => (l.data as LoginData).password === p.password)) { await setPending(tabId, null); return null; }
  const vaultList = vaults().map(vaultInfo);
  if (same[0]) {
    await setPending(tabId, { ...p, itemId: same[0].id });
    return { kind: "update", locked, host: p.host, name, username: p.username, vaults: vaultList, itemName: displayName(same[0].data) };
  }
  return { kind: "save", locked, host: p.host, name, username: p.username, vaults: vaultList };
}

async function markShown(tabId: number): Promise<void> {
  const all = await load(SESSION.pending);
  if (all[tabId] && !all[tabId].shownAt) { all[tabId].shownAt = Date.now(); await setSession(SESSION.pending, all); }
}

async function push(tabId: number): Promise<void> {
  const i = await info(tabId).catch(() => null);
  if (!i) return;
  const delivered = await chrome.tabs.sendMessage(tabId, { type: "sw:saveBar", info: i }, { frameId: 0 }).then(() => true, () => false);
  if (delivered) await markShown(tabId);
}

/** A freshly loaded top frame asking whether it should show the bar. */
export async function pendingFor(sender: chrome.runtime.MessageSender): Promise<SaveBarInfo | null> {
  const site = senderSite(sender);
  const tabId = sender.tab?.id;
  if (!site || tabId === undefined || sender.frameId !== 0) return null;
  const p = (await load(SESSION.pending))[tabId];
  if (!fresh(p, site.site) || (p.shownAt && Date.now() - p.shownAt > FOLLOW_MS)) return null;
  const i = await info(tabId);
  if (i) await markShown(tabId);
  return i;
}

export async function answer(sender: chrome.runtime.MessageSender, action: "save" | "never" | "dismiss" | "unlock", vaultId?: string): Promise<{ ok: boolean }> {
  const tabId = sender.tab?.id;
  if (tabId === undefined || sender.frameId !== 0 || !senderSite(sender)) return { ok: false };
  const p = (await load(SESSION.pending))[tabId];
  if (!fresh(p)) return { ok: false };
  if (action === "dismiss") { await setPending(tabId, null); return { ok: true }; }
  if (action === "never") { await addNever(p.site); await setPending(tabId, null); return { ok: true }; }
  if (action === "unlock") return { ok: true }; // the router opens the popup; the bar comes back after unlock
  if (!(await ensureUnlocked())) return { ok: false };
  if (p.itemId) {
    const it = await freshItem(p.itemId);
    if (it.data.t === "login") await updateItem(it.id, it.vaultId, { ...it.data, password: p.password });
  } else {
    const target = vaultId ?? vaults().find((v) => v.kind === "personal")?.id;
    if (!target) return { ok: false };
    const page = { origin: p.origin, host: p.host, site: p.site, protocol: "https:", secure: true };
    await createItem(target, { t: "login", name: siteName(page, p.names), username: p.username, password: p.password, url: p.origin, notes: "" });
    void noteIcon(p.origin, p.iconHref).catch(() => {});
  }
  await setPending(tabId, null);
  return { ok: true };
}

/** After an unlock, bring back any bar that was waiting for one. */
export async function resumePending(): Promise<void> {
  const all = await load(SESSION.pending);
  for (const [tabId, p] of Object.entries(all)) if (fresh(p)) void push(Number(tabId));
}

export async function forgetTabPending(tabId: number): Promise<void> {
  for (const key of [SESSION.pending, SESSION.lastUser]) {
    const all = await load(key);
    if (all[tabId]) { delete all[tabId]; await setSession(key, all); }
  }
}
