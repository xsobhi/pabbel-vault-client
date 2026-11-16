/**
 * Is this the email box of a SIGN-UP form? That is the one place an email mask
 * is offered: giving a site a fresh address only makes sense while the account
 * is being made.
 *
 * A new-password field with no current one is a sign-up. A form with a
 * CURRENT-password field is a sign-in unless its own submit button says
 * otherwise - and only the submit button counts. A "Create account" link
 * beside "Sign in", or a heading like "Join 2 million readers" over a login,
 * says nothing about what this form does.
 */
import { emailish } from "./classify";
import { describe } from "./fields";
import { loginContextFor } from "./forms";
import { SIGN_IN_ACTION, SIGNUP_CONTEXT } from "./patterns";

// A word must start a word: "join" in "Join now", never in "rejoin" or
// "adjoining". Only in scripts that separate words with spaces - in Chinese,
// Japanese or Thai a word follows another letter directly (立即注册).
const SPACED = "\\p{Script=Latin}\\p{Script=Cyrillic}\\p{Script=Greek}\\p{N}";
const atWordStart = (pattern: RegExp) => new RegExp(`(?<![${SPACED}])(?:${pattern.source})`, "iu");
const SAYS_SIGN_UP = atWordStart(SIGNUP_CONTEXT);
const SAYS_SIGN_IN = atWordStart(SIGN_IN_ACTION);

/** What a form's submit buttons say: every one must say "sign up" and none "sign in". */
export function submitSaysSignUp(labels: string[]): boolean {
  const said = labels.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  return said.length > 0 && said.every((l) => SAYS_SIGN_UP.test(l) && !SAYS_SIGN_IN.test(l));
}

/** The labels of the buttons that submit this form (a form's own submit buttons; otherwise its buttons). */
function submitLabels(scope: Element): string[] {
  const buttons = scope instanceof HTMLFormElement
    ? Array.from(scope.querySelectorAll<HTMLElement>("button:not([type]), button[type=submit], input[type=submit]"))
    : Array.from(scope.querySelectorAll<HTMLElement>("button, [type=submit], [role=button]"));
  return buttons.map((b) => `${b.textContent ?? ""} ${(b as HTMLInputElement).value ?? ""} ${b.getAttribute("aria-label") ?? ""}`.slice(0, 120));
}

export function isSignupEmail(el: HTMLInputElement): boolean {
  if (!emailish(describe(el))) return false;
  const ctx = loginContextFor(el);
  if (!ctx) return false;
  if (ctx.newPasswords.length > 0 && !ctx.password) return true;
  return !!ctx.password && submitSaysSignUp(submitLabels(ctx.scope));
}
