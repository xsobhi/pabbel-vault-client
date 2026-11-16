/**
 * The one element we add to a page: <pabbel-vault-ui>, a zero-sized fixed box
 * on <html> with a CLOSED shadow root. Everything we draw (field button,
 * dropdown, save bar, toast) lives inside it and is positioned with fixed
 * coordinates, so the page's layout is never touched - no wrapper around the
 * field, no padding added, nothing reflowed.
 */
import { CSS } from "./styles";

let host: HTMLElement | null = null;
let root: ShadowRoot | null = null;
let ui: HTMLDivElement | null = null;

function applyStyles(sr: ShadowRoot): void {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    sr.adoptedStyleSheets = [sheet];
  } catch {
    const style = document.createElement("style");
    style.textContent = CSS;
    sr.append(style);
  }
}

/** The container inside the shadow root, created on first use and re-attached if the page removed it. */
export function layer(): HTMLDivElement {
  if (!host || !root || !ui) {
    host = document.createElement("pabbel-vault-ui");
    // Closed: the page's own scripts cannot reach into the extension's UI.
    root = host.attachShadow({ mode: "closed" });
    applyStyles(root);
    ui = document.createElement("div");
    ui.className = "ui";
    root.append(ui);
  }
  if (!host.isConnected) document.documentElement.append(host);
  return ui;
}

export const hostElement = () => host;

/**
 * Was this click really on our UI, as the person saw it? A page can try to
 * make our dropdown invisible (opacity on <html>) or lay something over it,
 * and harvest a click that "picks" a login. The click must be trusted, land
 * on our host per elementFromPoint, and the page must not be faded out.
 */
export function clickIsGenuine(e: MouseEvent, shownAt: number): boolean {
  if (!e.isTrusted || !host) return false;
  if (performance.now() - shownAt < 250) return false;
  if (document.elementFromPoint(e.clientX, e.clientY) !== host) return false;
  for (const el of [document.documentElement, document.body, host]) {
    if (!el) continue;
    const cs = getComputedStyle(el);
    // Not `filter`: dark-mode extensions invert whole pages with it, legitimately.
    if (Number(cs.opacity) < 0.95 || cs.visibility !== "visible") return false;
  }
  return true;
}

/** Fixed-position box under (or above) an anchor rect, kept on screen; mirrors in RTL. */
export function placeBelow(el: HTMLElement, anchor: DOMRect, width: number, rtl: boolean): void {
  const vw = window.innerWidth, vh = window.innerHeight;
  const left = Math.min(Math.max(8, rtl ? anchor.right - width : anchor.left), vw - width - 8);
  const below = anchor.bottom + 6;
  const spaceBelow = vh - below;
  el.style.left = `${left}px`;
  if (spaceBelow < 200 && anchor.top > spaceBelow) {
    el.style.top = "";
    el.style.bottom = `${vh - anchor.top + 6}px`;
  } else {
    el.style.bottom = "";
    el.style.top = `${below}px`;
  }
}

/** A small toast next to a field, gone after a moment. */
export function toast(text: string, near: DOMRect | null): void {
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = text;
  const r = near ?? new DOMRect(window.innerWidth - 240, 20, 200, 0);
  t.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - 220))}px`;
  t.style.top = `${Math.min(r.bottom + 8, window.innerHeight - 40)}px`;
  layer().append(t);
  setTimeout(() => t.remove(), 2600);
}
