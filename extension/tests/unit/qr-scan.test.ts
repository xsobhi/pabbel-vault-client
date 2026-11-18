import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { scanQrCodes, type Pixels } from "../../src/shared/qr-scan";
import { interpretQr } from "../../src/shared/otp-qr";
import { base32Decode } from "@vault/crypto/totp";

const SECRET = "JBSWY3DPEHPK3PXP";
const URI = `otpauth://totp/Example:ada@example.com?secret=${SECRET}&issuer=Example`;

/** A white page with QR codes drawn at (x, y) with `scale` pixels per module: the picture a screenshot would give us. */
function page(codes: { text: string; x: number; y: number }[], w = 700, h = 400, scale = 4, invert = false): Pixels {
  const data = new Uint8ClampedArray(w * h * 4).fill(invert ? 0 : 255);
  for (const c of codes) {
    const qr = QRCode.create(c.text, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    for (let my = 0; my < n; my++) for (let mx = 0; mx < n; mx++) {
      const dark = qr.modules.get(my, mx) === 1;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const i = ((c.y + my * scale + dy) * w + c.x + mx * scale + dx) * 4;
        data.fill(dark !== invert ? 0 : 255, i, i + 3); data[i + 3] = 255;
      }
    }
  }
  return { data, width: w, height: h };
}

// Google Authenticator export: MigrationPayload with two accounts (secret bytes, name, issuer, SHA1, 6 digits, TOTP).
function migration(): string {
  const field = (n: number, wire: number, body: number[]) => [(n << 3) | wire, ...body];
  const str = (n: number, s: string) => field(n, 2, [s.length, ...Buffer.from(s)]);
  const otp = (name: string, issuer: string, secret: number[]) => [...field(1, 2, [secret.length, ...secret]), ...str(2, name), ...str(3, issuer), ...field(4, 0, [1]), ...field(5, 0, [1]), ...field(6, 0, [2])];
  const acct = (...a: [string, string, number[]]) => { const b = otp(...a); return field(1, 2, [b.length, ...b]); };
  const bytes = [...acct("ada@a.com", "Alpha", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), ...acct("bob@b.com", "Beta", [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]), ...field(3, 0, [1]), ...field(4, 0, [0])];
  return `otpauth-migration://offline?data=${encodeURIComponent(Buffer.from(bytes).toString("base64"))}`;
}

describe("scanQrCodes", () => {
  it("reads one code and leaves the caller's pixels alone", () => {
    const img = page([{ text: URI, x: 40, y: 40 }]);
    const before = img.data.slice();
    expect(scanQrCodes(img)).toEqual([URI]);
    expect(img.data).toEqual(before);
  });
  it("finds both codes in one image", () => {
    const other = `otpauth://totp/Other:bob?secret=${SECRET}&issuer=Other`;
    expect(scanQrCodes(page([{ text: URI, x: 20, y: 20 }, { text: other, x: 380, y: 150 }])).sort()).toEqual([URI, other].sort());
  });
  it("reads a light-on-dark code", () => expect(scanQrCodes(page([{ text: URI, x: 40, y: 40 }], 700, 400, 4, true))).toEqual([URI]));
  it("finds nothing in a blank image", () => expect(scanQrCodes(page([]))).toEqual([]));
});

describe("interpretQr", () => {
  it("accepts an otpauth link", () => {
    const out = interpretQr([URI]);
    expect(out).toMatchObject({ ok: true, accounts: [{ secret: SECRET, issuer: "Example", account: "ada@example.com", digits: 6, period: 30 }] });
  });
  it("keeps non-default settings", () => {
    const out = interpretQr([`otpauth://totp/X:y?secret=${SECRET}&digits=8&period=60&algorithm=SHA256`]);
    expect(out).toMatchObject({ ok: true, accounts: [{ digits: 8, period: 60, algorithm: "SHA256" }] });
  });
  it("lists every account of a migration code, decoded from a scanned image", () => {
    const out = interpretQr(scanQrCodes(page([{ text: migration(), x: 30, y: 30 }], 600, 600, 3)));
    expect(out.ok && out.accounts.map((a) => [a.issuer, a.account])).toEqual([["Alpha", "ada@a.com"], ["Beta", "bob@b.com"]]);
    if (out.ok) expect(base32Decode(out.accounts[0].secret)).toEqual(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  });
  it("rejects a QR that is not a 2-step code", () => {
    expect(interpretQr(scanQrCodes(page([{ text: "https://example.com/hello", x: 40, y: 40 }])))).toEqual({ ok: false, reason: "notOtp" });
    expect(interpretQr(["otpauth://hotp/X?secret=" + SECRET])).toEqual({ ok: false, reason: "notOtp" });
  });
  it("says none when nothing decoded", () => expect(interpretQr([])).toEqual({ ok: false, reason: "none" }));
});
