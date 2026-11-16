/**
 * One entry point for every message, and the trust split it enforces:
 * extension pages (popup, options) may send PopupRequests; anything sent from
 * a web page's frame may only send "cs:*" requests, each of which re-checks
 * the frame it came from. A content script asking for "item" or "unlock" is
 * refused here, before any handler runs.
 */
import type { AnyRequest, ContentRequest, PopupRequest } from "../shared/messages";
import { popupHandler } from "./popup-handlers";
import { capture, answer, pendingFor, type PageHints } from "./save-prompt";
import { fill, focused, generate, hello, list, newMask } from "./fill";
import { awaitPassword, nextStep } from "./next-step";
import { codeStep, passwordFilled } from "./code-step";
import { openPopup } from "./popup-window";
import { ensureUnlocked } from "./trust";

type Reply = { ok: true; value: unknown } | { ok: false; error: string };

export function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  const base = chrome.runtime.getURL("");
  return sender.id === chrome.runtime.id && !!sender.url && sender.url.startsWith(base);
}

const isContent = (sender: chrome.runtime.MessageSender) =>
  sender.id === chrome.runtime.id && !!sender.tab && sender.frameId !== undefined && !!sender.url && !isExtensionPage(sender);

/** What the page says about itself: short strings, and only an https icon. */
function pageHints(msg: { names?: unknown; iconHref?: unknown }): PageHints {
  const names = (Array.isArray(msg.names) ? msg.names : []).filter((n): n is string => typeof n === "string").slice(0, 6).map((n) => n.slice(0, 80));
  const href = typeof msg.iconHref === "string" && msg.iconHref.startsWith("https://") ? msg.iconHref.slice(0, 500) : undefined;
  return { names, iconHref: href };
}

/** A person opened a field's dropdown or picked an item: that needs the vault, so a trusted browser opens it first. */
const NEEDS_VAULT = new Set<ContentRequest["type"]>(["cs:list", "cs:fill"]);

async function content(msg: ContentRequest, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (NEEDS_VAULT.has(msg.type)) await ensureUnlocked();
  switch (msg.type) {
    case "cs:hello": return hello(sender, Array.isArray(msg.kinds) ? msg.kinds : []);
    case "cs:focus": return focused(sender);
    case "cs:list": return list(sender, msg.kind, msg.signup === true);
    case "cs:createMask": return newMask(sender, pageHints(msg).names);
    case "cs:fill": return fill(sender, String(msg.id));
    case "cs:generate": return generate(sender);
    case "cs:awaitPassword": return awaitPassword(sender, String(msg.id));
    case "cs:nextStep": return nextStep(sender);
    case "cs:passwordFilled": return passwordFilled(sender, String(msg.id));
    case "cs:codeStep": return codeStep(sender);
    case "cs:capture": return capture(sender, String(msg.username ?? "").slice(0, 512), String(msg.password ?? "").slice(0, 1024), pageHints(msg));
    case "cs:pending": return pendingFor(sender);
    case "cs:saveBar": {
      const res = await answer(sender, msg.action, msg.vaultId);
      if (msg.action === "unlock") await openPopup();
      return res;
    }
    case "cs:openPopup": return openPopup();
  }
}

async function handle(msg: AnyRequest, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (typeof msg?.type !== "string") throw new Error("bad message");
  if (msg.type.startsWith("cs:")) {
    if (!isContent(sender)) throw new Error("not from a page");
    return content(msg as ContentRequest, sender);
  }
  if (!isExtensionPage(sender)) throw new Error("not allowed from a page");
  return popupHandler(msg as PopupRequest);
}

export function initRouter(): void {
  chrome.runtime.onMessage.addListener((msg: AnyRequest & { target?: string }, sender, sendResponse: (r: Reply) => void) => {
    if (msg?.target === "offscreen") return false; // for the offscreen document, not us
    handle(msg, sender).then(
      (value) => sendResponse({ ok: true, value: value ?? null }),
      (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
    );
    return true;
  });
}
