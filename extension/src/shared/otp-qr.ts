import { parseOtpauth, type ParsedOtpauth } from "@vault/crypto/totp";
import { isMigrationUri, parseMigrationUri } from "@vault/crypto/gauth-migration";

/** What the decoded QR texts mean for the 2-step form: accounts to offer, or why there are none. */
export type QrOutcome = { ok: true; accounts: ParsedOtpauth[] } | { ok: false; reason: "none" | "notOtp" };

export function interpretQr(texts: string[]): QrOutcome {
  if (!texts.length) return { ok: false, reason: "none" };
  const accounts: ParsedOtpauth[] = [];
  for (const text of texts) {
    try {
      if (isMigrationUri(text)) accounts.push(...parseMigrationUri(text).accounts);
      else { const p = parseOtpauth(text); if (p) accounts.push(p); }
    } catch { /* a damaged export is just "not a code" here */ }
  }
  return accounts.length ? { ok: true, accounts } : { ok: false, reason: "notOtp" };
}

export const isDefaultParams = (p: ParsedOtpauth): boolean => (p.algorithm ?? "SHA1") === "SHA1" && (p.digits ?? 6) === 6 && (p.period ?? 30) === 30;
