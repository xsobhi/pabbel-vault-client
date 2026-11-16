/**
 * From single fields to what a person is doing on this page: signing in (one
 * step or several), entering a 2-step code (one box, or one box per digit),
 * or choosing a new password. Works with and without <form> elements, since
 * most single-page apps never use one.
 */
import { LOGIN_CONTEXT, SIGNUP_CONTEXT } from "./patterns";
import { strongIdentifier } from "./classify";
import { allInputs, classOf, describe, isVisible } from "./fields";
import type { FieldKind } from "../shared/messages";

export interface LoginContext {
  scope: Element;
  username: HTMLInputElement | null;
  password: HTMLInputElement | null;
  newPasswords: HTMLInputElement[];
}

/** The nearest container that holds the field's companions: its form, or an ancestor with other inputs. */
export function scopeOf(el: HTMLInputElement): Element {
  if (el.form) return el.form;
  let node: Element | null = el.parentElement;
  for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
    if (node.querySelectorAll("input:not([type=hidden])").length > 1 && node.querySelector("button, [type=submit], [role=button]")) return node;
  }
  return el.getRootNode() instanceof ShadowRoot ? (el.getRootNode() as ShadowRoot).host.parentElement ?? el.ownerDocument.body : el.ownerDocument.body;
}

/** Does `scope` contain `node`, looking through shadow-root boundaries? */
function composedContains(scope: Element, node: Node): boolean {
  for (let n: Node | null = node; n; n = n.parentNode ?? (n instanceof ShadowRoot ? n.host : null)) if (n === scope) return true;
  return false;
}

/** Visible inputs inside a scope, shadow roots included only when the page has any. */
function visibleIn(scope: Element): HTMLInputElement[] {
  const list = Array.from(scope.querySelectorAll("input"));
  for (const i of allInputs(scope.ownerDocument)) if (i.getRootNode() instanceof ShadowRoot && composedContains(scope, i)) list.push(i);
  return list.filter(isVisible);
}

const before = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/** Words on and around the form that say "sign in" - for username-only first steps. */
function looksLikeSignIn(scope: Element): boolean {
  const doc = scope.ownerDocument;
  const form = scope instanceof HTMLFormElement ? `${scope.action} ${scope.id} ${scope.name} ${scope.className}` : "";
  const heading = doc.querySelector("h1, h2")?.textContent ?? "";
  const buttons = Array.from(scope.querySelectorAll("button, [type=submit], [role=button]")).map((b) => b.textContent ?? (b as HTMLInputElement).value ?? "").join(" ");
  const text = `${form} ${heading} ${buttons} ${doc.title} ${doc.location.pathname}`.slice(0, 2000);
  return LOGIN_CONTEXT.test(text) && !SIGNUP_CONTEXT.test(`${heading} ${doc.location.pathname}`);
}

/** The sign-in (or sign-up) fields that belong with this one. */
export function loginContextFor(el: HTMLInputElement): LoginContext | null {
  const cls = classOf(el);
  if (cls !== "username" && cls !== "password" && cls !== "newPassword") return null;
  const scope = scopeOf(el);
  const fields = visibleIn(scope);
  const passwords = fields.filter((f) => classOf(f) === "password");
  const newPasswords = fields.filter((f) => classOf(f) === "newPassword");
  const anchor = passwords[0] ?? newPasswords[0] ?? null;
  let username: HTMLInputElement | null = null;
  const textual = fields.filter((f) => f !== anchor && ["text", "email", "tel", ""].includes(f.type) && classOf(f) !== "otp" && classOf(f) !== "otpDigit");
  if (anchor) {
    // The identifier is the last plausible text field before the password.
    const preceding = textual.filter((f) => before(f, anchor));
    username = preceding.reverse().find((f) => classOf(f) === "username") ?? preceding[0] ?? null;
  } else if (cls === "username" && (strongIdentifier(describe(el)) || looksLikeSignIn(scope))) {
    username = el; // first step of a two-step sign-in
  }
  if (!anchor && !username) return null;
  // With two or more password fields and no "new" words, a sign-up form's second one is the confirmation.
  if (passwords.length >= 2 && newPasswords.length === 0 && SIGNUP_CONTEXT.test(`${scope.textContent ?? ""}`.slice(0, 3000))) {
    return { scope, username, password: null, newPasswords: passwords };
  }
  return { scope, username, password: passwords[0] ?? null, newPasswords };
}

/** A 2-step code field: one input, or a row of one-digit boxes (returned in order). */
export function otpTargetFor(el: HTMLInputElement): HTMLInputElement[] | null {
  const cls = classOf(el);
  if (cls === "otp") return [el];
  if (cls !== "otpDigit" && !(el.maxLength === 1 && isVisible(el))) return null;
  // Siblings sharing a nearby container, all single-character.
  for (let node = el.parentElement, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
    const boxes = Array.from(node.querySelectorAll("input")).filter((i) => i.maxLength === 1 && isVisible(i) && i.type !== "checkbox" && i.type !== "radio");
    if (boxes.length >= 4 && boxes.length <= 8) return boxes;
  }
  return cls === "otpDigit" ? [el] : null;
}

/** What kind of filling this field invites, if any. */
export function kindOf(el: HTMLInputElement): FieldKind | null {
  if (otpTargetFor(el)) return "otp";
  const ctx = loginContextFor(el);
  if (!ctx) return null;
  if (ctx.newPasswords.includes(el)) return "new";
  return "login";
}

/** Every kind present on the page right now (reported to the worker so the shortcut knows where to look). */
export function kindsOnPage(doc: Document = document): FieldKind[] {
  const kinds = new Set<FieldKind>();
  let looked = 0;
  for (const i of allInputs(doc)) {
    if (kinds.size === 3 || looked > 40) break;
    const c = classOf(i);
    if (!c || !isVisible(i)) continue;
    looked++;
    const k = kindOf(i);
    if (k) kinds.add(k);
  }
  return [...kinds];
}

/** The field to act on when nothing useful is focused: the first visible code box, password or identifier. */
export function primaryField(doc: Document = document): HTMLInputElement | null {
  const visible = allInputs(doc).filter((i) => classOf(i) && isVisible(i));
  return visible.find((i) => classOf(i) === "otp" || classOf(i) === "otpDigit")
    ?? visible.find((i) => classOf(i) === "password")
    ?? visible.find((i) => kindOf(i) === "login")
    ?? null;
}
