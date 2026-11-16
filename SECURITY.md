# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately, using GitHub's private vulnerability reporting on
this repository: open the **Security** tab and choose **Report a vulnerability**. This
creates a private security advisory that only the maintainers and you can see.

Please do not open a public issue, pull request or discussion for a suspected vulnerability,
and do not post it elsewhere before it has been fixed.

A useful report says which file or behaviour is affected, what an attacker needs (for
example a stolen browser profile, a hostile web page, or control of the server), the steps
to reproduce it, and the impact you expect. A proof of concept helps; do not access other
people's accounts or data to make one, and use your own account.

## What is in scope

- The cryptography in `crypto/`: key derivation, key wrapping, envelopes, recovery,
  trusted-browser and key-proof keys, TOTP.
- The browser extension in `extension/`: key handling, storage, messaging between
  extension components, autofill and save behaviour, the sign-in flow, anything that leaks
  a secret to a web page or to the server.
- Mismatches between `docs/crypto.md` and the code.

The server, the web vault and the Android app are not published here. If you find a problem
in them, you can report it through the same channel; say which component it concerns.

The limits already described in the threat model section of `docs/crypto.md` (for example
that a malicious server can serve hostile JavaScript to the web vault, or that team vault
keys are not authenticated) are known design limits. A report that goes beyond them, or a
fix for them, is still welcome.

## Supported versions

Fixes go into the latest version of this repository and the extension builds published from
it. There are no separate maintenance branches.
