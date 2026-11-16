/**
 * Putting values into fields so that the page's own code notices.
 *
 * React, Vue and friends keep their own copy of an input's value and only
 * update it from events. Setting `.value` through the native setter (not the
 * framework's instance override) and then dispatching input + change is what
 * makes a controlled input accept the new value - the same sequence a person
 * typing produces, minus the keystrokes. Only visible fields are ever filled.
 */
import { classOf, isVisible } from "./fields";
import { loginContextFor, otpTargetFor, primaryField } from "./forms";

const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

export function setValue(el: HTMLInputElement, value: string): void {
  el.focus({ preventScroll: true });
  if (nativeSetter) nativeSetter.call(el, value); else el.value = value;
  el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertReplacementText", data: value }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Fill a sign-in: whatever step is showing (identifier, password, or both). Says which of the two went in. */
export function fillLogin(from: HTMLInputElement | null, username?: string, password?: string): { username: boolean; password: boolean } {
  const start = from && loginContextFor(from) ? from : primaryField();
  const ctx = start ? loginContextFor(start) : null;
  const placed = { username: false, password: false };
  if (!ctx) return placed;
  if (username && ctx.username && isVisible(ctx.username)) {
    if (ctx.username.value !== username) setValue(ctx.username, username);
    placed.username = true;
  }
  const pw = ctx.password ?? (ctx.newPasswords.length === 1 && from === ctx.newPasswords[0] ? ctx.newPasswords[0] : null);
  if (password && pw && isVisible(pw)) {
    setValue(pw, password);
    placed.password = true;
  }
  return placed;
}

/** A code into one field, or one digit per box. */
export function fillCode(from: HTMLInputElement | null, code: string): boolean {
  const start = from && otpTargetFor(from) ? from : primaryField();
  const boxes = start ? otpTargetFor(start) : null;
  if (!boxes?.length) return false;
  if (boxes.length === 1) {
    if (!isVisible(boxes[0])) return false;
    setValue(boxes[0], code);
    return true;
  }
  const digits = code.split("");
  boxes.forEach((box, i) => {
    if (digits[i] === undefined || !isVisible(box)) return;
    box.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: digits[i] }));
    setValue(box, digits[i]);
    box.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: digits[i] }));
  });
  return true;
}

/** A generated password into the new-password field(s) around `from`: new + confirm, never the current one. */
export function fillNewPassword(from: HTMLInputElement | null, password: string): boolean {
  const ctx = from ? loginContextFor(from) : null;
  const targets = ctx?.newPasswords.length ? ctx.newPasswords : from && classOf(from) ? [from] : [];
  let filled = false;
  for (const el of targets) if (isVisible(el)) { setValue(el, password); filled = true; }
  return filled;
}

/** What the worker's probe needs: which kind of field to fill here, and the username already typed. */
export function probe(from: HTMLInputElement | null): { kind: "login" | "otp" | "new" | "none"; username?: string } {
  const start = from && (otpTargetFor(from) || loginContextFor(from)) ? from : primaryField();
  if (!start) return { kind: "none" };
  if (otpTargetFor(start)) return { kind: "otp" };
  const ctx = loginContextFor(start);
  if (!ctx) return { kind: "none" };
  if (ctx.newPasswords.includes(start)) return { kind: "new", username: ctx.username?.value };
  return { kind: "login", username: ctx.username?.value || undefined };
}
