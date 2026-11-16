import { describe, expect, it } from "vitest";
import { base32Decode } from "./totp";
import { isMigrationUri, parseMigrationUri } from "./gauth-migration";

// Every secret here is invented for the test. Building the payload rather than
// pasting a captured one is the point: a real export QR is a set of live 2FA
// seeds, and those do not belong in a repository.

const varint = (n: number): number[] => {
  const out: number[] = [];
  let v = n;
  do { let b = v & 0x7f; v = Math.floor(v / 128); if (v) b |= 0x80; out.push(b); } while (v);
  return out;
};
const tag = (field: number, wire: number) => varint((field << 3) | wire);
const bytesField = (field: number, value: Uint8Array) => [...tag(field, 2), ...varint(value.length), ...value];
const strField = (field: number, value: string) => bytesField(field, new TextEncoder().encode(value));
const intField = (field: number, value: number) => [...tag(field, 0), ...varint(value)];

interface Otp { secret: Uint8Array; name: string; issuer?: string; algorithm?: number; digits?: number; type?: number }

function migrationUri(otps: Otp[], batch?: { size: number; index: number; id: number }): string {
  const body: number[] = [];
  for (const o of otps) {
    const p = [
      ...bytesField(1, o.secret),
      ...strField(2, o.name),
      ...(o.issuer ? strField(3, o.issuer) : []),
      ...(o.algorithm !== undefined ? intField(4, o.algorithm) : []),
      ...(o.digits !== undefined ? intField(5, o.digits) : []),
      ...(o.type !== undefined ? intField(6, o.type) : []),
    ];
    body.push(...tag(1, 2), ...varint(p.length), ...p);
  }
  body.push(...intField(2, 1));
  if (batch) body.push(...intField(3, batch.size), ...intField(4, batch.index), ...intField(5, batch.id));
  const b64 = Buffer.from(Uint8Array.from(body)).toString("base64");
  return `otpauth-migration://offline?data=${encodeURIComponent(b64)}`;
}

const SECRET = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]);

describe("google authenticator export", () => {
  it("recognises the scheme", () => {
    expect(isMigrationUri("otpauth-migration://offline?data=AAA")).toBe(true);
    expect(isMigrationUri("otpauth://totp/x?secret=JBSWY3DP")).toBe(false);
  });

  it("reads accounts, and the secret survives as base32", () => {
    const uri = migrationUri([{ secret: SECRET, name: "ada@example.com", issuer: "Pabbel", type: 2 }]);
    const out = parseMigrationUri(uri);
    expect(out.accounts).toHaveLength(1);
    const a = out.accounts[0];
    expect(a.issuer).toBe("Pabbel");
    expect(a.account).toBe("ada@example.com");
    expect(a.digits).toBe(6);
    expect(a.period).toBe(30);
    expect(a.algorithm).toBe("SHA1");
    // The round trip is what matters: base32 of the raw bytes must decode back.
    expect([...base32Decode(a.secret)]).toEqual([...SECRET]);
  });

  it("carries the batch header, so a split export can be reassembled", () => {
    const out = parseMigrationUri(migrationUri([{ secret: SECRET, name: "a", type: 2 }], { size: 3, index: 1, id: 42 }));
    expect(out.batchSize).toBe(3);
    expect(out.batchIndex).toBe(1);
    expect(out.batchId).toBe(42);
  });

  it("maps algorithms and 8-digit codes", () => {
    const out = parseMigrationUri(migrationUri([
      { secret: SECRET, name: "sha256", algorithm: 2, digits: 2, type: 2 },
      { secret: SECRET, name: "sha512", algorithm: 3, type: 2 },
    ]));
    expect(out.accounts[0].algorithm).toBe("SHA256");
    expect(out.accounts[0].digits).toBe(8);
    expect(out.accounts[1].algorithm).toBe("SHA512");
  });

  it("skips what it cannot store, by name, instead of dropping it", () => {
    const out = parseMigrationUri(migrationUri([
      { secret: SECRET, name: "counter-based", issuer: "Bank", type: 1 },
      { secret: SECRET, name: "md5", algorithm: 4, type: 2 },
      { secret: new Uint8Array(), name: "empty", type: 2 },
      { secret: SECRET, name: "good", type: 2 },
    ]));
    expect(out.accounts).toHaveLength(1);
    expect(out.skipped).toHaveLength(3);
    expect(out.skipped[0].name).toContain("Bank");
    expect(out.skipped[0].reason).toMatch(/HOTP/);
    expect(out.skipped.map((s) => s.reason).join(" ")).toMatch(/MD5/);
  });

  it("refuses things that are not an export", () => {
    expect(() => parseMigrationUri("otpauth://totp/x?secret=JBSWY3DP")).toThrow(/not a google/i);
    expect(() => parseMigrationUri("otpauth-migration://offline")).toThrow(/no data/i);
    expect(() => parseMigrationUri("otpauth-migration://offline?data=%%%")).toThrow(/could not be decoded|damaged/i);
  });
});
