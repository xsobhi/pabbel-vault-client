// Email masks in the worker, with the vault API mocked and a real personal
// key: which masks a site is offered (decided after opening their meta), what
// a new one sends, and what happens when the server says no.
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateAesKeyBytes, importAesKey } from "@vault/crypto/aead";
import { openMaskMeta, sealMaskMeta } from "@vault/crypto/mask-meta";

const api = vi.hoisted(() => ({ masks: vi.fn(), createMask: vi.fn(), updateMask: vi.fn() }));
const keyBox = vi.hoisted(() => ({ key: null as CryptoKey | null }));
vi.mock("../../src/background/api", () => {
  class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
  return { ApiError, vaultApi: api };
});
vi.mock("../../src/background/data", () => ({ readyData: async () => {}, vaults: () => [{ id: "p", kind: "personal", keyVersion: 1 }] }));
vi.mock("../../src/background/vault-keys", () => ({ openVaultKey: async () => keyBox.key }));

import { ApiError } from "../../src/background/api";
import { createMaskFor, forgetMasks, maskSiteOf, masksForSite, maskState } from "../../src/background/masks";
import { isMaskAddress } from "../../src/shared/masks";
import { installPsl, siteOf } from "../../src/shared/site";

beforeAll(async () => {
  installPsl(readFileSync(new URL("../../vendor/public_suffix_list.dat", import.meta.url), "utf8"));
  keyBox.key = await importAesKey(await generateAesKeyBytes());
});
beforeEach(() => { forgetMasks(); api.masks.mockReset(); api.createMask.mockReset(); api.updateMask.mockReset(); });

let n = 0;
async function mask(address: string, site: string | null, state = "active") {
  const id = `5f2b8c9e-1d4a-4b6f-9e0a-${String(++n).padStart(12, "0")}`;
  const meta = site ? await sealMaskMeta(keyBox.key!, id, { label: "x", site }) : null;
  return { id, address, meta, state, createdAt: "", lastReceivedAt: null, receivedCount: 0 };
}
const list = (...masks: unknown[]) => ({ masks, domains: ["fennda.com", "fennda.net"], defaultDomain: "fennda.com" });

describe("masks for a site", () => {
  it("offers the active masks whose sealed site is this registrable domain, on any of its hosts", async () => {
    const mine = await mask("a.b100@fennda.com", "github.com");
    api.masks.mockResolvedValue(list(mine, await mask("c.d101@fennda.net", "github.com", "paused"), await mask("e.f102@fennda.com", "gitlab.com"), await mask("g.h103@fennda.com", null)));
    expect(await masksForSite(siteOf("https://gist.github.com/signup")!)).toEqual([{ id: mine.id, address: "a.b100@fennda.com" }]);
  });

  it("does not trust meta moved onto another mask", async () => {
    const real = await mask("a.b100@fennda.com", "github.com");
    const other = await mask("c.d101@fennda.com", null);
    api.masks.mockResolvedValue(list({ ...other, meta: real.meta }));
    expect(await masksForSite(siteOf("https://github.com")!)).toEqual([]);
  });

  it("asks the server once a minute at most, and again after a lock", async () => {
    api.masks.mockResolvedValue(list());
    const site = siteOf("https://example.com")!;
    await masksForSite(site);
    await masksForSite(site);
    expect(api.masks).toHaveBeenCalledTimes(1);
    forgetMasks();
    await masksForSite(site);
    expect(api.masks).toHaveBeenCalledTimes(2);
  });

  it("is null - so nothing is offered - when masks cannot be read", async () => {
    api.masks.mockRejectedValue(new ApiError(404, "Not Found"));
    expect(await masksForSite(siteOf("https://example.com")!)).toBeNull();
  });
});

describe("a new mask", () => {
  it("asks for an address only, then seals the site's name and domain with the new id", async () => {
    api.createMask.mockResolvedValue({ ...(await mask("quiet.river7311@fennda.com", null)), id: "5f2b8c9e-1d4a-4b6f-9e0a-7c5d2e1f0001" });
    api.updateMask.mockImplementation(async (id: string, b: { meta: string }) => ({ id, address: "quiet.river7311@fennda.com", meta: b.meta, state: "active" }));
    expect(await createMaskFor(siteOf("https://github.com/signup")!, [])).toEqual({ address: "quiet.river7311@fennda.com" });
    expect(api.createMask).toHaveBeenCalledWith({});
    const [id, body] = api.updateMask.mock.calls[0];
    expect(atob(body.meta)).not.toMatch(/github/i);
    expect(await openMaskMeta(keyBox.key!, id, body.meta)).toEqual({ label: "GitHub", site: "github.com" });
  });

  it("joins the cached list, so the site offers it next time without asking", async () => {
    api.masks.mockResolvedValue(list());
    const site = siteOf("https://example.com")!;
    await masksForSite(site);
    const made = await mask("new.one1000@fennda.com", null);
    api.createMask.mockResolvedValue(made);
    api.updateMask.mockImplementation(async (_id: string, b: { meta: string }) => ({ ...made, meta: b.meta }));
    await createMaskFor(site, []);
    expect(await masksForSite(site)).toEqual([{ id: made.id, address: "new.one1000@fennda.com" }]);
    expect(api.masks).toHaveBeenCalledTimes(1);
  });

  it("still hands over a working address when sealing its meta fails", async () => {
    api.createMask.mockResolvedValue(await mask("plain.one1001@fennda.com", null));
    api.updateMask.mockRejectedValue(new ApiError(500, "down"));
    expect(await createMaskFor(siteOf("https://example.com")!, [])).toEqual({ address: "plain.one1001@fennda.com" });
  });

  it("records no site for a loopback or IP address", () => {
    expect(maskSiteOf(siteOf("http://localhost:3000")!)).toBeUndefined();
    expect(maskSiteOf(siteOf("https://192.168.1.4")!)).toBeUndefined();
    expect(maskSiteOf(siteOf("https://a.b.example.co.uk")!)).toBe("example.co.uk");
  });

  it("says when a limit was hit, and fails plainly otherwise", async () => {
    api.createMask.mockRejectedValue(new ApiError(429, "Too many"));
    expect(await createMaskFor(siteOf("https://example.com")!, [])).toEqual({ error: "rate" });
    api.createMask.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await createMaskFor(siteOf("https://example.com")!, [])).toEqual({ error: "failed" });
  });
});

describe("mask state for the popup", () => {
  it("knows only mask-domain addresses, and only this account's", async () => {
    api.masks.mockResolvedValue(list(await mask("a.b100@fennda.com", null, "paused")));
    expect(await maskState("A.B100@Fennda.com")).toBe("paused");
    expect(await maskState("someone.else100@fennda.com")).toBeNull();
    expect(await maskState("ada@pabbel.com")).toBeNull();
    expect(isMaskAddress("quiet.river7311@fennda.net.evil.io")).toBe(false);
  });
});
