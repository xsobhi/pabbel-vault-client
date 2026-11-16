import { base32Encode } from "./totp";
import type { ParsedOtpauth, TotpAlgorithm } from "./totp";

/**
 * Google Authenticator's "Transfer accounts" export.
 *
 * The QR it shows is not an otpauth:// URI - it is
 * `otpauth-migration://offline?data=<base64 protobuf>` carrying every exported
 * account at once, with the secrets as raw bytes rather than base32.
 *
 * A big export is split across SEVERAL QR codes, each one a batch that names
 * its index and how many there are. That is why this returns the batch header
 * rather than just the accounts: an importer that ignored it would silently
 * bring in a third of someone's accounts and look like it had succeeded.
 *
 * The protobuf is read by hand. It is five fields of a fixed, published schema,
 * and a parser for it is smaller than the dependency that would replace it -
 * which matters more than usual here, because this runs inside the vault's
 * trusted path, on plaintext secrets, in the browser.
 *
 *   message MigrationPayload {
 *     repeated OtpParameters otp_parameters = 1;
 *     int32 version = 2; int32 batch_size = 3;
 *     int32 batch_index = 4; int32 batch_id = 5;
 *     message OtpParameters {
 *       bytes secret = 1; string name = 2; string issuer = 3;
 *       Algorithm algorithm = 4; DigitCount digits = 5;
 *       OtpType type = 6; int64 counter = 7;
 *     }
 *   }
 */

export interface MigrationBatch {
  /** 0-based position of this QR within the export. */
  batchIndex: number;
  /** How many QR codes the whole export was split into. */
  batchSize: number;
  /** Ties the parts of one export together; parts of different exports must not be mixed. */
  batchId: number;
  accounts: ParsedOtpauth[];
  /** Entries we could read but cannot store, with the reason, so none vanish quietly. */
  skipped: { name: string; reason: string }[];
}

const ALGORITHMS: Record<number, TotpAlgorithm | "MD5"> = { 0: "SHA1", 1: "SHA1", 2: "SHA256", 3: "SHA512", 4: "MD5" };
const OTP_TOTP = 2;

interface Reader { view: DataView; bytes: Uint8Array; pos: number }

function varint(r: Reader): number {
  let result = 0, shift = 0;
  for (;;) {
    if (r.pos >= r.bytes.length) throw new Error("truncated");
    const b = r.bytes[r.pos++];
    result += (b & 0x7f) * 2 ** shift;
    if ((b & 0x80) === 0) return result;
    shift += 7;
    if (shift > 63) throw new Error("varint too long");
  }
}

function lengthDelimited(r: Reader): Uint8Array {
  const len = varint(r);
  if (r.pos + len > r.bytes.length) throw new Error("truncated");
  const out = r.bytes.subarray(r.pos, r.pos + len);
  r.pos += len;
  return out;
}

/** Skip a field we do not use, whatever its wire type. */
function skip(r: Reader, wire: number): void {
  if (wire === 0) varint(r);
  else if (wire === 1) r.pos += 8;
  else if (wire === 2) lengthDelimited(r);
  else if (wire === 5) r.pos += 4;
  else throw new Error(`unsupported wire type ${wire}`);
}

function reader(bytes: Uint8Array): Reader {
  return { view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), bytes, pos: 0 };
}

interface RawOtp { secret?: Uint8Array; name?: string; issuer?: string; algorithm?: number; digits?: number; type?: number }

function readOtpParameters(bytes: Uint8Array): RawOtp {
  const r = reader(bytes);
  const out: RawOtp = {};
  const text = new TextDecoder();
  while (r.pos < r.bytes.length) {
    const tag = varint(r);
    const field = tag >>> 3, wire = tag & 7;
    if (field === 1 && wire === 2) out.secret = lengthDelimited(r);
    else if (field === 2 && wire === 2) out.name = text.decode(lengthDelimited(r));
    else if (field === 3 && wire === 2) out.issuer = text.decode(lengthDelimited(r));
    else if (field === 4 && wire === 0) out.algorithm = varint(r);
    else if (field === 5 && wire === 0) out.digits = varint(r);
    else if (field === 6 && wire === 0) out.type = varint(r);
    else skip(r, wire);
  }
  return out;
}

/** Decode one exported QR. Throws with a readable reason when it is not one. */
export function parseMigrationUri(uri: string): MigrationBatch {
  const trimmed = uri.trim();
  if (!/^otpauth-migration:\/\//i.test(trimmed)) throw new Error("Not a Google Authenticator export code.");

  let data: string | null = null;
  try { data = new URL(trimmed).searchParams.get("data"); } catch { /* fall through */ }
  if (!data) throw new Error("That export code carries no data.");

  let raw: Uint8Array;
  try {
    // The QR encodes standard base64, url-escaped inside the query string.
    const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    raw = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    throw new Error("That export code could not be decoded.");
  }

  const r = reader(raw);
  const batch: MigrationBatch = { batchIndex: 0, batchSize: 1, batchId: 0, accounts: [], skipped: [] };
  const parts: Uint8Array[] = [];
  try {
    while (r.pos < r.bytes.length) {
      const tag = varint(r);
      const field = tag >>> 3, wire = tag & 7;
      if (field === 1 && wire === 2) parts.push(lengthDelimited(r));
      else if (field === 3 && wire === 0) batch.batchSize = varint(r);
      else if (field === 4 && wire === 0) batch.batchIndex = varint(r);
      else if (field === 5 && wire === 0) batch.batchId = varint(r);
      else skip(r, wire);
    }
  } catch {
    throw new Error("That export code is damaged or incomplete.");
  }

  for (const part of parts) {
    let p: RawOtp;
    try { p = readOtpParameters(part); } catch { batch.skipped.push({ name: "(unreadable entry)", reason: "could not be read" }); continue; }
    const name = [p.issuer, p.name].filter(Boolean).join(" · ") || p.name || "Unnamed";
    if (!p.secret?.length) { batch.skipped.push({ name, reason: "no secret" }); continue; }
    if (p.type !== undefined && p.type !== OTP_TOTP) { batch.skipped.push({ name, reason: "counter-based (HOTP), not time-based" }); continue; }
    const alg = ALGORITHMS[p.algorithm ?? 0] ?? "SHA1";
    if (alg === "MD5") { batch.skipped.push({ name, reason: "uses MD5, which this vault does not support" }); continue; }
    batch.accounts.push({
      secret: base32Encode(p.secret),
      issuer: p.issuer || undefined,
      account: p.name || undefined,
      algorithm: alg,
      digits: p.digits === 2 ? 8 : 6,
      // The export carries no period: Google Authenticator is always 30s.
      period: 30,
    });
  }
  return batch;
}

/** True for a string that is a Google Authenticator export rather than a single otpauth URI. */
export const isMigrationUri = (s: string): boolean => /^otpauth-migration:\/\//i.test(s.trim());
