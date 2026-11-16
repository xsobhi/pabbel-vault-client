/**
 * The content script: runs in every https frame (and on localhost), finds
 * sign-in, code and new-password fields, and offers the vault there. It owns
 * no secrets: it asks the worker for a dropdown's names, and receives one
 * item's fields only after the person picks it.
 */
import { send } from "../shared/bridge";
import type { FieldKind, HelloReply } from "../shared/messages";
import { hideButton, showButton, trackButton } from "./button";
import { installCapture } from "./capture";
import { deepActive, isInput } from "./fields";
import { kindOf, kindsOnPage, otpTargetFor } from "./forms";
import { closeMenu, menuKey, menuOpen, repositionMenu } from "./menu";
import { hostElement } from "./overlay";
import { offerNextStep } from "./page-hints";
import { offerCode } from "./code-step";
import { openFor } from "./menu-actions";
import { installPushHandler } from "./push";
import { showBar } from "./savebar";
import type { SaveBarInfo } from "../shared/messages";

const state = { allowed: false, inline: true, kinds: "" };
let focusedField: HTMLInputElement | null = null;

async function hello(): Promise<void> {
  const kinds = kindsOnPage();
  const key = kinds.join(",");
  if (key === state.kinds && state.allowed) return;
  state.kinds = key;
  const reply = await send<HelloReply>({ type: "cs:hello", kinds }).catch(() => null);
  state.allowed = !!reply?.allowed;
  state.inline = reply?.inline ?? true;
}

function onFocus(el: Element | null): void {
  if (!isInput(el) || !state.allowed) return;
  const kind: FieldKind | null = kindOf(el);
  if (!kind) return;
  focusedField = el;
  void send({ type: "cs:focus", kind }).catch(() => {});
  if (!state.inline) return;
  const boxes = kind === "otp" ? otpTargetFor(el) : null;
  // A row of one-digit boxes gets one button, after the last box.
  showButton(el, () => {
    if (menuOpen()) { closeMenu(); return; }
    closeNativeList(el);
    void openFor(el, kind);
  }, boxes && boxes.length > 1 ? boxes[boxes.length - 1] : undefined);
}

/**
 * The browser's own autofill list is drawn above everything a page can draw, so
 * our menu would open underneath it. Pressing our button keeps the field
 * focused, which keeps that list open; a moment without focus closes it, and a
 * scripted focus does not bring it back. The person stays in the field.
 */
function closeNativeList(field: HTMLInputElement): void {
  field.blur();
  field.focus({ preventScroll: true });
}

function wire(): void {
  document.addEventListener("focusin", (e) => onFocus((e.composedPath()[0] as Element) ?? deepActive()), true);
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      const a = deepActive();
      if (!isInput(a) || !kindOf(a)) { hideButton(); closeMenu(); }
    }, 150);
  }, true);
  document.addEventListener("keydown", (e) => {
    if (menuKey(e)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  // A click in the field reopens the browser's list; ours gets out of its way rather than sit beneath it.
  document.addEventListener("pointerdown", (e) => {
    if (menuOpen() && !e.composedPath().includes(hostElement() as EventTarget)) closeMenu();
  }, true);
  window.addEventListener("scroll", () => { if (focusedField) repositionMenu(focusedField); }, { capture: true, passive: true });
  trackButton();

  // Multi-step sign-ins and single-page apps swap fields in without a page load: look again when the DOM settles.
  let timer: ReturnType<typeof setTimeout> | null = null;
  new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; void hello().then(() => { onFocus(deepActive()); void offerNextStep(); void offerCode(); }); }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["type", "hidden", "style", "class", "disabled", "readonly"] });
}

async function start(): Promise<void> {
  if (location.protocol !== "https:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  // Our own web vault stops offering the extension. No other site can tell we are here.
  if (location.hostname === "vault.pabbel.com") document.documentElement.setAttribute("data-pabbel-vault-ext", "1");
  await hello();
  if (!state.allowed) return; // e.g. a cross-site frame: nothing is offered here, ever
  wire();
  installCapture((req) => void send(req).catch(() => {}));
  installPushHandler(() => focusedField);
  onFocus(deepActive());
  void offerNextStep();
  void offerCode();
  if (window.top === window) {
    const info = await send<SaveBarInfo | null>({ type: "cs:pending" }).catch(() => null);
    if (info) showBar(info, (action, vaultId) => send<{ ok: boolean }>({ type: "cs:saveBar", action, vaultId }).then((r) => r.ok, () => false));
  }
}

void start();
