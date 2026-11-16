/** What the page says about itself: the names it goes by, and its own icon (already loaded by the browser). */
import { t } from "../shared/i18n";
import { send } from "../shared/bridge";
import type { FillReply } from "../shared/messages";
import { allInputs, classOf, isVisible } from "./fields";
import { afterPasswordFill } from "./code-step";
import { setValue } from "./fill-dom";
import { toast } from "./overlay";

const meta = (selector: string) => document.querySelector<HTMLMetaElement>(selector)?.content ?? "";

export function pageNames(): string[] {
  return [meta('meta[property="og:site_name"]'), meta('meta[name="application-name"]'), meta('meta[name="apple-mobile-web-app-title"]'), ...document.title.split(/\s[-–—|·•:]\s/)]
    .map((n) => n.trim()).filter(Boolean).slice(0, 6);
}

const sideOf = (link: HTMLLinkElement) => Math.max(0, ...[...(link.getAttribute("sizes") ?? "").matchAll(/(\d+)x\d+/gi)].map((m) => Number(m[1])));

/** The page's biggest linked icon, or the conventional address. */
export function pageIcon(): string {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel~="apple-touch-icon"]')).filter((l) => l.href);
  return links.sort((a, b) => sideOf(b) - sideOf(a))[0]?.href ?? `${location.origin}/favicon.ico`;
}

const asked = new WeakSet<HTMLInputElement>();

/**
 * The second page of a two-page sign-in: an empty password field showed up, so
 * ask whether a login was picked on the page before. Typed in, never submitted.
 */
export async function offerNextStep(): Promise<void> {
  const field = allInputs().find((i) => classOf(i) === "password" && !i.value && !asked.has(i) && isVisible(i));
  if (!field) return;
  asked.add(field);
  const res = await send<FillReply | null>({ type: "cs:nextStep" }).catch(() => null);
  if (!res?.password || field.value || !isVisible(field)) return;
  setValue(field, res.password);
  toast(t(res.codeCopied ? "toastPasswordFilledCode" : "toastPasswordFilled"), field.getBoundingClientRect());
  if (res.id) await afterPasswordFill(res.id);
}
