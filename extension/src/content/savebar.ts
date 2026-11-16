/**
 * "Save your Google login?" - a small card in the top corner of the page, never
 * a modal and never in the way of the page's own controls. Saving folds it into
 * a pill that thanks you and leaves. The password itself is not in here: the
 * worker holds the captured login and only hears back which button was pressed.
 */
import { t } from "../shared/i18n";
import { icon, VAULT_MARK } from "../shared/icons";
import type { SaveBarInfo } from "../shared/messages";
import { h, initial, svg } from "./dom";
import { clickIsGenuine, layer } from "./overlay";
import { pageIcon } from "./page-hints";

export type BarAction = "save" | "never" | "dismiss" | "unlock";

let bar: HTMLDivElement | null = null;
let shownAt = 0;
let shownKey = "";
let autoClose: ReturnType<typeof setTimeout> | null = null;

export function closeBar(): void {
  bar?.remove();
  bar = null;
  if (autoClose) clearTimeout(autoClose);
}

function tile(name: string): HTMLElement {
  const img = h("img", { src: pageIcon(), alt: "", referrerpolicy: "no-referrer" });
  const box = h("span", { class: "tile" }, img, h("span", { class: "tile-mark" }, svg(VAULT_MARK)));
  img.addEventListener("error", () => img.replaceWith(document.createTextNode(initial(name))), { once: true });
  return box;
}

function titleOf(info: SaveBarInfo): string {
  if (info.locked) return t("saveLockedTitle");
  return info.kind === "update" ? t("saveUpdateTitle") : t("saveTitleFor", info.name);
}

/** Fold into the pill. */
function finish(info: SaveBarInfo): void {
  if (!bar) return;
  const text = info.kind === "update" ? t("saveUpdated") : t("saveSaved");
  bar.className = "bar is-done";
  bar.setAttribute("role", "status");
  bar.replaceChildren(h("span", { class: "tick" }, svg(icon("check"))), h("span", {}, text));
  autoClose = setTimeout(() => {
    bar?.classList.add("is-leaving");
    autoClose = setTimeout(closeBar, 180);
  }, 1500);
}

export function showBar(info: SaveBarInfo, act: (a: BarAction, vaultId?: string) => Promise<boolean>): void {
  // The new page asks for the card and the worker pushes it too: the second must not rebuild it under the person's cursor.
  const key = JSON.stringify([info.kind, info.locked, info.host, info.username]);
  if (bar?.isConnected && key === shownKey) return;
  shownKey = key;
  closeBar();
  const title = titleOf(info);
  const detail = info.kind === "update" && info.itemName ? t("saveUpdateDetail", info.itemName) : info.username || info.host;
  const close = h("button", { class: "x", type: "button", "aria-label": t("actionClose") }, svg(icon("x")));
  const top = h("div", { class: "bar-top" }, tile(info.name), h("div", { class: "bar-text" }, h("h2", {}, title), h("p", { class: "who", title: detail }, detail)), close);

  let select: HTMLSelectElement | null = null;
  if (!info.locked && info.kind === "save" && info.vaults.length > 1) {
    select = h("select", { "aria-label": t("saveIn") });
    for (const v of info.vaults) select.append(h("option", { value: v.id }, v.kind === "personal" ? t("vaultPersonal") : v.name));
  }
  const primary = h("button", { class: "primary", type: "button" }, info.locked ? t("actionUnlock") : info.kind === "update" ? t("actionUpdate") : t("actionSave"));
  const never = h("button", { class: "quiet", type: "button" }, t("saveNever"));

  bar = h("div", { class: "bar", role: "dialog", "aria-label": title }, top, h("div", { class: "actions" }, never, select, primary));
  bar.dir = document.documentElement.dir === "rtl" ? "rtl" : "ltr";
  layer().append(bar);
  shownAt = performance.now();

  const guard = (fn: () => void) => (e: MouseEvent) => { if (clickIsGenuine(e, shownAt)) fn(); };
  close.addEventListener("click", guard(() => { void act("dismiss"); closeBar(); }));
  never.addEventListener("click", guard(() => { void act("never"); closeBar(); }));
  primary.addEventListener("click", guard(async () => {
    if (info.locked) { void act("unlock"); return; }
    primary.disabled = true;
    primary.classList.add("is-busy");
    const ok = await act("save", select?.value);
    if (ok) { if (autoClose) clearTimeout(autoClose); finish(info); return; }
    primary.disabled = false;
    primary.classList.remove("is-busy");
  }));
  // Out of the way after two minutes even if ignored; the worker forgets the login soon after.
  autoClose = setTimeout(closeBar, 120_000);
}
