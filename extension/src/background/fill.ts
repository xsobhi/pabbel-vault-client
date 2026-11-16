/**
 * Content-script requests that touch secrets, and the gate in front of them.
 *
 * Every answer starts from frameMayFill(sender.url, sender.tab.url): the
 * frame and the top page must both be https (or the loopback) and share a
 * registrable domain. A dropdown asks for names only; a secret goes out only
 * when the person picks an item, only to the frame that asked, and only if
 * that item matches the frame's site.
 */
import { bestTotp, matchesFor, type SiteMatches } from "../shared/match";
import { frameMayFill, type SiteInfo } from "../shared/site";
import { generatePassword } from "../shared/generator";
import type { FieldKind, FillReply, HelloReply, InlineItem, ListReply } from "../shared/messages";
import type { Item, LoginData, TotpData } from "../shared/items";
import { totp } from "@vault/crypto/totp";
import { account } from "./auth";
import { allItems, ensureData, itemById, readyData } from "./data";
import { displayName } from "./item-views";
import { recordFrame } from "./frames";
import { getKeys, touch } from "./session";
import { getSettings } from "./settings";
import { recordRead } from "./writes";
import { writeClipboard } from "./clipboard";
import { createMaskFor, masksForSite } from "./masks";
import type { NewMaskReply } from "../shared/masks";

export const senderSite = (s: chrome.runtime.MessageSender): SiteInfo | null => frameMayFill(s.url, s.tab?.url);

const inline = (it: Item): InlineItem => {
  const d = it.data;
  return d.t === "totp"
    ? { id: it.id, name: d.name || d.issuer, subtitle: d.account, kind: "totp" }
    : { id: it.id, name: displayName(d), subtitle: d.t === "login" ? d.username : "", kind: "login" };
};

export async function hello(sender: chrome.runtime.MessageSender, kinds: FieldKind[]): Promise<HelloReply> {
  const allowed = !!senderSite(sender);
  if (allowed) await recordFrame(sender, { kinds });
  return { allowed, inline: allowed && (await getSettings()).inlineButton };
}

export async function focused(sender: chrome.runtime.MessageSender): Promise<void> {
  if (!senderSite(sender)) return;
  await recordFrame(sender, { focused: true });
  // Have the worker awake and the data warm before the person reaches for the field's button.
  if (await getKeys()) void readyData().catch(() => {});
}

/**
 * The dropdown's rows for one field: matching logins, or matching codes, never a
 * secret. A sign-up form's email box also gets this site's email masks and the
 * offer of a new one - unless the masks cannot be read, then no offer at all.
 */
export async function list(sender: chrome.runtime.MessageSender, kind: FieldKind, signup = false): Promise<ListReply> {
  const site = senderSite(sender);
  const empty: ListReply = { allowed: !!site, signedIn: !!(await account()), locked: true, items: [], generate: kind === "new" };
  if (!site || !empty.signedIn || !(await getKeys())) return empty;
  const [, masks] = await Promise.all([readyData(), signup ? masksForSite(site) : null]);
  await touch();
  const m = matchesFor(allItems(), site);
  const rows = kind === "otp" ? m.totps : m.logins;
  return { ...empty, locked: false, items: rows.map(inline), ...(masks ? { masks, maskOffer: true } : {}) };
}

/** "Use a new email mask": for a frame we would fill, while unlocked, on the person's genuine click (menu.ts). */
export async function newMask(sender: chrome.runtime.MessageSender, pageNames: string[]): Promise<NewMaskReply> {
  const site = senderSite(sender);
  if (!site || !(await getKeys())) return { error: "failed" };
  await touch();
  return createMaskFor(site, pageNames);
}

export async function codeOf(d: TotpData): Promise<string> {
  return (await totp({ secret: d.secret, algorithm: d.algorithm, digits: d.digits, period: d.period })).code;
}

/**
 * One login's fields, and its 2-step code when it has one: the worker copies
 * that to the clipboard itself (cleared 45 s later), so it is ready for the
 * next step without ever being handed to the page.
 */
export async function loginReply(it: Item, m: SiteMatches): Promise<FillReply> {
  recordRead(it.id, "autofill");
  const d = it.data as LoginData;
  const code = bestTotp(m.totps, d.username);
  let codeCopied = false;
  if (code && (await getSettings()).copyTotp) {
    codeCopied = await writeClipboard(await codeOf(code.data as TotpData)).then(() => true, () => false);
    if (codeCopied) recordRead(code.id, "code");
  }
  return { username: d.username, password: d.password, codeCopied };
}

/** The secret for ONE picked item, to the frame that asked - nothing else rides along. */
export async function fill(sender: chrome.runtime.MessageSender, id: string): Promise<FillReply> {
  const site = senderSite(sender);
  if (!site) return { error: "not-allowed" };
  if (!(await getKeys())) return { error: "locked" };
  await ensureData();
  const it = itemById(id);
  if (!it || it.broken) return { error: "not-found" };
  const m = matchesFor(allItems(), site);
  if (it.data.t === "login" && m.logins.some((l) => l.id === id)) return loginReply(it, m);
  if (it.data.t === "totp" && m.totps.some((t) => t.id === id)) {
    recordRead(id, "code");
    return { code: await codeOf(it.data) };
  }
  return { error: "not-for-this-site" };
}

/** A strong password for a sign-up / change-password field, with the person's generator dials. */
export async function generate(sender: chrome.runtime.MessageSender): Promise<{ password?: string; error?: string }> {
  if (!senderSite(sender)) return { error: "not-allowed" };
  return { password: generatePassword((await getSettings()).generator) };
}
