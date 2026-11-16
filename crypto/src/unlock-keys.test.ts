/**
 * HKDF, the trusted-browser wrap and the recovery key: every wrap opens with
 * exactly the right inputs and with nothing else, and the bytes match an
 * independent implementation (Node's OpenSSL) so Android can be checked
 * against the same vectors.
 */
import { createDecipheriv, hkdfSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt } from "./aead";
import { b64, hex, unb64 } from "./bytes";
import { hkdf } from "./hkdf";
import { DEVICE_INFO, deviceAad, newDeviceSecret, unwrapForDevice, wrapForDevice } from "./device";
import { formatRecoveryKey, lastGroup, newRecoveryKey, openWithRecoveryKey, parseRecoveryKey, RECOVERY_INFO, recoveryFields, recoveryKeyFrom } from "./recovery";
import { deriveMasterKey, makeMkCheck, verifyMkCheck } from "./kdf";

const fromHex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));
const fill = (n: number, v: number) => new Uint8Array(n).fill(v);
const params = { salt: b64(fill(16, 7)), iterations: 1000 }; // low count: tests, not security
const mkOf = (pw: string) => deriveMasterKey(pw, params, true);
const rawOf = async (k: CryptoKey) => new Uint8Array(await crypto.subtle.exportKey("raw", k));

/** Open an 0x01 envelope with OpenSSL, given the raw key. */
function opensslOpen(key: Uint8Array, blob: string, aad: string): Uint8Array {
  const b = Buffer.from(unb64(blob));
  const d = createDecipheriv("aes-256-gcm", key, b.subarray(1, 13));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(b.subarray(b.length - 16));
  return new Uint8Array(Buffer.concat([d.update(b.subarray(13, b.length - 16)), d.final()]));
}

describe("HKDF-SHA256", () => {
  it("matches RFC 5869 test case 1", async () => {
    const okm = await hkdf(fill(22, 0x0b), fromHex("f0f1f2f3f4f5f6f7f8f9"), 42, fromHex("000102030405060708090a0b0c"));
    expect(hex(okm)).toBe("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
  });
  it("matches RFC 5869 test case 3 (empty salt and info, as our keys use)", async () => {
    expect(hex(await hkdf(fill(22, 0x0b), new Uint8Array(0), 42))).toBe("8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8");
  });
  it("pins the two new purposes, so another platform can check itself", async () => {
    const w = await hkdf(new Uint8Array([...fill(32, 1), ...fill(32, 2)]), DEVICE_INFO);
    expect(hex(w)).toBe("604fd88eb6cb906336c57c1f7ab92659bc76b5bbe1aac75531d7f45f87292a95");
    expect(hex(await hkdf(fill(32, 3), RECOVERY_INFO))).toBe("b41882ce44947a70078c2b6b5f1214a8a77a9a017ea61cdaea6c1655dd963203");
  });
});

describe("trusted browser: enc(HKDF(D || S), MK, device:<id>)", () => {
  it("opens with this browser's D, the server's S and this device id - and OpenSSL agrees on the bytes", async () => {
    const mk = await mkOf("pw");
    const d = newDeviceSecret(), s = newDeviceSecret();
    const blob = await wrapForDevice(mk, d, s, "dev-1");
    expect(unb64(blob)[0]).toBe(1);
    const back = await unwrapForDevice(blob, d, s, "dev-1");
    expect(hex(await rawOf(back))).toBe(hex(await rawOf(mk)));
    expect(await verifyMkCheck(back, await makeMkCheck(mk))).toBe(true);
    const w = new Uint8Array(hkdfSync("sha256", Buffer.concat([d, s]), Buffer.alloc(0), Buffer.from(DEVICE_INFO), 32));
    expect(hex(opensslOpen(w, blob, deviceAad("dev-1")))).toBe(hex(await rawOf(mk)));
  });

  it("the browser's half alone, the server's half alone, or the wrong pairing opens nothing", async () => {
    const mk = await mkOf("pw");
    const d = newDeviceSecret(), s = newDeviceSecret(), other = newDeviceSecret();
    const blob = await wrapForDevice(mk, d, s, "dev-1");
    await expect(unwrapForDevice(blob, d, other, "dev-1")).rejects.toThrow();
    await expect(unwrapForDevice(blob, other, s, "dev-1")).rejects.toThrow();
    await expect(unwrapForDevice(blob, s, d, "dev-1")).rejects.toThrow(); // order matters: D || S
    await expect(unwrapForDevice(blob, d, s, "dev-2")).rejects.toThrow(); // bound to its row
  });

  it("refuses short secrets and a tampered blob", async () => {
    const mk = await mkOf("pw");
    const d = newDeviceSecret(), s = newDeviceSecret();
    await expect(wrapForDevice(mk, d.subarray(0, 16), s, "x")).rejects.toThrow(/32 bytes/);
    const bytes = unb64(await wrapForDevice(mk, d, s, "x"));
    bytes[20] ^= 1;
    await expect(unwrapForDevice(b64(bytes), d, s, "x")).rejects.toThrow();
  });
});

describe("recovery key", () => {
  it("is shown as 13 groups of four base32 characters and read back exactly", () => {
    const rk = newRecoveryKey();
    const shown = formatRecoveryKey(rk);
    expect(shown).toMatch(/^([A-Z2-7]{4} ){12}[A-Z2-7]{4}$/);
    expect(hex(parseRecoveryKey(shown)!)).toBe(hex(rk));
    expect(lastGroup(rk)).toBe(shown.slice(-4));
  });

  it("forgives case, dashes, missing spaces and look-alike digits", () => {
    const rk = fill(32, 0xff);
    const shown = formatRecoveryKey(rk);
    expect(shown).toBe("7777 7777 7777 7777 7777 7777 7777 7777 7777 7777 7777 7777 777Q");
    const zeros = formatRecoveryKey(fill(32, 0)); // all "A"
    expect(hex(parseRecoveryKey(zeros.toLowerCase().replace(/ /g, "-"))!)).toBe(hex(fill(32, 0)));
    const ib = formatRecoveryKey(fromHex("4" + "0".repeat(63))); // starts "I" ... then "A"s
    expect(ib.startsWith("I")).toBe(true);
    expect(hex(parseRecoveryKey("1" + ib.slice(1))!)).toBe(hex(fromHex("4" + "0".repeat(63))));
    expect(hex(parseRecoveryKey(shown.replace(/ /g, ""))!)).toBe(hex(rk));
  });

  it("rejects anything that cannot be one of ours", () => {
    const shown = formatRecoveryKey(newRecoveryKey());
    expect(parseRecoveryKey(shown.slice(0, -1))).toBeNull(); // a character short
    expect(parseRecoveryKey(shown + "A")).toBeNull(); // one too many
    expect(parseRecoveryKey(shown.slice(0, -1) + "B")).toBeNull(); // "B" sets padding bits no key of ours has
    expect(parseRecoveryKey(shown.replace(/^./, "!"))).toBeNull();
    expect(parseRecoveryKey("")).toBeNull();
  });

  it("the right key opens the master key; a wrong one does not", async () => {
    const mk = await mkOf("old password");
    const rk = newRecoveryKey();
    const f = await recoveryFields(mk, rk);
    const back = await openWithRecoveryKey(f.wrap, rk);
    expect(hex(await rawOf(back))).toBe(hex(await rawOf(mk)));
    await expect(openWithRecoveryKey(f.wrap, newRecoveryKey())).rejects.toThrow();
    const typo = rk.slice(); typo[31] ^= 0x80;
    await expect(openWithRecoveryKey(f.wrap, typo)).rejects.toThrow();
  });

  it("matches OpenSSL: wrap under HKDF(RK, recovery-v1), keyEnc under MK", async () => {
    const mk = await mkOf("pw");
    const rk = newRecoveryKey();
    const f = await recoveryFields(mk, rk);
    const k = new Uint8Array(hkdfSync("sha256", rk, Buffer.alloc(0), Buffer.from(RECOVERY_INFO), 32));
    expect(hex(opensslOpen(k, f.wrap, "recovery-wrap"))).toBe(hex(await rawOf(mk)));
    expect(hex(opensslOpen(await rawOf(mk), f.keyEnc, "recovery-key"))).toBe(hex(rk));
  });

  it("an unlocked client gets RK back from keyEnc and re-wraps it for a new password; the old wrap dies with the old MK", async () => {
    const oldMk = await mkOf("old"), newMk = await mkOf("new");
    const rk = newRecoveryKey();
    const before = await recoveryFields(oldMk, rk);
    const again = await recoveryKeyFrom(oldMk, before.keyEnc);
    expect(hex(again)).toBe(hex(rk));
    const after = await recoveryFields(newMk, again);
    expect(hex(await rawOf(await openWithRecoveryKey(after.wrap, rk)))).toBe(hex(await rawOf(newMk)));
    await expect(recoveryKeyFrom(newMk, before.keyEnc)).rejects.toThrow();
    expect(hex(await rawOf(await openWithRecoveryKey(before.wrap, rk)))).not.toBe(hex(await rawOf(newMk)));
  });

  it("the two blobs cannot stand in for each other (different AAD)", async () => {
    const mk = await mkOf("pw");
    const rk = newRecoveryKey();
    const f = await recoveryFields(mk, rk);
    await expect(recoveryKeyFrom(mk, f.wrap)).rejects.toThrow();
    await expect(decrypt(mk, f.keyEnc, "recovery-wrap")).rejects.toThrow();
  });
});
