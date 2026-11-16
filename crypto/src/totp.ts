/**
 * RFC 4226 / 6238 one-time codes, computed on the device from the decrypted
 * secret. Nothing here talks to the network.
 */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const out: number[] = [];
  let bits = 0, value = 0;
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}

export function base32Encode(bytes: Uint8Array): string {
  let out = "", bits = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";
export interface TotpParams { secret: string; algorithm?: TotpAlgorithm; digits?: number; period?: number }

const HASH: Record<TotpAlgorithm, string> = { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" };

export async function hotp(secretB32: string, counter: number, algorithm: TotpAlgorithm = "SHA1", digits = 6): Promise<string> {
  const key = await crypto.subtle.importKey("raw", base32Decode(secretB32) as BufferSource, { name: "HMAC", hash: HASH[algorithm] }, false, ["sign"]);
  const msg = new Uint8Array(8);
  new DataView(msg.buffer).setBigUint64(0, BigInt(counter));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg as BufferSource));
  const offset = mac[mac.length - 1] & 0x0f;
  const code = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export function totpCounter(period = 30, now = Date.now()): number {
  return Math.floor(now / 1000 / period);
}

export async function totp(p: TotpParams, now = Date.now()): Promise<{ code: string; secondsLeft: number; period: number }> {
  const period = p.period ?? 30;
  const code = await hotp(p.secret, totpCounter(period, now), p.algorithm ?? "SHA1", p.digits ?? 6);
  return { code, secondsLeft: period - (Math.floor(now / 1000) % period), period };
}

export interface ParsedOtpauth extends TotpParams { issuer?: string; account?: string }

/** `otpauth://totp/Issuer:account?secret=…&issuer=…&algorithm=…&digits=…&period=…` */
export function parseOtpauth(uri: string): ParsedOtpauth | null {
  let u: URL;
  try { u = new URL(uri.trim()); } catch { return null; }
  if (u.protocol !== "otpauth:" || u.host.toLowerCase() !== "totp") return null;
  const secret = u.searchParams.get("secret");
  if (!secret || !base32Decode(secret).length) return null;
  const label = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
  const [labelIssuer, account] = label.includes(":") ? label.split(/:(.+)/) : [undefined, label];
  const alg = (u.searchParams.get("algorithm") || "SHA1").toUpperCase().replace("-", "") as TotpAlgorithm;
  return {
    secret: secret.replace(/\s|=/g, "").toUpperCase(),
    issuer: u.searchParams.get("issuer") || labelIssuer || undefined,
    account: account?.trim() || undefined,
    algorithm: (["SHA1", "SHA256", "SHA512"] as const).includes(alg) ? alg : "SHA1",
    digits: Number(u.searchParams.get("digits")) === 8 ? 8 : 6,
    period: Number(u.searchParams.get("period")) || 30,
  };
}

/** Accept either an otpauth URI or a bare base32 secret (with optional spaces). */
export function parseTotpInput(text: string): ParsedOtpauth | null {
  const t = text.trim();
  if (t.toLowerCase().startsWith("otpauth://")) return parseOtpauth(t);
  const secret = t.replace(/\s|=/g, "").toUpperCase();
  if (!/^[A-Z2-7]{8,}$/.test(secret)) return null;
  return { secret, algorithm: "SHA1", digits: 6, period: 30 };
}

export function buildOtpauth(p: ParsedOtpauth): string {
  const label = encodeURIComponent(p.issuer ? `${p.issuer}:${p.account ?? ""}` : p.account ?? "");
  const q = new URLSearchParams({ secret: p.secret, algorithm: p.algorithm ?? "SHA1", digits: String(p.digits ?? 6), period: String(p.period ?? 30) });
  if (p.issuer) q.set("issuer", p.issuer);
  return `otpauth://totp/${label}?${q}`;
}
