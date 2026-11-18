import { describe, expect, it } from "vitest";
import { decryptString, encryptString, generateAesKeyBytes, importAesKey } from "./aead";
import { b64, unb64 } from "./bytes";
import { deriveMasterKey, makeMkCheck, verifyMkCheck } from "./kdf";
import { aad, generateAccountKeys, unwrapPrivateKey, unwrapWithPrivate, wrapPrivateKey, wrapToPublic } from "./keys";
import { base32Decode, base32Encode, hotp, parseOtpauth, parseTotpInput, totp } from "./totp";

const params = { salt: b64(new Uint8Array(16).fill(7)), iterations: 600_000 }; // the client floor (kdf.ts MIN_KDF_ITERATIONS)

describe("aead", () => {
  it("round-trips and binds the context", async () => {
    const key = await importAesKey(await generateAesKeyBytes());
    const blob = await encryptString(key, "hello vault", "item:1");
    expect(unb64(blob)[0]).toBe(1);
    expect(await decryptString(key, blob, "item:1")).toBe("hello vault");
    await expect(decryptString(key, blob, "item:2")).rejects.toThrow();
  });
});

describe("kdf", () => {
  it("is deterministic for the same password and salt, and the check tells passwords apart", async () => {
    const a = await deriveMasterKey("correct horse", params);
    const check = await makeMkCheck(a);
    expect(await verifyMkCheck(await deriveMasterKey("correct horse", params), check)).toBe(true);
    expect(await verifyMkCheck(await deriveMasterKey("correct horsf", params), check)).toBe(false);
  });
});

describe("keys", () => {
  it("wraps a vault key to a public key that only the private key opens", async () => {
    const alice = await generateAccountKeys();
    const bob = await generateAccountKeys();
    const vk = await generateAesKeyBytes();
    const blob = await wrapToPublic(bob.publicRaw, vk, aad.memberWrap("v1", 2));
    expect(unb64(blob)[0]).toBe(2);
    expect([...(await unwrapWithPrivate(bob.privateKey, blob, aad.memberWrap("v1", 2)))]).toEqual([...vk]);
    await expect(unwrapWithPrivate(alice.privateKey, blob, aad.memberWrap("v1", 2))).rejects.toThrow();
    await expect(unwrapWithPrivate(bob.privateKey, blob, aad.memberWrap("v1", 3))).rejects.toThrow();
  });

  it("stores the private key only under the master key", async () => {
    const mk = await deriveMasterKey("pw", params);
    const keys = await generateAccountKeys();
    const wrapped = await wrapPrivateKey(mk, keys.privateKey);
    const back = await unwrapPrivateKey(mk, wrapped);
    const vk = await generateAesKeyBytes();
    const blob = await wrapToPublic(keys.publicRaw, vk, "x");
    expect([...(await unwrapWithPrivate(back, blob, "x"))]).toEqual([...vk]);
    expect(keys.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("totp", () => {
  const secret = base32Encode(new TextEncoder().encode("12345678901234567890")); // RFC 6238 SHA-1 vector seed
  it("base32 round-trips", () => {
    expect(new TextDecoder().decode(base32Decode(secret))).toBe("12345678901234567890");
    expect(base32Decode("GEZD GNBV").length).toBe(5);
  });
  it("matches the RFC 6238 test vectors (SHA-1, 8 digits)", async () => {
    expect(await hotp(secret, Math.floor(59 / 30), "SHA1", 8)).toBe("94287082");
    expect(await hotp(secret, Math.floor(1111111109 / 30), "SHA1", 8)).toBe("07081804");
    expect(await hotp(secret, Math.floor(1234567890 / 30), "SHA1", 8)).toBe("89005924");
  });
  it("computes a 6-digit code with time left", async () => {
    const r = await totp({ secret }, 59_000);
    expect(r.code).toBe("287082");
    expect(r.secondsLeft).toBe(1);
  });
  it("parses otpauth URIs and bare secrets", () => {
    const p = parseOtpauth("otpauth://totp/Pabbel:ada@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Pabbel&digits=6&period=30");
    expect(p).toMatchObject({ issuer: "Pabbel", account: "ada@example.com", secret: "JBSWY3DPEHPK3PXP", digits: 6, period: 30, algorithm: "SHA1" });
    expect(parseTotpInput("jbsw y3dp ehpk 3pxp")?.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(parseTotpInput("not a secret!")).toBeNull();
  });
});
