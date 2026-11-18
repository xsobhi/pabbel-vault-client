import { describe, expect, it } from "vitest";
import { generateAesKeyBytes, importAesKey } from "../aead";
import { b64, hex, unb64 } from "../bytes";
import { encKeyStatement, generateIdentity, sign, verify, wrapStatement, type Identity } from "../identity";
import { aad, generateAccountKeys, wrapToPublic, type AccountKeys } from "../keys";
import { TrustBook, type TrustIO } from "./book";
import { emptyTrust, sealTrust, type TrustState } from "./state";
import { makeTeamWrap, openTeamWrap, TeamKeyError, type Recipient, type TeamWrapRow } from "./team-wrap";

/** An account as the client sees it: ECDH keys, an identity, and its own pins. */
async function person(userId: number) {
  const enc: AccountKeys = await generateAccountKeys();
  const ik: Identity = await generateIdentity();
  const encKeySig = await sign(ik.privateKey, encKeyStatement(userId, enc.publicRaw));
  const recipient: Recipient = { userId, publicKey: enc.publicRaw, signKey: ik.publicRaw, encKeySig };
  return { userId, enc, ik, encKeySig, recipient };
}
type P = Awaited<ReturnType<typeof person>>;

/** A book over an in-memory "server" and "device". */
async function bookFor(seed: TrustState | null = null) {
  const store = { local: seed, server: null as string | null, puts: 0 };
  const io: TrustIO = {
    personalKey: await importAesKey(await generateAesKeyBytes()),
    readLocal: async () => store.local,
    writeLocal: async (s) => { store.local = structuredClone(s); },
    fetchServer: async () => store.server,
    putServer: async (state, previous) => {
      if (previous !== store.server) throw Object.assign(new Error("stale"), { status: 409 });
      store.server = state; store.puts++;
    },
  };
  return { book: await TrustBook.load(io, null), store, io };
}

const VAULT = "11111111-1111-4111-8111-111111111111";
async function row(to: P, by: P, version: number, raw: Uint8Array, signed = true, book?: TrustBook): Promise<TeamWrapRow> {
  const b = book ?? (await bookFor()).book;
  const w = await makeTeamWrap(VAULT, version, raw, to.recipient, { userId: by.userId, signingKey: by.ik.privateKey }, b);
  return { id: VAULT, wrappedKey: w.wrappedKey, memberKeyVersion: version, signed, wrapSig: w.wrapSig, wrapSigner: by.userId, signerKey: by.ik.publicRaw };
}
const meOf = (p: P) => ({ userId: p.userId, encPrivateKey: p.enc.privateKey, encPublicRaw: p.enc.publicRaw });
const reason = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof TeamKeyError ? e.reason : String(e)));

describe("signatures (identity.ts)", () => {
  it("sign -> verify; tampered field, wrong key and malformed input fail", async () => {
    const a = await generateIdentity(), b = await generateIdentity();
    const lines = wrapStatement({ vaultId: VAULT, recipientId: 7, keyVersion: 3, wrappedKey: "AAAA", recipientEncPublic: "BBBB", signerId: 2 });
    const sig = await sign(a.privateKey, lines);
    expect(unb64(sig)).toHaveLength(64);
    expect(await verify(a.publicRaw, lines, sig)).toBe(true);
    expect(await verify(b.publicRaw, lines, sig)).toBe(false);
    expect(await verify(a.publicRaw, [...lines.slice(0, 3), 4, ...lines.slice(4)], sig)).toBe(false);
    expect(await verify(a.publicRaw, lines, b64(new Uint8Array(64)))).toBe(false);
    expect(await verify("not-a-key", lines, sig)).toBe(false);
    await expect(sign(a.privateKey, ["x\ny"])).rejects.toThrow(/newline/);
  });
});

describe("opening a team key (team-wrap.ts)", () => {
  it("a signed wrap opens to the key and pins the signer", async () => {
    const owner = await person(1), m = await person(2);
    const raw = await generateAesKeyBytes();
    const { book } = await bookFor();
    const out = await openTeamWrap(await row(m, owner, 2, raw), meOf(m), book);
    expect(hex(out.raw)).toBe(hex(raw));
    expect(out.legacy).toBe(false);
    expect(book.snapshot().contacts["1"]).toBe(owner.ik.publicRaw);
    expect(book.floor(VAULT)).toBe(2);
  });

  it("legacy (unsigned) opens before migration and is marked; refused once the vault is migrated", async () => {
    const m = await person(2);
    const raw = await generateAesKeyBytes();
    const legacy: TeamWrapRow = { id: VAULT, wrappedKey: await wrapToPublic(m.enc.publicRaw, raw, aad.memberWrap(VAULT, 2)), memberKeyVersion: 1, signed: false };
    const { book } = await bookFor();
    expect((await openTeamWrap(legacy, meOf(m), book)).legacy).toBe(true);
    expect(await reason(openTeamWrap({ ...legacy, signed: true }, meOf(m), book))).toBe("unsigned");
    // The server un-flagging a vault this account has seen signed changes nothing.
    book.markSigned(VAULT, 1);
    expect(await reason(openTeamWrap(legacy, meOf(m), book))).toBe("unsigned");
  });

  it("a server-substituted wrap (its own key, no valid signature) is refused", async () => {
    const owner = await person(1), m = await person(2);
    const good = await row(m, owner, 2, await generateAesKeyBytes());
    const forged = await wrapToPublic(m.enc.publicRaw, await generateAesKeyBytes(), aad.memberWrap(VAULT, 2));
    const { book } = await bookFor();
    expect(await reason(openTeamWrap({ ...good, wrappedKey: forged }, meOf(m), book))).toBe("bad-signature");
    expect(await reason(openTeamWrap({ ...good, memberKeyVersion: 3 }, meOf(m), book))).toBe("bad-signature");
    expect(await reason(openTeamWrap({ ...good, wrapSigner: 9 }, meOf(m), book))).toBe("bad-signature");
    // Nothing got pinned from the forgeries.
    expect(book.snapshot().contacts).toEqual({});
  });

  it("a server that signs with a key of its own under the owner's name hits the pin", async () => {
    const owner = await person(1), m = await person(2), evil = await person(1);
    const raw = await generateAesKeyBytes();
    const { book } = await bookFor();
    await openTeamWrap(await row(m, owner, 2, raw), meOf(m), book);
    expect(await reason(openTeamWrap(await row(m, evil, 3, raw), meOf(m), book))).toBe("key-changed");
    // After comparing fingerprints the person may accept it.
    book.accept(1, evil.ik.publicRaw);
    expect(await reason(openTeamWrap(await row(m, evil, 3, raw), meOf(m), book))).toBe("ok");
  });

  it("an older key version than one verified is a rollback", async () => {
    const owner = await person(1), m = await person(2);
    const { book } = await bookFor();
    await openTeamWrap(await row(m, owner, 5, await generateAesKeyBytes()), meOf(m), book);
    expect(await reason(openTeamWrap(await row(m, owner, 4, await generateAesKeyBytes()), meOf(m), book))).toBe("rollback");
  });

  it("a wrap made for someone else's ECDH key does not verify for me", async () => {
    const owner = await person(1), m = await person(2), other = await person(3);
    const r = await row({ ...m, recipient: { ...m.recipient, publicKey: other.enc.publicRaw, signKey: null, encKeySig: null } }, owner, 2, await generateAesKeyBytes());
    expect(await reason(openTeamWrap(r, meOf(m), (await bookFor()).book))).toBe("bad-signature");
  });
});

describe("making a wrap (team-wrap.ts)", () => {
  it("needs the recipient's identity to vouch for its ECDH key, and refuses a changed identity", async () => {
    const owner = await person(1), m = await person(2), evil = await person(2);
    const raw = await generateAesKeyBytes();
    const { book } = await bookFor();
    const by = { userId: 1, signingKey: owner.ik.privateKey };
    expect(await reason(makeTeamWrap(VAULT, 2, raw, { ...m.recipient, publicKey: evil.enc.publicRaw }, by, book))).toBe("bad-binding");
    expect(book.snapshot().contacts["2"]).toBeUndefined();
    await makeTeamWrap(VAULT, 2, raw, m.recipient, by, book);
    expect(await reason(makeTeamWrap(VAULT, 2, raw, evil.recipient, by, book))).toBe("key-changed");
    // A pinned contact the server now says has no identity is a change too, not a legacy account.
    expect(await reason(makeTeamWrap(VAULT, 2, raw, { ...m.recipient, signKey: null, encKeySig: null }, by, book))).toBe("key-changed");
    // A never-seen legacy account (no identity) still gets a signed wrap.
    expect(await reason(makeTeamWrap(VAULT, 2, raw, { userId: 5, publicKey: m.enc.publicRaw }, by, book))).toBe("ok");
  });
});

describe("the pins (book.ts)", () => {
  it("survive the server dropping its copy, and the device copy wins a disagreement", async () => {
    const seed = { ...emptyTrust(), contacts: { "1": "device-key" }, vaults: { [VAULT]: 4 } };
    const { book, store } = await bookFor(seed);
    expect(book.snapshot()).toEqual(seed);
    await book.flush();
    expect(store.puts).toBe(1); // the server lacked them: uploaded
    expect(book.pin(1, "server-key")).toBe("changed");
  });

  it("a lost compare-and-set merges the other device's pins and retries", async () => {
    const { book, store, io } = await bookFor();
    book.pin(1, "k1");
    // Another device of the same account wrote meanwhile.
    store.server = await sealTrust(io.personalKey, { ...emptyTrust(), contacts: { "2": "k2" } });
    await book.flush();
    expect(book.snapshot().contacts).toEqual({ "1": "k1", "2": "k2" });
  });
});
