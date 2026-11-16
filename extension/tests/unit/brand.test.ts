import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { installPsl, siteOf, siteOfItemUrl } from "../../src/shared/site";
import { siteName } from "../../src/shared/brand";
import { iconLinks, isPublicHost } from "../../src/shared/favicon";
import { displayName, summaries } from "../../src/background/item-views";
import type { Item, ItemData } from "../../src/shared/items";

beforeAll(() => installPsl(readFileSync(new URL("../../vendor/public_suffix_list.dat", import.meta.url), "utf8")));

const named = (url: string, pageNames?: string[]) => siteName(siteOf(url)!, pageNames);
const login = (name: string, url: string): ItemData => ({ t: "login", name, username: "ada", password: "pw", url, notes: "" });
const item = (id: string, data: ItemData): Item => ({ id, vaultId: "v", type: data.t, data, createdAt: "", updatedAt: "" });

describe("site names", () => {
  it("knows names with their own spelling, on any subdomain or country", () => {
    expect(named("https://accounts.google.com/signin")).toBe("Google");
    expect(named("https://www.google.co.uk")).toBe("Google");
    expect(named("https://github.com/login")).toBe("GitHub");
    expect(named("https://login.live.com")).toBe("Microsoft");
    expect(named("https://x.com/i/flow/login")).toBe("X");
    expect(named("https://www.bbc.co.uk")).toBe("BBC");
  });
  it("capitalises the rest, and splits hyphens", () => {
    expect(named("https://shop.northwind.io")).toBe("Northwind");
    expect(named("https://my-corner-bank.com")).toBe("My Corner Bank");
  });
  it("takes the page's spelling only when it spells the same word", () => {
    expect(named("https://acmecorp.com", ["Sign in", "AcmeCorp"])).toBe("AcmeCorp");
    expect(named("https://stripeish.dev", ["Stripe-ish"])).toBe("Stripe-ish");
    expect(named("https://g00gle.com", ["Google"])).toBe("G00gle");
    expect(named("https://evil.example.com", ["PayPal", "Your Bank"])).toBe("Example");
  });
  it("does not dress up addresses", () => {
    expect(named("http://localhost:3000")).toBe("localhost");
    expect(named("https://192.168.1.1")).toBe("192.168.1.1");
  });
});

describe("older items", () => {
  it("reads a login named after its domain as the brand, and leaves real names alone", () => {
    expect(displayName(login("google.com", "https://accounts.google.com"))).toBe("Google");
    expect(displayName(login("accounts.google.com", "https://accounts.google.com"))).toBe("Google");
    expect(displayName(login("Work Google", "https://accounts.google.com"))).toBe("Work Google");
    expect(displayName(login("my notes", ""))).toBe("my notes");
  });
  it("gives each row its icon, and a code the icon of its login", () => {
    const code: ItemData = { t: "totp", name: "GitHub", issuer: "GitHub", account: "ada", secret: "x", algorithm: "SHA1", digits: 6, period: 30 };
    const [a, b, c] = summaries([item("1", login("x", "https://github.com/login")), item("2", code), item("3", { t: "note", name: "n", body: "" })]);
    expect(a.iconKey).toBe("https://github.com");
    expect(b.iconKey).toBe("https://github.com");
    expect(c.iconKey).toBeUndefined();
    expect(siteOfItemUrl("github.com")?.origin).toBe("https://github.com");
  });
});

describe("icons", () => {
  it("never contacts a private address", () => {
    for (const host of ["192.168.1.1", "localhost", "nas.local", "router.lan", "printer", "wiki.corp", "[::1]"]) expect(isPublicHost(host)).toBe(false);
    expect(isPublicHost("accounts.google.com")).toBe(true);
  });
  it("reads a page's links, biggest first, https only", () => {
    const html = `<head><link rel="stylesheet" href="/a.css"><link rel="icon" sizes="16x16" href="/s.png"><link href='/big.png' sizes='192x192' rel='icon'>
      <link rel="apple-touch-icon" href="/t.png"><link rel="mask-icon" href="/m.svg"><link rel="icon" href="http://x.com/no.png"><link rel="shortcut icon" href="/v.svg"></head>`;
    expect(iconLinks(html, "https://site.com/")).toEqual(["https://site.com/v.svg", "https://site.com/big.png", "https://site.com/s.png"]);
    expect(iconLinks("<p>nothing</p>", "https://site.com/")).toEqual([]);
  });
});
