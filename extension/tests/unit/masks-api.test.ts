// The worker's two mask calls go where the rest of the vault API goes: Bearer only, no cookies.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/background/auth", () => ({ accessToken: async () => "pbl_test", refresh: async () => null }));

import { vaultApi } from "../../src/background/api";

afterEach(() => vi.unstubAllGlobals());

describe("vaultApi masks", () => {
  it("lists, creates and seals at /api/vault/masks with the Bearer and without cookies", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ masks: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await vaultApi.masks();
    await vaultApi.createMask({});
    await vaultApi.updateMask("m/1", { meta: "AQID" });
    expect(fetch.mock.calls.map(([url, init]) => [init?.method, url, init?.credentials, (init?.headers as Record<string, string>).Authorization, init?.body ?? null])).toEqual([
      ["GET", "https://vault.pabbel.com/api/vault/masks", "omit", "Bearer pbl_test", null],
      ["POST", "https://vault.pabbel.com/api/vault/masks", "omit", "Bearer pbl_test", "{}"],
      ["PUT", "https://vault.pabbel.com/api/vault/masks/m%2F1", "omit", "Bearer pbl_test", JSON.stringify({ meta: "AQID" })],
    ]);
  });
});
