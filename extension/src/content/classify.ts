/**
 * What kind of field is this? A pure function of what the DOM says about it,
 * so the heuristics can be tested without a browser.
 *
 * Order matters: the site's own autocomplete token wins; then the input type;
 * then the words around the field (patterns.ts). Exclusions (search, postal
 * code, card security code, promo code...) are checked before any keyword, so
 * "zip code" never looks like a 2-step code.
 */
import { EMAIL, EXCLUDE, NEW_PASSWORD, OTP, USERNAME } from "./patterns";

export interface FieldDesc {
  type: string;
  name: string;
  id: string;
  autocomplete: string;
  placeholder: string;
  ariaLabel: string;
  /** Text of the field's <label>, aria-labelledby and title. */
  label: string;
  inputMode: string;
  /** -1 when unset. */
  maxLength: number;
  pattern: string;
  /** Was type=password at some point (a "show password" toggle turned it into text). */
  wasPassword: boolean;
}

export type FieldClass = "username" | "password" | "newPassword" | "otp" | "otpDigit" | null;

const TEXTLIKE = new Set(["", "text", "email", "tel", "number", "url"]);
const NEVER = new Set(["hidden", "submit", "button", "checkbox", "radio", "file", "image", "reset", "range", "color", "date",
  "datetime-local", "month", "week", "time", "search"]);

const haystack = (d: FieldDesc) => [d.name, d.id, d.placeholder, d.ariaLabel, d.label].join(" ").toLowerCase();

const numericHint = (d: FieldDesc) =>
  d.inputMode === "numeric" || d.inputMode === "decimal" || d.type === "tel" || d.type === "number" || /\\d|\[0-9\]/.test(d.pattern);

const codeLength = (d: FieldDesc) => d.maxLength >= 4 && d.maxLength <= 10;

export function classify(d: FieldDesc): FieldClass {
  const type = d.type.toLowerCase();
  if (NEVER.has(type)) return null;
  const ac = d.autocomplete.toLowerCase().split(/\s+/);
  const hay = haystack(d);

  if (ac.includes("one-time-code")) return d.maxLength === 1 ? "otpDigit" : "otp";
  if (ac.includes("new-password")) return "newPassword";
  if (ac.includes("current-password")) return "password";

  if (type === "password" || d.wasPassword) {
    // Some banks and Microsoft use type=password for a short numeric code.
    if (OTP.test(hay) && (codeLength(d) || d.maxLength === 1) && !/pass(word|wort)?/.test(hay)) return d.maxLength === 1 ? "otpDigit" : "otp";
    return NEW_PASSWORD.test(hay) ? "newPassword" : "password";
  }
  if (!TEXTLIKE.has(type)) return null;
  // The site's own autocomplete token outranks any word in the label ("Email address").
  if (ac.includes("username") || ac.includes("email") || ac.includes("webauthn")) return "username";
  if (EXCLUDE.test(hay)) return null;

  if (d.maxLength === 1 && (numericHint(d) || OTP.test(hay))) return "otpDigit";
  if (OTP.test(hay) && !USERNAME_STRONG.test(hay)) return "otp";
  // No words at all, but shaped like a code: short, numeric, autocomplete off.
  if (!hay.trim() && numericHint(d) && codeLength(d) && d.maxLength <= 8) return "otp";
  if (type === "email" || USERNAME.test(hay)) return "username";
  return null;
}

/** A field that says "email"/"user"/"login" outright beats a stray "code"/"id" in the same label. */
const USERNAME_STRONG = /user|e-?mail|login|benutzer|usuario|utilisateur|логин|用户|ユーザー|아이디|المستخدم/i;

/** Is this text field, by its own words, the identifier of a sign-in (not just any email box)? */
export function strongIdentifier(d: FieldDesc): boolean {
  const ac = d.autocomplete.toLowerCase();
  if (/\b(username|webauthn)\b/.test(ac)) return true;
  const hay = haystack(d);
  return /user|login|identifier|signin|sign-in|account|benutzer|usuario|utilisateur|identifiant|логин|用户名|帳號|账号|ユーザー|아이디/i.test(hay);
}

/** Does the field ask for an email address? Only there can an email mask go. */
export function emailish(d: FieldDesc): boolean {
  if (d.type.toLowerCase() === "email") return true;
  const ac = d.autocomplete.toLowerCase().split(/\s+/);
  if (ac.includes("email")) return true;
  if (ac.includes("tel") || ac.includes("one-time-code")) return false;
  return EMAIL.test(haystack(d));
}
