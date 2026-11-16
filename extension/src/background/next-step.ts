/**
 * Two-page sign-ins (Google and many banks): a login picked on the email page
 * has nowhere to put its password yet. The worker remembers which login was
 * chosen - the id, never the password - and gives its password to the next
 * empty password field in that tab, on that site, within two minutes. Once.
 *
 * Nothing is ever submitted: the password is typed in and the person decides,
 * and can swap it or pick another login from the field's button.
 */
import { matchesFor } from "../shared/match";
import type { FillReply } from "../shared/messages";
import { allItems, ensureData, itemById } from "./data";
import { loginReply, senderSite } from "./fill";
import { getKeys } from "./session";
import { SESSION } from "./storage";
import { stepFits, tabSteps } from "./tab-steps";

const steps = tabSteps(SESSION.nextStep);

export const rememberStep = (tabId: number, site: string, id: string) => steps.remember(tabId, { id, site, at: Date.now() });
export const forgetStep = (tabId: number) => steps.forget(tabId);

/** The content script filled the identifier and found no password field to go with it. */
export async function awaitPassword(sender: chrome.runtime.MessageSender, id: string): Promise<void> {
  const site = senderSite(sender);
  const tabId = sender.tab?.id;
  if (!site || tabId === undefined || !(await getKeys())) return;
  await ensureData();
  if (matchesFor(allItems(), site).logins.some((l) => l.id === id)) await rememberStep(tabId, site.site, id);
}

/** An empty password field appeared. Only the frame's own site can collect, and only once. */
export async function nextStep(sender: chrome.runtime.MessageSender): Promise<FillReply | null> {
  const site = senderSite(sender);
  const tabId = sender.tab?.id;
  if (!site || tabId === undefined) return null;
  const step = await steps.take(tabId);
  if (!step || !stepFits(step, site.site) || !(await getKeys())) return null;
  await ensureData();
  const it = itemById(step.id);
  const m = matchesFor(allItems(), site);
  if (!it || !m.logins.some((l) => l.id === it.id)) return null;
  const { password, codeCopied } = await loginReply(it, m);
  // The id lets the page say once the password is in, which is what a code step waits for.
  return { id: it.id, password, codeCopied };
}
