/** A password change re-wraps everything under the new master key, and nothing opens under the old one. */
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, generateAesKeyBytes } from "./aead";
import { b64, hex } from "./bytes";
import { deriveMasterKey, makeMkCheck, verifyMkCheck } from "./kdf";
import { aad, generateAccountKeys, unwrapPrivateKey, unwrapWithPrivate, wrapToPublic } from "./keys";
import { newRecoveryKey, openWithRecoveryKey, recoveryFields, recoveryKeyFrom } from "./recovery";
import { buildPasswordChange } from "./rewrap";

const params = { salt: b64(new Uint8Array(16).fill(7)), iterations: 600_000 };
const raw = async (k: CryptoKey) => hex(new Uint8Array(await crypto.subtle.exportKey("raw", k)));

async function account() {
  const oldMk = await deriveMasterKey("old password", params, true);
  const keys = await generateAccountKeys();
  const vk = await generateAesKeyBytes();
  return { oldMk, keys, vk, personal: [{ id: "pv1", wrappedKey: await encrypt(oldMk, vk, aad.personalVaultKey("pv1")) }] };
}

describe("buildPasswordChange", () => {
  it("re-wraps the private key, the personal vault key and the recovery key under a fresh MK", async () => {
    const a = await account();
    const rk = newRecoveryKey();
    const { mk, body } = await buildPasswordChange({ oldMk: a.oldMk, privateKey: a.keys.privateKey, newPassword: "a brand new password", personalVaults: a.personal, recoveryKey: rk });
    // The new MK is the one the password derives with the new salt - what the next unlock computes.
    const again = await deriveMasterKey("a brand new password", { salt: body.salt, iterations: body.iterations }, true);
    expect(await raw(again)).toBe(await raw(mk));
    expect(body.salt).not.toBe(params.salt);
    expect(body.iterations).toBe(600_000);
    expect(await verifyMkCheck(again, body.mkCheck)).toBe(true);
    // The private key still opens team keys wrapped to the unchanged public key.
    const team = await wrapToPublic(a.keys.publicRaw, a.vk, "team");
    expect(hex(await unwrapWithPrivate(await unwrapPrivateKey(again, body.encPrivateKey), team, "team"))).toBe(hex(a.vk));
    expect(body.personalKeys.map((p) => p.vaultId)).toEqual(["pv1"]);
    expect(hex(await decrypt(again, body.personalKeys[0].encKey, aad.personalVaultKey("pv1")))).toBe(hex(a.vk));
    // Same recovery key, new wrap: the saved key opens the NEW master key.
    expect(await raw(await openWithRecoveryKey(body.recovery!.wrap, rk))).toBe(await raw(mk));
    expect(hex(await recoveryKeyFrom(mk, body.recovery!.keyEnc))).toBe(hex(rk));
  });

  it("nothing in the new body opens under the old master key", async () => {
    const a = await account();
    const { body } = await buildPasswordChange({ oldMk: a.oldMk, privateKey: a.keys.privateKey, newPassword: "another password!", personalVaults: a.personal, recoveryKey: newRecoveryKey() });
    expect(await verifyMkCheck(a.oldMk, body.mkCheck)).toBe(false);
    await expect(unwrapPrivateKey(a.oldMk, body.encPrivateKey)).rejects.toThrow();
    await expect(decrypt(a.oldMk, body.personalKeys[0].encKey, aad.personalVaultKey("pv1"))).rejects.toThrow();
    await expect(recoveryKeyFrom(a.oldMk, body.recovery!.keyEnc)).rejects.toThrow();
  });

  it("sends no recovery fields when there is no recovery key", async () => {
    const a = await account();
    const { body } = await buildPasswordChange({ oldMk: a.oldMk, privateKey: a.keys.privateKey, newPassword: "x".repeat(12), personalVaults: a.personal, recoveryKey: null });
    expect("recovery" in body).toBe(false);
  });

  it("refuses to go on with the wrong old master key (a personal key would be lost)", async () => {
    const a = await account();
    const wrong = await deriveMasterKey("not the old one", params, true);
    await expect(buildPasswordChange({ oldMk: wrong, privateKey: a.keys.privateKey, newPassword: "x".repeat(12), personalVaults: a.personal, recoveryKey: null })).rejects.toThrow();
  });

  it("the recovery path: MK opened with RK alone is enough to set a new password", async () => {
    const a = await account();
    const rk = newRecoveryKey();
    const stored = await recoveryFields(a.oldMk, rk);
    const viaKey = await openWithRecoveryKey(stored.wrap, rk);
    expect(await verifyMkCheck(viaKey, await makeMkCheck(a.oldMk))).toBe(true);
    const { mk, body } = await buildPasswordChange({ oldMk: viaKey, privateKey: a.keys.privateKey, newPassword: "remembered now", personalVaults: a.personal, recoveryKey: rk });
    expect(hex(await decrypt(mk, body.personalKeys[0].encKey, aad.personalVaultKey("pv1")))).toBe(hex(a.vk));
  });
});
