import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { installPsl, siteOf, siteOfItemUrl, frameMayFill, brandLabel } from "../../src/shared/site";
import { matchesFor, bestLogin, codeForLogin, issuerMatches } from "../../src/shared/match";
import type { Item } from "../../src/shared/items";

beforeAll(() => installPsl(readFileSync(new URL("../../vendor/public_suffix_list.dat", import.meta.url), "utf8")));

const login = (id: string, url: string, username = "ada", pinned = false, updatedAt = "2026-01-01"): Item =>
  ({ id, vaultId: "v", type: "login", createdAt: updatedAt, updatedAt, data: { t: "login", name: id, username, password: "pw", url, notes: "", pinned } });
const code = (id: string, issuer: string, account = ""): Item =>
  ({ id, vaultId: "v", type: "totp", createdAt: "", updatedAt: "2026-01-01", data: { t: "totp", name: issuer, issuer, account, secret: "JBSWY3DPEHPK3PXP", algorithm: "SHA1", digits: 6, period: 30 } });

describe("sites", () => {
  it("reduces hosts to their registrable domain", () => {
    expect(siteOf("https://accounts.google.com/x")?.site).toBe("google.com");
    expect(siteOf("https://www.bbc.co.uk")?.site).toBe("bbc.co.uk");
    expect(siteOf("https://bob.github.io")?.site).toBe("bob.github.io");
    expect(siteOf("ftp://example.com")).toBeNull();
  });
  it("accepts item URLs as people type them", () => {
    expect(siteOfItemUrl("github.com")?.site).toBe("github.com");
    expect(siteOfItemUrl("https://login.example.com/path")?.site).toBe("example.com");
    expect(siteOfItemUrl("")).toBeNull();
  });
  it("marks only https and loopback http as secure", () => {
    expect(siteOf("https://a.com")?.secure).toBe(true);
    expect(siteOf("http://a.com")?.secure).toBe(false);
    expect(siteOf("http://localhost:3000")?.secure).toBe(true);
    expect(siteOf("http://127.0.0.1:8080")?.secure).toBe(true);
  });
  it("never lets a cross-site or insecure frame fill", () => {
    expect(frameMayFill("https://auth.example.com/f", "https://www.example.com/")).not.toBeNull();
    expect(frameMayFill("https://evil.other.net/f", "https://www.example.com/")).toBeNull();
    expect(frameMayFill("http://www.example.com/", "http://www.example.com/")).toBeNull();
    expect(frameMayFill("https://www.example.com/", "http://www.example.com/")).toBeNull();
    expect(frameMayFill("https://alice.github.io/", "https://bob.github.io/")).toBeNull();
  });
  it("finds the brand label", () => {
    expect(brandLabel(siteOf("https://github.com")!)).toBe("github");
    expect(brandLabel(siteOf("https://aws.amazon.co.uk")!)).toBe("amazon");
  });
});

describe("matching", () => {
  const items = [
    login("gh", "https://github.com/login", "ada"), login("ghpin", "github.com", "bob", true),
    login("gl", "gitlab.com"), login("io", "https://alice.github.io"),
    code("ghcode", "GitHub", "ada"), code("aws", "Amazon Web Services"), code("acct", "Something", "bob"), code("x", "Other"),
  ];
  it("matches logins by registrable domain, pinned first", () => {
    const m = matchesFor(items, siteOf("https://gist.github.com/")!);
    expect(m.logins.map((i) => i.id)).toEqual(["ghpin", "gh"]);
  });
  it("matches codes by issuer or by a matching login's username", () => {
    expect(matchesFor(items, siteOf("https://github.com/")!).totps.map((i) => i.id).sort()).toEqual(["acct", "ghcode"]);
    expect(matchesFor(items, siteOf("https://signin.aws.amazon.com/")!).totps.map((i) => i.id)).toEqual(["aws"]);
  });
  it("issuer matching needs a real overlap", () => {
    expect(issuerMatches("Go", siteOf("https://google.com")!)).toBe(false);
    expect(issuerMatches("Google", siteOf("https://accounts.google.com")!)).toBe(true);
  });
  it("prefers the login whose username was typed", () => {
    const m = matchesFor(items, siteOf("https://github.com/")!);
    expect(bestLogin(m.logins, "ADA")?.id).toBe("gh");
    expect(bestLogin(m.logins)?.id).toBe("ghpin");
  });
});

describe("the code typed by itself after a password", () => {
  const pick = (items: Item[], loginId: string) => {
    const m = matchesFor(items, siteOf("https://github.com/")!);
    return codeForLogin(m, m.logins.find((l) => l.id === loginId)!)?.id ?? null;
  };
  it("is the one code whose account is the login's username", () => {
    const items = [login("ada", "github.com", "Ada"), login("bob", "github.com", "bob"), code("c-ada", "GitHub", "ada "), code("c-bob", "GitHub", "bob")];
    expect(pick(items, "ada")).toBe("c-ada");
    expect(pick(items, "bob")).toBe("c-bob");
  });
  it("is nothing when two codes claim the same account", () => {
    expect(pick([login("ada", "github.com", "ada"), code("c1", "GitHub", "ada"), code("c2", "GitHub", "ada")], "ada")).toBeNull();
  });
  it("falls back to the site's only code, but never to two", () => {
    expect(pick([login("ada", "github.com", "ada@x.com"), code("c", "GitHub", "ada-gh")], "ada")).toBe("c");
    expect(pick([login("ada", "github.com", ""), code("c", "GitHub")], "ada")).toBe("c");
    expect(pick([login("ada", "github.com", "ada@x.com"), code("w", "GitHub", "work"), code("p", "GitHub", "home")], "ada")).toBeNull();
  });
  it("never takes another login's code", () => {
    expect(pick([login("ada", "github.com", "ada"), login("bob", "github.com", "bob"), code("c-bob", "Something", "bob")], "ada")).toBeNull();
  });
  it("is nothing when no code matches the site", () => {
    expect(pick([login("ada", "github.com", "ada"), code("x", "Other", "someone")], "ada")).toBeNull();
  });
});
