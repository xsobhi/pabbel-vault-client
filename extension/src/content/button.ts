/**
 * The small vault mark inside the focused field's end edge. Shown only while
 * a sign-in, code or new-password field has focus - never sprinkled over a
 * page - and drawn in our overlay, so the field itself is never modified.
 */
import { t } from "../shared/i18n";
import { VAULT_MARK } from "../shared/icons";
import { h, svg } from "./dom";
import { clickIsGenuine, layer } from "./overlay";

let button: HTMLButtonElement | null = null;
let anchor: HTMLInputElement | null = null;
let shownAt = 0;

const SIZE = 22;

function place(): void {
  if (!button || !anchor) return;
  const r = anchor.getBoundingClientRect();
  if (r.width < 4 || r.bottom < 0 || r.top > window.innerHeight) { button.style.display = "none"; return; }
  button.style.display = "";
  const rtl = getComputedStyle(anchor).direction === "rtl";
  // Small boxes (one-digit code inputs) get the button just outside, not on top of the digit.
  const inside = r.width >= 90;
  const x = inside ? (rtl ? r.left + 6 : r.right - SIZE - 6) : (rtl ? r.left - SIZE - 4 : r.right + 4);
  button.style.left = `${Math.round(x)}px`;
  button.style.top = `${Math.round(r.top + (r.height - SIZE) / 2)}px`;
}

export function showButton(field: HTMLInputElement, onClick: () => void, after?: HTMLInputElement): void {
  // Re-showing on the same field (the page's DOM settled again) must not restart the
  // anti-clickjacking delay, or a click landing right then is silently dropped.
  const same = !!button?.isConnected && anchor === (after ?? field);
  anchor = after ?? field;
  if (!button) {
    button = h("button", { class: "btn-field", type: "button", tabindex: "-1", "aria-label": t("inlineButtonLabel"), title: t("inlineButtonLabel") }, svg(VAULT_MARK));
    button.addEventListener("mousedown", (e) => e.preventDefault());
  }
  button.onclick = (e) => { if (clickIsGenuine(e, shownAt)) onClick(); };
  layer().append(button);
  place();
  if (!same) shownAt = performance.now();
}

export function hideButton(): void {
  button?.remove();
  anchor = null;
}

export const buttonAnchor = () => anchor;

let raf = 0;
/** Follow the field through scrolling and resizing, at most once a frame. */
export function trackButton(): void {
  const update = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; place(); }); };
  window.addEventListener("scroll", update, { capture: true, passive: true });
  window.addEventListener("resize", update, { passive: true });
}
