/**
 * The step after the password: a sign-in that asks for its 2-step code. Once a
 * login's password has gone in (picked from the dropdown, typed by next-step,
 * or the shortcut), the worker remembers which code item belongs with that
 * login - the id, never the secret - and types the current code into the next
 * empty code field in that tab, on that site, within two minutes. Once.
 *
 * The same rules as next-step.ts: nothing when the vault is locked, nothing for
 * another site, never submitted. A code about to run out is not typed; the
 * next one is, as soon as it starts.
 */
import { CODE_MIN_LEFT_MS } from "../config";
import { codeForLogin, matchesFor } from "../shared/match";
import type { FillReply } from "../shared/messages";
import { allItems, ensureData, itemById } from "./data";
import { codeOf, senderSite } from "./fill";
import { getKeys } from "./session";
import { getSettings } from "./settings";
import { SESSION } from "./storage";
import { stepFits, tabSteps } from "./tab-steps";
import { recordRead } from "./writes";

const steps = tabSteps(SESSION.codeStep);

export const forgetCode = (tabId: number) => steps.forget(tabId);

/** How long to wait so the code typed has more than CODE_MIN_LEFT_MS to live: 0, or until just past the next period starts. */
export function codeWaitMs(periodS: number, now: number): number {
  const period = (periodS > 0 ? periodS : 30) * 1000;
  const left = period - (now % period);
  return left <= CODE_MIN_LEFT_MS ? left + 250 : 0;
}

/** The page put this login's password in. Whatever code step the tab had is replaced, or dropped. */
export async function passwordFilled(sender: chrome.runtime.MessageSender, loginId: string): Promise<void> {
  const site = senderSite(sender);
  const tabId = sender.tab?.id;
  if (!site || tabId === undefined) return;
  await forgetCode(tabId);
  if (!(await getKeys()) || !(await getSettings()).typeTotp) return;
  await ensureData();
  const m = matchesFor(allItems(), site);
  const login = m.logins.find((l) => l.id === loginId);
  const code = login ? codeForLogin(m, login) : null;
  if (code) await steps.remember(tabId, { id: code.id, site: site.site, at: Date.now() });
}

/** An empty code field appeared. Only the frame's own site can collect, and only once. */
export async function codeStep(sender: chrome.runtime.MessageSender): Promise<FillReply | null> {
  const site = senderSite(sender);
  const tabId = sender.tab?.id;
  if (!site || tabId === undefined) return null;
  const step = await steps.take(tabId);
  if (!step || !stepFits(step, site.site) || !(await getKeys()) || !(await getSettings()).typeTotp) return null;
  await ensureData();
  const it = itemById(step.id);
  if (!it || it.data.t !== "totp" || !matchesFor(allItems(), site).totps.some((t) => t.id === it.id)) return null;
  const wait = codeWaitMs(it.data.period, Date.now());
  if (wait) {
    await new Promise((r) => setTimeout(r, wait));
    if (!(await getKeys())) return null; // locked while we waited
  }
  recordRead(it.id, "code");
  return { code: await codeOf(it.data) };
}
