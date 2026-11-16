/**
 * Filling without the dropdown: the keyboard shortcut, the context menu and
 * the popup's "Fill" button. The worker asks the candidate frames what is
 * focused (probe, no secrets), checks the chosen frame against the top page,
 * and only then sends that one document the one item's fields.
 */
import { bestLogin, bestTotp, loginMatches, matchesFor } from "../shared/match";
import { frameMayFill } from "../shared/site";
import { generatePassword } from "../shared/generator";
import type { Item, LoginData, TotpData } from "../shared/items";
import type { ProbeReply } from "../shared/messages";
import { allItems, ensureData, itemById } from "./data";
import { codeOf } from "./fill";
import { frameEntry, framesOf, sendToFrame, type FrameEntry } from "./frames";
import { rememberStep } from "./next-step";
import { getKeys } from "./session";
import { ensureUnlocked } from "./trust";
import { getSettings } from "./settings";
import { recordRead } from "./writes";
import { openPopup } from "./popup-window";

async function frameUrl(tabId: number, f: FrameEntry): Promise<string | undefined> {
  if (f.frameId === 0) return (await chrome.tabs.get(tabId)).url;
  // Sub-frames are only known through their own content script's report, which carries the URL.
  return f.url || undefined;
}

interface Target { frame: FrameEntry; probe: ProbeReply; topUrl: string; frameUrl: string }

/** The frame to fill: the one that answers the probe with a field, preferring the hinted or last-focused one. */
async function pickFrame(tabId: number, prefer?: number): Promise<Target | null> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url) return null;
  for (const f of await framesOf(tabId, prefer)) {
    const probe = await sendToFrame<ProbeReply>(tabId, f, { type: "sw:probe" });
    if (!probe || probe.kind === "none") continue;
    const url = await frameUrl(tabId, f);
    if (url && frameMayFill(url, tab.url)) return { frame: f, probe, topUrl: tab.url, frameUrl: url };
  }
  return null;
}

/** Shortcut / context menu: the focused code field gets a code, anything else the best login. */
export async function fillBest(tabId: number, preferFrame?: number): Promise<boolean> {
  if (!(await ensureUnlocked())) { await openPopup(); return false; }
  const target = await pickFrame(tabId, preferFrame);
  if (!target) return false;
  await ensureData();
  const site = frameMayFill(target.frameUrl, target.topUrl)!;
  const m = matchesFor(allItems(), site);
  if (target.probe.kind === "otp") {
    const it = bestTotp(m.totps, target.probe.username);
    return it ? sendCode(tabId, target, it) : false;
  }
  const it = bestLogin(m.logins, target.probe.username);
  return it ? sendLogin(tabId, target, it) : false;
}

async function sendLogin(tabId: number, target: Target, it: Item): Promise<boolean> {
  const d = it.data as LoginData;
  recordRead(it.id, "autofill");
  const res = await sendToFrame<{ filled: boolean; awaitPassword?: boolean }>(tabId, target.frame, { type: "sw:fill", id: it.id, username: d.username, password: d.password });
  const site = frameMayFill(target.frameUrl, target.topUrl);
  if (res?.awaitPassword && site) await rememberStep(tabId, site.site, it.id);
  return !!res?.filled;
}

async function sendCode(tabId: number, target: Target, it: Item): Promise<boolean> {
  recordRead(it.id, "code");
  const code = await codeOf(it.data as TotpData);
  const res = await sendToFrame<{ filled: boolean }>(tabId, target.frame, { type: "sw:fill", code });
  return !!res?.filled;
}

/** The popup's Fill button: this item, into the active tab, if it belongs to that site. */
export async function fillItemInTab(id: string, tabId: number): Promise<boolean> {
  await ensureData();
  const it = itemById(id);
  if (!it || it.broken || !(await getKeys())) return false;
  const target = await pickFrame(tabId);
  if (!target) return false;
  const site = frameMayFill(target.frameUrl, target.topUrl)!;
  if (it.data.t === "login" && loginMatches(it.data, site)) return sendLogin(tabId, target, it);
  if (it.data.t === "totp" && matchesFor(allItems(), site).totps.some((t) => t.id === id)) return sendCode(tabId, target, it);
  return false;
}

/** Context menu "Generate a password": into the field that was right-clicked. */
export async function fillGenerated(tabId: number, frameId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  const f = (await frameEntry(tabId, frameId)) ?? { frameId, url: "", kinds: [], focusedAt: 0 };
  const url = await frameUrl(tabId, f);
  if (!url || !frameMayFill(url, tab.url)) return;
  const password = generatePassword((await getSettings()).generator);
  await sendToFrame(tabId, f, { type: "sw:fillGenerated", password });
}
