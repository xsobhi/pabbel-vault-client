/**
 * Noticing a sign-in being submitted, so the worker can offer to save it.
 *
 * Real <form> submits are the easy case. Single-page apps rarely submit
 * anything: they listen for a button click or Enter and call fetch(). So the
 * capture also runs on Enter in a sign-in field and on a click of anything
 * button-like in a sign-in scope. Values are read at that moment (the page is
 * about to clear or navigate) and sent once - duplicates are dropped.
 */
import type { ContentRequest } from "../shared/messages";
import { classOf, deepActive, isInput, isVisible } from "./fields";
import { loginContextFor } from "./forms";
import { pageIcon, pageNames } from "./page-hints";
import { LOGIN_CONTEXT, SIGNUP_CONTEXT } from "./patterns";

type Send = (req: ContentRequest) => void;

let last = "";
let lastAt = 0;

function report(from: HTMLInputElement | null, scopeHint: Element | null, send: Send): void {
  const field = from ?? (scopeHint ? Array.from(scopeHint.querySelectorAll("input")).find((i) => classOf(i) && isVisible(i)) ?? null : null);
  if (!field) return;
  const ctx = loginContextFor(field);
  if (!ctx) return;
  const username = ctx.username?.value.trim() ?? "";
  // A sign-up or change-password form: the new password is the one to keep.
  const password = ctx.newPasswords.find((p) => p.value)?.value ?? ctx.password?.value ?? "";
  if (!username && !password) return;
  const key = `${username}\u0001${password}`;
  if (key === last && Date.now() - lastAt < 3000) return;
  last = key;
  lastAt = Date.now();
  send({ type: "cs:capture", username, password, names: pageNames(), iconHref: pageIcon() });
}

const BUTTONISH = "button, [type=submit], [role=button], a[href^='#'], a[href^='javascript']";
const NEXT = /next|continue|submit|verify|weiter|suivant|continuar|siguiente|avanti|volgende|далее|продолж|dalej|devam|další|nästa|următorul|tiếp|lanjut|التالي|متابعة|بعدی|ادامه|अगला|পরবর্তী|அடுத்து|ถัดไป|下一步|继续|繼續|次へ|다음|επόμενο|endelea/i;

/** A submit button, or something that says "sign in" / "next" - not a "show password" eye. */
function submitLike(el: Element): boolean {
  if (el.matches("[type=submit]") || (el.matches("button:not([type])") && el.closest("form"))) return true;
  const text = `${el.textContent ?? ""} ${(el as HTMLInputElement).value ?? ""} ${el.getAttribute("aria-label") ?? ""}`.trim().slice(0, 60);
  return !!text && (NEXT.test(text) || LOGIN_CONTEXT.test(text) || SIGNUP_CONTEXT.test(text));
}

export function installCapture(send: Send): void {
  document.addEventListener("submit", (e) => {
    const form = e.target instanceof HTMLFormElement ? e.target : null;
    if (form) report(null, form, send);
  }, true);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.isTrusted) return;
    const el = deepActive();
    if (isInput(el) && classOf(el)) report(el, null, send);
  }, true);

  // pointerdown, not click: by click time some apps have already swapped the form out.
  document.addEventListener("pointerdown", (e) => {
    if (!e.isTrusted) return;
    const target = (e.composedPath()[0] as Element | undefined)?.closest?.(BUTTONISH);
    if (!target || !submitLike(target)) return;
    const scope = target.closest("form") ?? target.parentElement?.closest("div, section, main, form") ?? null;
    if (!scope) return;
    const field = Array.from(scope.querySelectorAll("input")).find((i) => (classOf(i) === "password" || classOf(i) === "newPassword") && i.value && isVisible(i))
      ?? Array.from(scope.querySelectorAll("input")).find((i) => classOf(i) === "username" && i.value && isVisible(i));
    if (field) report(field, null, send);
  }, true);
}
