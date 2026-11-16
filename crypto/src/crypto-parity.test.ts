/**
 * Independent-implementation parity. Every envelope the library makes is
 * checked against Node's own crypto (OpenSSL), not against itself: PBKDF2
 * bits, the 0x01 AES-GCM blob, the 0x02 ECIES team-key wrap and the RFC 6238
 * TOTP vectors. A blob OpenSSL builds must open here, and one built here must
 * open in OpenSSL - the same property the Android client's parity test relies on.
 */
import { createCipheriv, createECDH, createDecipheriv, hkdfSync, pbkdf2Sync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptString, encryptString, importAesKey } from "./aead";
import { b64, unb64 } from "./bytes";
import { deriveMasterKey, makeMkCheck, verifyMkCheck } from "./kdf";
import { aad, generateAccountKeys, unwrapWithPrivate, wrapToPublic } from "./keys";
import { base32Encode, hotp, totp } from "./totp";

const params = { salt: b64(new Uint8Array(16).fill(7)), iterations: 1000 };

describe("PBKDF2 master key = OpenSSL's", () => {
  it("derives the same 32 bytes (NFKC-normalised password)", async () => {
    const mk = await deriveMasterKey("correct horse ﬁ", params, true);
    const ours = Buffer.from(await crypto.subtle.exportKey("raw", mk));
    const theirs = pbkdf2Sync(Buffer.from("correct horse fi", "utf8"), Buffer.from(unb64(params.salt)), 1000, 32, "sha256");
    expect(ours.toString("hex")).toBe(theirs.toString("hex"));
  });
  it("mk_check tells passwords apart", async () => {
    const check = await makeMkCheck(await deriveMasterKey("a", params));
    expect(await verifyMkCheck(await deriveMasterKey("a", params), check)).toBe(true);
    expect(await verifyMkCheck(await deriveMasterKey("b", params), check)).toBe(false);
  });
});

describe("0x01 envelope = AES-256-GCM(iv 12, tag 16, aad)", () => {
  const raw = randomBytes(32);
  it("opens a blob OpenSSL made", async () => {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", raw, iv);
    c.setAAD(Buffer.from("item:abc"));
    const ct = Buffer.concat([c.update("hello vault", "utf8"), c.final(), c.getAuthTag()]);
    const blob = Buffer.concat([Buffer.from([1]), iv, ct]).toString("base64");
    expect(await decryptString(await importAesKey(raw), blob, "item:abc")).toBe("hello vault");
    await expect(decryptString(await importAesKey(raw), blob, "item:abd")).rejects.toThrow();
  });
  it("makes a blob OpenSSL opens", async () => {
    const bytes = Buffer.from(await encryptString(await importAesKey(raw), "zero knowledge", "vault:v1"), "base64");
    expect(bytes[0]).toBe(1);
    const d = createDecipheriv("aes-256-gcm", raw, bytes.subarray(1, 13));
    d.setAAD(Buffer.from("vault:v1"));
    d.setAuthTag(bytes.subarray(bytes.length - 16));
    expect(Buffer.concat([d.update(bytes.subarray(13, bytes.length - 16)), d.final()]).toString()).toBe("zero knowledge");
  });
});

describe("0x02 ECIES team-key wrap", () => {
  it("unwraps a wrap built by OpenSSL (P-256 ECDH, HKDF-SHA256 'pabbel-vault-wrap-v1')", async () => {
    const me = await generateAccountKeys();
    const vk = randomBytes(32);
    const eph = createECDH("prime256v1"); eph.generateKeys();
    const shared = eph.computeSecret(Buffer.from(unb64(me.publicRaw)));
    const wrapKey = Buffer.from(hkdfSync("sha256", shared, Buffer.alloc(0), Buffer.from("pabbel-vault-wrap-v1"), 32));
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", wrapKey, iv);
    c.setAAD(Buffer.from(aad.memberWrap("v9", 42)));
    const ct = Buffer.concat([c.update(vk), c.final(), c.getAuthTag()]);
    const blob = Buffer.concat([Buffer.from([2]), eph.getPublicKey(), iv, ct]).toString("base64");
    expect(Buffer.from(await unwrapWithPrivate(me.privateKey, blob, aad.memberWrap("v9", 42))).equals(vk)).toBe(true);
    const back = await wrapToPublic(me.publicRaw, vk, "x");
    expect(Buffer.from(await unwrapWithPrivate(me.privateKey, back, "x")).equals(vk)).toBe(true);
  });
});

describe("TOTP, the web suite's RFC 6238 vectors", () => {
  const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));
  it("SHA-1, 8 digits", async () => {
    expect(await hotp(secret, Math.floor(59 / 30), "SHA1", 8)).toBe("94287082");
    expect(await hotp(secret, Math.floor(1111111109 / 30), "SHA1", 8)).toBe("07081804");
    expect(await hotp(secret, Math.floor(1234567890 / 30), "SHA1", 8)).toBe("89005924");
  });
  it("6 digits with time left", async () => {
    expect(await totp({ secret }, 59_000)).toMatchObject({ code: "287082", secondsLeft: 1 });
  });
});
