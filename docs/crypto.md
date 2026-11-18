# Pabbel Vault: cryptographic design

This document describes what the code in `crypto/` and `extension/` does, for
people who want to audit it. It is a description of this code, written to be
checked against it. Where the code and this text disagree, the code is right
and the text has a bug: please report it.

Status: no independent security audit of this code has been published, and none
is claimed here. The design and the code have had internal reviews only.

What this document says about the server (what it stores, what it refuses, how long a
trusted-browser record lives) is the service's design as its operator describes it. The
server is not published, so those statements cannot be checked from this repository.
What can be checked here is the client side: what is encrypted before it leaves the
device, with which keys, and what the extension does with them.

Contents

1. [Scope](#1-scope)
2. [Algorithms and parameters](#2-algorithms-and-parameters)
3. [Key hierarchy](#3-key-hierarchy)
4. [Byte formats](#4-byte-formats)
5. [Flows](#5-flows)
6. [What the server sees, and what it does not](#6-what-the-server-sees-and-what-it-does-not)
7. [Where keys live on the device](#7-where-keys-live-on-the-device)
8. [Threat model and its limits](#8-threat-model-and-its-limits)
9. [Test vectors and how parity is checked](#9-test-vectors-and-how-parity-is-checked)

## 1. Scope

In this repository:

- `crypto/`: the client cryptography as a standalone TypeScript package (WebCrypto only,
  no dependencies at runtime).
- `extension/`: the Chrome and Firefox extension that uses it.

Not in this repository: the server, the web vault (vault.pabbel.com) and the Android
app. The web vault runs the flows that create an account's keys, create and manage teams,
invite and remove members and rotate a team key; the Android app has its own
implementation of the same formats. This document specifies the formats those clients
must produce, and `crypto/` provides the primitives the web vault and the extension share,
but the code of those flows is not here. The extension never creates an account's keys: it
signs in, unlocks, reads and writes items, changes the vault password, and can trust the
browser.

## 2. Algorithms and parameters

All primitives come from the platform's WebCrypto (`crypto.subtle`) and
`crypto.getRandomValues`. The library implements none of them itself.

| Purpose | Algorithm | Parameters | Code |
|---|---|---|---|
| Vault password to master key `MK` | PBKDF2-HMAC-SHA256 | 600,000 iterations, 16-byte random salt per account, 256-bit output. The password is NFKC-normalised, then UTF-8 encoded. Salt and iteration count are stored with the account and used from there. | `kdf.ts` |
| Symmetric encryption | AES-256-GCM | 96-bit random IV per encryption, 128-bit tag, additional authenticated data (AAD) = a context string (see section 4) | `aead.ts` |
| Account key pair | ECDH, P-256 | Public key as raw uncompressed point (65 bytes). Private key as PKCS#8, stored only encrypted under `MK`. | `keys.ts` |
| Sharing a vault key with a member | ECIES: ephemeral ECDH P-256, HKDF-SHA256, AES-256-GCM | HKDF salt empty, info `pabbel-vault-wrap-v1`, 32 bytes out | `keys.ts` |
| Keys derived from random input | HKDF-SHA256 (RFC 5869) | salt empty; info strings in the table below | `hkdf.ts` |
| Public key fingerprint | SHA-256 | over the raw 65-byte public key, shown as hex | `keys.ts` |
| One-time codes | HMAC-SHA-1, -256 or -512 (RFC 4226, RFC 6238) | 6 or 8 digits, period 30 s by default; computed on the device | `totp.ts` |
| Random values | `crypto.getRandomValues` | IVs, salts, keys, recovery key, device secret | `bytes.ts` |
| Generated passwords | `crypto.getRandomValues` | 8 to 128 characters, classes switchable, ambiguous glyphs left out | `generator.ts` |

HKDF info strings (one per purpose, so one input can never yield another purpose's key):

| Info | Input keying material | Output use |
|---|---|---|
| `pabbel-vault-wrap-v1` | ECDH shared secret | wrap key for a team vault key |
| `pabbel-vault-recovery-v1` | recovery key `RK` (32 bytes) | key that wraps `MK` |
| `pabbel-vault-device-v1` | `D` followed by `S` (64 bytes) | key that wraps `MK` for a trusted browser |
| `pabbel-vault-proof-v1` | ECDH shared secret (account private key, server's ephemeral public key) | key-proof value |

Why these choices, as stated by the design: PBKDF2 because WebCrypto has no Argon2 and the
Android client must derive identical bytes; P-256 because X25519 is not available in
WebCrypto on every supported browser. Argon2 would be the stronger password KDF; PBKDF2 at
600,000 iterations is the OWASP 2023 figure.

## 3. Key hierarchy

| Key | What it is | How it comes about | Where it is kept |
|---|---|---|---|
| Vault password | what the person types | memory of the person | nowhere |
| `MK` | AES-256 key | PBKDF2 of the password | never stored in the clear by the server; held in memory while unlocked (see section 7) |
| `mk_check` | `enc(MK, "pabbel-vault-check", aad "mk-check")` | at setup and at every password change | server. Lets a client tell a right password from a wrong one before it touches data. |
| Account private key | P-256 | random, once per account | server, as `enc(MK, pkcs8, aad "account-private-key")` |
| Account public key | P-256 point | with the private key | server, in the clear |
| Identity key `IK` | ECDSA P-256 key pair | random, once per account (made at the first unlock by a 1.2.1+ client) | server: public half in the clear, private half as `enc(MK, pkcs8, aad "account-signing-key")`; `encKeySig` = the identity's signature over the account's user id and ECDH public key |
| Trust state | the pinned identity keys of contacts and the highest verified key version per team | on the device, at first use (section 5) | server as `enc(personal VK, json, aad "trust-state")`, plus a copy on each device |
| Vault key `VK` | AES-256 | random per vault, and again at each rotation | server, wrapped: personal vault by `MK`, team vault by ECIES to each member's public key |
| Item data | JSON | the person | server, `enc(VK, json, aad "item:<item id>")` |
| Recovery key `RK` | 32 random bytes | on the device, once | with the person. On the server only as `recovery_wrap` and `recovery_key_enc` (section 4). |
| Device secret `D` | 32 random bytes | made by the extension when a browser is trusted | the extension's own IndexedDB |
| Device share `S` | 32 random bytes | made by the server for that trusted browser | server |

Nothing is derived from the Pabbel account password or the OAuth session. They authenticate
the person to the server; only the vault password (or `RK`, or a trusted browser's `D` plus
`S`) opens the vault.

## 4. Byte formats

All blobs are standard base64 with padding.

**Encrypted blob** `enc(key, plaintext, aad)`:

```
0x01 || iv (12) || AES-256-GCM(key, iv, plaintext, aad) = ciphertext || tag (16)
```

`aad` is the UTF-8 context string. It binds a blob to its slot, so the server cannot move
ciphertext from one slot to another without the tag failing:

| Blob | aad |
|---|---|
| Item | `item:<item id>` |
| Personal vault key, under `MK` | `vault:<vault id>` |
| Team vault key to a member | `vault:<vault id>:member:<user id>` |
| Private key at rest | `account-private-key` |
| `mk_check` | `mk-check` |
| Recovery wrap | `recovery-wrap` |
| Recovery key under `MK` | `recovery-key` |
| Trusted-browser wrap | `device:<device id>` |
| Email-mask label and site | `mask:<mask id>` |
| Extension's icon cache | `extension-site-icons-v1` |

**Team vault key to a public key** (ECIES):

```
0x02 || ephemeralPublic (65, uncompressed) || iv (12) || AES-256-GCM(wrapKey, iv, VK, aad) = ciphertext || tag (16)
wrapKey = HKDF-SHA256(ECDH(ephemeralPrivate, recipientPublic), salt = "", info = "pabbel-vault-wrap-v1", 32 bytes)
```

The ephemeral key is used once. The HKDF input does not include the two public keys.

**Recovery** (`recovery.ts`):

```
recovery_wrap     = enc(HKDF-SHA256(RK, salt = "", info = "pabbel-vault-recovery-v1"), MK_raw, "recovery-wrap")
recovery_key_enc  = enc(MK, RK, "recovery-key")
```

`RK` is shown as RFC 4648 base32 (A to Z, 2 to 7): 52 characters in 13 groups of four. Input
ignores case, spaces and dashes, reads 0, 1 and 8 as O, I and B, and requires the four
unused trailing bits to be zero.

**Trusted browser** (`device.ts`):

```
W    = HKDF-SHA256(D || S, salt = "", info = "pabbel-vault-device-v1")
blob = enc(W, MK_raw, "device:<device id>")
```

**Key proof** (`key-proof.ts`): the server issues a one-time challenge and an ephemeral P-256
public key `E`. The client answers
`proof = base64(HKDF-SHA256(ECDH(account private key, E), salt = "", info = "pabbel-vault-proof-v1", 32 bytes))`.

**Item plaintext** (`items.ts`): UTF-8 JSON, one of

```
{"t":"login","name","username","password","url","notes"}
{"t":"totp","name","issuer","account","secret"(base32),"algorithm","digits","period"}
{"t":"note","name","body"}
```

each with an optional `"pinned"`. The item name is inside the ciphertext.

**Email-mask meta** (`mask-meta.ts`): `enc(personal VK, {"label","site"}, "mask:<mask id>")`.

## 5. Flows

These are the flows the extension and library implement. `crypto/` holds the primitives;
`extension/src/background/` holds the flows.

- **Sign-in to Pabbel (extension).** OAuth 2.0 authorization code with PKCE (S256) through
  `chrome.identity.launchWebAuthFlow` at accounts.pabbel.com, as the public client
  `pabbel-vault-extension` (no client secret), scope `vault profile`. The access token goes
  as a Bearer header to the vault API; the refresh token rotates on every use. These
  tokens reach ciphertext only; they decrypt nothing. (`background/auth.ts`, `pkce.ts`)
- **Unlock.** The popup passes the typed password to the background worker. The worker
  fetches `GET /vault/me` (salt, iteration count, `mk_check`, encrypted private key,
  public key), refuses an iteration count outside 600,000 to 10,000,000, derives `MK`,
  checks it against `mk_check`, and only then unwraps the private key. An account without
  an identity key gets one here (`trust/identity-setup.ts`, with a key proof). The password reaches only the worker, and `MK` stays inside the extension
  (worker memory and `chrome.storage.session`, section 7). (`background/unlock.ts`)
- **Reading.** For each vault the worker opens its key (personal: decrypt with `MK`; team:
  verify the signed wrap, then ECIES-unwrap with the private key, section 5a), downloads the item ciphertext and decrypts it in the
  worker. A content script receives the fields of one item only after the person picks
  it. (`background/vault-keys.ts`, `data.ts`, `fill.ts`)
- **Writing.** Item and mask ids are minted by the server and sit inside the AAD, so a new
  item is made in two steps: reserve an id, then upload the ciphertext made for that id.
  (`background/writes.ts`)
- **Changing the vault password** (`crypto/src/rewrap.ts`, `background/password.ts`). New
  random salt, new `MK`; under it the private key, every personal vault key and the
  recovery wrap are re-encrypted. `RK` itself is unchanged, so a saved recovery key keeps
  working. Team keys are wrapped to the public key, which does not change. The request
  carries a key proof and the previous `mk_check` (compare-and-set), so a stale session
  cannot overwrite newer key material.
- **Trusted browser** (`background/trust.ts`, opt-in). The extension makes `D`; the server
  makes `S` for a new device record. The extension stores `D` and `enc(W, MK)` in its own
  IndexedDB. To unlock without the password it asks the server for `S` (the server hands
  it out only to the sign-in that created the record, while the record is live and the
  account's `mk_check` is unchanged), rebuilds `W`, decrypts `MK` and checks it against
  `mk_check`. The server's lifetime for the record is 30 days. The record is removed on
  every sign-out, and the server revokes all records on a password change.
- **Recovery** (web vault, primitives in `recovery.ts`): `RK` opens `recovery_wrap` to give
  `MK`, then a new vault password is required.
- **Teams** (web vault): one `VK` per team, wrapped to each member's public key and signed
  by the member who made the wrap (section 5a). Removing a member generates a new `VK`,
  re-encrypts every item and re-wraps for the remaining members in one transaction.
  Invites show the invitee's identity fingerprint so members can compare it out of band.
- **TOTP.** Codes are computed on the device from the decrypted secret. Nothing about codes
  is sent to the server.

## 5a. Signed team keys (format 2, extension 1.2.1)

An ECIES wrap is not authenticated: whoever knows a member's public key, the server
above all, can make a wrap of any key. So since 1.2.1 a team key is used only if a
person the member can name made it for them.

- **Identity.** Each account has an identity key `IK` (section 3). `encKeySig` binds the
  account's ECDH public key to it, so whoever pins the identity also knows the right
  ECDH key. On unlock a client checks that the identity public key the server serves
  belongs to its own decrypted private half, and refuses to sign otherwise.
- **Signed wrap.** Every wrap made by a 1.2.1+ client carries `wrapSig`: an ECDSA
  signature by its maker over the vault id, the recipient's user id, the key version, the
  wrap, the recipient's ECDH public key and the signer's user id
  (`crypto/src/identity.ts`, `crypto/src/trust/team-wrap.ts`). The server records the
  signer as the account that uploaded the wrap.
- **Pins (trust on first use).** The trust state maps contacts to their identity keys and
  each team to the highest key version verified. It is kept on the device and on the
  server (sealed under the personal vault key), merged on every load; where the copies
  disagree the device copy wins and the contact counts as changed (`trust/state.ts`,
  `trust/book.ts`, `extension/src/background/pins.ts`).
- **Opening a team key.** A team counts as migrated when the server says so or the trust
  state already holds it; a client never un-learns that. No signature: accepted only
  before migration (shown as legacy), refused after it (downgrade). With a signature: the
  signer must match its pin (a new contact is pinned; a different key is refused until
  the person compares fingerprints and trusts the new key in the web vault), the
  signature must verify over the statement rebuilt from the row and this account's own
  ECDH key, and the key version must not be below the highest one seen (rollback). A team
  that fails any check does not open: no item is shown and nothing is written to it.
- **Migration.** The server holds no private keys and cannot migrate anything. When an
  owner or admin unlocks a 1.2.1+ web vault, each legacy team they manage is rotated (new
  key, every item re-encrypted, a signed wrap for every member, one transaction). From then
  on the server refuses unsigned wraps for that team.

What signing does not stop: the first contact (a server that substitutes keys before two
people ever met is caught only by comparing fingerprints), a fake member the server
enrols in the membership table (the signature proves who made a key, not that the person
belongs in the team), and teams whose admins never run a 1.2.1+ client, which stay
unsigned.

## 6. What the server sees, and what it does not

The server sees (it needs these to run the service, or receives them as ciphertext):

- The account's email address and display name, its salt and iteration count, its public
  key, and these blobs: encrypted private key, `mk_check`, recovery blobs, wrapped vault
  keys, item ciphertext, mask meta ciphertext, the extension's `S` values.
- Vault structure: vault ids, kinds (personal or team), team names, member emails and
  roles, item ids, item types (login, totp or note), key versions, creation and update
  times, item counts, and the approximate length of every ciphertext (there is no
  padding).
- An audit trail: which user created, read, updated or deleted which item and when, with
  the kind of read (reveal, copy, code, autofill). Never what the item contained.
- Trusted browsers: a name taken from the user agent, when each was added and last used.
- Email masks: the address, the owner, its state, and the mail that arrives through it.
  This is not end-to-end encrypted and is separate from the vault.
- What any web server sees of a request: IP address, timing, user agent.

The server does not see, and cannot compute from what it holds:

- The vault password, `MK`, the account private key in the clear, any `VK`.
- Any item's name, URL, username, password, notes or TOTP secret.
- Which sites a person has logins for.
- Mask labels and the sites masks were made for.
- `RK` and `D`. (`S` without `D` opens nothing.)

What the server can still do, because it is the server:

- Refuse to serve ciphertext, delete it, or serve an older version of it (rollback).
  Clients do not detect rollback.
- Lie about membership and about other people's public keys.
- Learn the metadata listed above.
- Attack the password offline: it holds `mk_check` and the encrypted private key, which a
  guessed password can be tested against. PBKDF2 at 600,000 iterations makes each guess
  expensive; a weak password is still a weak password. There is no second secret mixed
  into the key derivation.

The extension talks to two Pabbel hosts: accounts.pabbel.com (sign-in) and
vault.pabbel.com (the vault API, ciphertext only). It also fetches a saved site's own icon
from that site, with no cookies, unless the setting is switched off; those sites see a
request from the person's IP address, Pabbel does not see which.

## 7. Where keys live on the device

Extension:

- Typed password: popup to background worker by extension message; not stored.
- `MK` and the account private key: in the worker's memory and as base64 (raw `MK`,
  PKCS#8 private key) in `chrome.storage.session`. That store is memory-only, cleared when
  the browser closes and when the vault locks, and set to trusted extension contexts
  only (Chrome; Firefox's session storage is not exposed to content scripts). It is how
  the vault stays open when the browser stops the worker. Auto-lock (default 15
  minutes, choices 1 to 60 minutes or only when the browser closes) clears it.
- OAuth tokens: `chrome.storage.local` (on disk). They reach ciphertext only.
- Ciphertext of the vault: cached in `chrome.storage.session`. Decrypted items live in the
  worker's memory.
- Trusted browser record (`D`, wrapped `MK`, device id, expiry): the extension's own
  IndexedDB, not `chrome.storage.local`, so content scripts cannot read it.
- Icon cache: `chrome.storage.local`, encrypted under the personal vault key.
- Clipboard: a copied secret is overwritten 45 seconds later.
- Content scripts run in every https page (and on localhost). They hold no keys and no
  secrets. A secret is sent to a frame only when the person picks an item, to a secure
  frame whose top page is also secure, with both in the same registrable domain (`background/fill.ts`,
  `shared/site.ts`, `frameMayFill`). Their UI sits in a closed shadow root.

Web vault (not in this repository, but it uses `crypto/session.ts`,
`crypto/session-store.ts` and `crypto/session-idb.ts`): `MK` is held in module memory. So
that a reload does not ask for the password again, `MK` is encrypted under a random
AES-GCM key that is created non-extractable and kept in IndexedDB (a structured clone of
the `CryptoKey`, so script cannot read its bytes), and only that ciphertext is kept in
`sessionStorage` for the tab. Both are removed on lock, on a closed tab and after the
auto-lock period. Before 1.2.1 the raw `MK` sat in `sessionStorage`.

JavaScript cannot guarantee that memory is erased. `wipe()` zeroes buffers the code is done
with, as best effort.

## 8. Threat model and its limits

What the design is built to withstand:

- **A leaked or stolen database, a curious administrator, a legal demand to the
  operator.** They get ciphertext, metadata and the material for offline password
  guessing (section 6). They do not get plaintext, and there is no key held by the
  operator that would decrypt it. There is deliberately no operator-held recovery.
- **A network attacker.** All traffic is TLS; beyond that, the content is already
  ciphertext.
- **A stolen browser profile without the vault password.** It holds tokens (ciphertext
  access), the encrypted icon cache and, if the browser was trusted, `D` and the wrapped
  `MK`. Without `S` that opens nothing. An attacker with the profile and its live Pabbel
  sign-in (both are in the profile) can open the vault until the trust is removed,
  expires after 30 days, or the vault password changes. That is the convenience the
  opt-in setting buys.

What it does not protect against, and where trust remains:

1. **A malicious or compromised server can ship malicious code to the web vault.** The web
   vault is JavaScript the server delivers on every visit. If the server is compromised or
   turns hostile, the code it serves can read the vault password as it is typed. Open
   source, subresource controls and a content security policy do not change that, because
   whoever controls the server controls what is delivered, and an audit of a repository
   cannot vouch for code that is delivered later. The extension reduces this: its code is
   fixed at install, comes through the browser store's review and signing, does not load
   remote code (script CSP is `'self'`, no `eval`; `scripts/check-store.mjs` rejects
   remote-code patterns in the build), and you can build it from this source and compare
   it with the store package. Publishing the code lets people check these claims; it
   does not remove the trust in the store channel, in the publisher's signing, or in
   every future update.
2. **The extension is still a client of the server.** The server can lie to it in the ways
   listed in section 6, and it holds `S` for trusted browsers. It cannot decrypt anything
   with what it holds.
3. **Team vault keys are authenticated only after migration.** Since 1.2.1 a team key is
   signed by the member who wrapped it and checked against pinned identities (section 5a).
   A team whose owner and admins have not yet opened a 1.2.1+ web vault is still unsigned
   (legacy): there, a malicious server could give a member a key of its own choosing, as
   before. Trust on first use leaves the first contact open; compare fingerprints out of
   band. Personal vaults never had this problem, because their key is wrapped under `MK`.
4. **Rollback and withholding are only partly detected.** A team key version below the
   highest one seen is refused. Items themselves carry no version history, so a server can
   still withhold an item or serve an older copy of it.
5. **Endpoint compromise is out of scope.** Malware, a malicious browser extension with
   broad permissions, or a compromised operating system can read an unlocked vault,
   the clipboard, and keystrokes. A page you fill a password into can read what was filled
   into it. The extension fills only after the person picks a login or uses the shortcut
   (a two-page sign-in continues from that pick, and a 2-step code can follow a password
   fill, a setting that can be switched off), only over https (or localhost), only into
   frames that belong to the same registrable domain as the page, and not into hidden
   fields. It cannot tell a genuine page from a perfect copy served from the same domain.
6. **Metadata is visible** to the server (section 6), including item counts, types and
   ciphertext lengths.
7. **Password strength is the person's responsibility.** There is no secret key mixed into the
   derivation. The library's `passwordStrength` is a nudge, not a gate. The client refuses
   an iteration count from the server below 600,000 or above 10,000,000 (`kdf.ts`), so a
   server cannot make a guess cheaper by lowering it.
8. **No recovery by the operator.** Lose the vault password and the recovery key, and the
   data is gone; erase and start over is the last resort.
9. **Side channels.** The code runs on the browser's WebCrypto and relies on it for
   constant-time behaviour. `generatePassword` reduces a 32-bit random value modulo the
   alphabet size; the bias is below 2e-8 per character and was accepted.
10. **Not independently audited.** See the status line at the top.

## 9. Test vectors and how parity is checked

`crypto/` has its own tests (`npm test` in `crypto/`). They check that:

- the PBKDF2 output equals OpenSSL's, with the NFKC normalisation (`crypto-parity.test.ts`);
- an `0x01` blob made by OpenSSL opens in the library, and one made by the library opens in
  OpenSSL (same file), including a wrong AAD failing;
- an `0x02` ECIES wrap built by OpenSSL (P-256 ECDH, HKDF-SHA256 with the label above,
  AES-GCM) opens in the library;
- the TOTP outputs match the RFC 6238 test vectors, for 6 and 8 digits (same file);
- HKDF matches RFC 5869 test case 1 and the fixed vectors for the device and recovery
  keys: `HKDF(0x01 x 32 || 0x02 x 32, "pabbel-vault-device-v1")` is
  `604fd88eb6cb906336c57c1f7ab92659bc76b5bbe1aac75531d7f45f87292a95` and
  `HKDF(0x03 x 32, "pabbel-vault-recovery-v1")` is
  `b41882ce44947a70078c2b6b5f1214a8a77a9a017ea61cdaea6c1655dd963203`
  (`unlock-keys.test.ts`);
- recovery key formatting, parsing and the wrap round trip (`unlock-keys.test.ts`), the
  password-change re-wrap, including that nothing in the new body opens under the old
  master key (`rewrap.test.ts`), mask-meta sealing (`mask-meta.test.ts`), the password
  generator and the Google Authenticator import parser each have their own tests.

The Android client has a test of the same kind against a blob made by WebCrypto; it is in
the private Android repository and not part of this one. The extension has unit tests for
the pieces around the crypto (password change, trusted browser life cycle, masks, site
matching) in `extension/tests/unit/`, using an in-memory fake of the vault API. The end-to-end
tests that drive a real browser against the production API are not published (they need
a throwaway production account).
