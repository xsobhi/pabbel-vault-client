/**
 * The inline dropdown under a field: matching logins (or codes), "use a
 * strong password" on new-password fields, and an honest state when the
 * vault is locked or has nothing for this site. It opens the moment the button
 * is pressed, with a skeleton, and the rows replace that when they arrive.
 * Rows carry names only; the secret is requested when one is picked
 * (menu-actions.ts).
 */
import { t } from "../shared/i18n";
import type { FieldKind, InlineItem, ListReply } from "../shared/messages";
import { icon, VAULT_MARK } from "../shared/icons";
import { h, initial, svg } from "./dom";
import { clickIsGenuine, layer, placeBelow } from "./overlay";
import { pageIcon } from "./page-hints";

export interface MenuHandlers {
  pick(item: InlineItem): void;
  generate(): void;
  openPopup(): void;
  /** An email mask made for this site before, typed into the field. */
  useMask(address: string): void;
  /** A new email mask for this site. */
  newMask(): void;
}

const WIDTH = 304;

let menu: HTMLDivElement | null = null;
let shownAt = 0;
let rows: HTMLButtonElement[] = [];
let active = -1;

export const menuOpen = () => !!menu?.isConnected;

export function closeMenu(): void {
  menu?.remove();
  menu = null;
  rows = [];
  active = -1;
}

function row(seal: Node, name: string, sub: string, onPick: () => void, extra?: Node): HTMLButtonElement {
  const b = h("button", { class: "row", type: "button", role: "option", tabindex: "-1" },
    h("span", { class: "seal" }, seal),
    h("span", { class: "txt" }, h("span", { class: "name" }, name), sub ? h("span", { class: "sub" }, sub) : null), extra);
  // mousedown would blur the page's field before the click lands; keep focus where it is.
  b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", (e) => { if (clickIsGenuine(e, shownAt)) onPick(); });
  // Keyboard picks (menuKey) arrive as this private event: trusted keystrokes in a field the person is typing in.
  b.addEventListener("pv-pick", onPick);
  return b;
}

/** The site's own icon, the one the browser already loaded for this page; the letter if it will not draw here. */
function siteSeal(name: string): Node {
  const img = h("img", { src: pageIcon(), alt: "", referrerpolicy: "no-referrer" });
  img.addEventListener("error", () => img.replaceWith(document.createTextNode(initial(name))), { once: true });
  return img;
}

/** Open, or swap what an open menu shows, keeping its place on screen. */
function present(field: HTMLInputElement, site: string, body: HTMLElement): void {
  if (menuOpen()) menu!.querySelector(".rows")?.replaceWith(body);
  else {
    closeMenu();
    const head = h("div", { class: "menu-head" }, svg(VAULT_MARK), h("span", { class: "brand" }, t("brandShort")), h("span", { class: "host" }, site));
    menu = h("div", { class: "menu", role: "dialog", "aria-label": t("brandShort") }, head, body);
    menu.dir = document.documentElement.dir === "rtl" || getComputedStyle(field).direction === "rtl" ? "rtl" : "ltr";
    layer().append(menu);
    placeBelow(menu, field.getBoundingClientRect(), WIDTH, menu.dir === "rtl");
  }
  shownAt = performance.now();
}

export function showLoading(field: HTMLInputElement, site: string): void {
  rows = [];
  const line = () => h("span", { class: "skel" }, h("i", { class: "skel-seal" }), h("span", { class: "skel-txt" }, h("i", { class: "skel-a" }), h("i", { class: "skel-b" })));
  present(field, site, h("div", { class: "rows", "aria-busy": "true", "aria-label": t("inlineLoading") }, line(), line()));
}

export function showFailed(field: HTMLInputElement, site: string, retry: () => void): void {
  const again = row(svg(icon("refresh-cw")), t("inlineLoadFailed"), t("inlineRetry"), retry);
  rows = [again];
  present(field, site, h("div", { class: "rows", role: "listbox" }, again));
}

export function showMenu(field: HTMLInputElement, kind: FieldKind, reply: ListReply, site: string, on: MenuHandlers): void {
  const list = h("div", { class: "rows", role: "listbox", "aria-label": t("brandShort") });
  const items: HTMLButtonElement[] = [];
  if (reply.generate) items.push(row(svg(icon("wand-sparkles")), t("inlineGenerate"), t("inlineGenerateHint"), on.generate));
  if (!reply.signedIn || reply.locked) {
    const pill = h("span", { class: "pill" }, reply.signedIn ? t("actionUnlock") : t("actionSignIn"));
    const gate = row(svg(icon("lock")), reply.signedIn ? t("inlineLocked") : t("inlineSignedOut"), reply.signedIn ? t("inlineLockedHint") : "", on.openPopup, pill);
    gate.classList.add("gate-row");
    items.push(gate);
    list.append(...items);
  } else {
    // A sign-up's email box: this site's masks first, then a new one - before any saved login.
    for (const m of reply.masks ?? []) items.push(row(svg(icon("venetian-mask")), m.address, t("inlineMaskExisting"), () => on.useMask(m.address)));
    if (reply.maskOffer) items.push(row(svg(icon("venetian-mask")), t("inlineMaskNew"), t("inlineMaskHint"), on.newMask));
    for (const it of reply.items) {
      const seal = it.kind === "totp" ? svg(icon("clock")) : siteSeal(it.name);
      items.push(row(seal, it.name || it.subtitle, it.kind === "totp" ? it.subtitle || t("typeTotp") : it.subtitle, () => on.pick(it)));
    }
    list.append(...items);
    if (!reply.items.length && kind !== "new" && !reply.maskOffer) list.append(h("div", { class: "note" }, kind === "otp" ? t("inlineNoCodes", site) : t("inlineNoLogins", site)));
  }
  rows = items;
  present(field, site, list);
}

/** Arrow keys / Enter / Escape while the page's field has focus. Returns true when handled. */
export function menuKey(e: KeyboardEvent): boolean {
  if (!menu || !e.isTrusted) return false;
  if (e.key === "Escape") { closeMenu(); return true; }
  if (!rows.length) return false;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    active = (active + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
    rows.forEach((r, i) => r.setAttribute("aria-selected", String(i === active)));
    rows[active].scrollIntoView({ block: "nearest" });
    return true;
  }
  if (e.key === "Enter" && active >= 0) {
    rows[active].dispatchEvent(new CustomEvent("pv-pick"));
    return true;
  }
  return false;
}

export function repositionMenu(field: HTMLInputElement): void {
  if (menu) placeBelow(menu, field.getBoundingClientRect(), WIDTH, menu.dir === "rtl");
}
