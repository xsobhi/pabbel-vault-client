# Pabbel Vault: client source

The client side of [Pabbel Vault](https://pabbel.com/vault), a zero-knowledge password
manager: the cryptography library and the Chrome and Firefox extension. It is published so
that anyone can check that a vault is encrypted on their own device, with keys the server
never receives.

- Cryptographic design, written for auditors: [docs/crypto.md](docs/crypto.md)
- Reporting a vulnerability: [SECURITY.md](SECURITY.md)
- Licence: GPL-3.0-only ([LICENSE](LICENSE)); third-party code: [NOTICE](NOTICE)

No independent security audit of this code has been published, and none is claimed.

## What is here

| Path | What |
|---|---|
| `crypto/` | The vault cryptography as a standalone TypeScript package: PBKDF2 key derivation, AES-256-GCM envelopes, P-256 ECDH key pair and ECIES key wrapping, ECDSA P-256 identity keys with signed team-key wraps and trust-on-first-use pins (`src/trust/`), HKDF, recovery key, trusted-browser key, key proof, email-mask sealing, TOTP, Google Authenticator import parsing, the password generator, and the unlocked-session holder. WebCrypto only, no runtime dependencies. With its tests and the OpenSSL parity vectors. |
| `extension/` | The browser extension (Manifest V3, TypeScript, Preact, esbuild): sign-in with Pabbel (OAuth code with PKCE), unlock, autofill, save prompts, 2-step codes (typed, or read from a QR code on the device), the generator, trusted browser, email masks, and the checks on signed team keys. It imports `crypto/` from the sibling folder, so there is one copy of the crypto. |
| `docs/crypto.md` | Algorithms and parameters, byte formats, what the server sees and does not see, where keys live, the threat model and its limits. |

## What is not here

- The server.
- The web vault (vault.pabbel.com) and the Android app. They stay private. The web vault is
  where an account's keys are created and where teams are managed.
- The end-to-end browser tests (they drive the production API with a throwaway account), the
  store listing text and screenshots, and the store submission tooling.

The extension talks to the public Pabbel API only: `https://accounts.pabbel.com` for
sign-in and `https://vault.pabbel.com/api/vault` for the vault (ciphertext). Both are set in
[`extension/src/config.ts`](extension/src/config.ts), together with the OAuth client id
`pabbel-vault-extension`, a public client: it has no secret and proves its code exchange
with PKCE.

## Build and test

You need Node.js 22 (built and tested with v22.23.4) and npm. Packages are pinned by
lockfile; nothing else is fetched.

```sh
# the crypto library
cd crypto
npm ci
npm test            # 63 tests, including the OpenSSL parity vectors
npm run typecheck

# the extension
cd ../extension
npm ci
npm test            # 251 unit tests
npm run typecheck
npm run build       # -> extension/dist/ and pabbel-vault-extension-1.2.1.zip (Chrome package)
```

| Command (in `extension/`) | Output |
|---|---|
| `npm run build` | `dist/` and `pabbel-vault-extension-<version>.zip`: the Chrome Web Store package |
| `npm run build:firefox` | `dist-firefox/` and `pabbel-vault-firefox-<version>.zip`: the Firefox add-on |
| `npm run build:local` | `dist-local/`: the Chrome build with the store's public key added to the manifest, for loading unpacked |
| `npm run build:all` | both store packages |
| `npm run check:locales` | checks the 31 locale files against English |

Builds are deterministic: the same source and lockfile give the same bytes, including the
zip. The bundles are not minified beyond syntax simplification and carry no source maps,
so the shipped JavaScript stays readable. The build fails if the manifest carries a pinned
`key` (store builds) or if a bundle contains remote-code patterns (`eval`, `new Function`,
`importScripts`, remote `import()` or remote `<script src>`).

**Loading your own build.** Chrome: `npm run build:local`, then `chrome://extensions`,
turn on Developer mode, Load unpacked, pick `extension/dist-local`. Sign-in with Pabbel only
accepts the store extension's id as its redirect address, which the `key` in the local build
reproduces (it is the store item's public key; it is public). Firefox: `npm run build:firefox`, then
`about:debugging`, This Firefox, Load Temporary Add-on, pick `extension/dist-firefox/manifest.json`.
A local build talks to the real Pabbel service.

## How to verify

1. Read `docs/crypto.md`, then the code it points to. `crypto/src` is about 1,000 lines
   of library code and 550 of tests.
2. Run the crypto tests. They check the library against Node's OpenSSL, not only against
   itself: PBKDF2, the `0x01` AES-GCM envelope in both directions, an `0x02` ECIES wrap built
   by OpenSSL, the RFC 6238 and RFC 5869 vectors.
3. Build the extension and compare it with the package you installed. Download the store
   package, unzip it (a `.crx` is a zip with a short header; `unzip` warns and still works,
   a Firefox `.xpi` is a plain zip), and compare:

   ```sh
   cd extension
   node scripts/compare.mjs dist /path/to/unzipped-chrome-package
   node scripts/compare.mjs dist-firefox /path/to/unzipped-firefox-package
   ```

   The script ignores what the stores add (`_metadata/`, `META-INF/`, Chrome's `update_url`)
   and the `// path/to/module.ts` comments esbuild writes, and exits non-zero on any other
   difference.

   **Status of this comparison, honestly.** The store packages, 1.2.1 included, are built
   from Pabbel's private repository, where the extension imports the crypto from the web
   vault's source tree and carries test hooks that are inert in store builds. This tree is
   the same code arranged to stand alone, so the manifest and every other file are
   identical, while `background.js`, `popup.js` and `options.js` differ. For 1.2.1 the
   differences are: module order and the names esbuild picks; the private bundle also
   contains code it never runs (an endpoint override map and a message filter used only by
   the private test harness, and parts of the web vault's own client pulled in by an
   import); and the popup sends an unused `tabId` field. None of it touches keys, the
   network calls or what is filled. Until a release is built and published from this
   repository, the comparison will show those differences, and you can read them.
4. Check the permissions in `extension/scripts/manifest.mjs` against the code. In short:
   host access to every https page (it has to find sign-in forms; it never runs on plain
   http except localhost), `storage`, `identity` (only for the Pabbel sign-in window), `alarms`
   (auto-lock, token refresh, clipboard clearing), `contextMenus`, `activeTab` (only for "Scan this page" when adding a 2-step code: the visible tab is captured once and decoded on the device), `clipboardWrite` and
   `offscreen` (copying and clearing the clipboard), and a Content Security Policy of
   `script-src 'self'`.

## Reporting a vulnerability

Use GitHub private vulnerability reporting on this repository (Security tab, Report a
vulnerability). Please do not open public issues for vulnerabilities. Details in
[SECURITY.md](SECURITY.md).

## Links

- Pabbel Vault: https://pabbel.com/vault
- Web vault: https://vault.pabbel.com
- Extension privacy policy: https://pabbel.com/privacy#vault-extension
- Chrome Web Store: https://chromewebstore.google.com/detail/kblmedemdcmcgjcofkfjehjbcfdggomi
- Firefox add-on: https://addons.mozilla.org/firefox/addon/pabbel-vault/

## Licence

Copyright (C) 2026 Sobhi Ashraf Al-Firani. GPL-3.0-only. The Pabbel name and logo are not
licensed with the code; a fork should use its own name and icons. Third-party notices are in
[NOTICE](NOTICE).
