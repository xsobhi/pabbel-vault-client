// The worker's side of the code step: what it remembers after a password went in,
// and who may collect the code. chrome.storage.session is a Map; the vault's
// decrypted items, the lock and the settings are stand-ins the tests set.
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { totp } from "@vault/crypto/totp";
import type { Item } from "../../src/shared/items";
import { installPsl } from "../../src/shared/site";

const state = vi.hoisted(() => ({ unlocked: true, typeTotp: true, items: [] as Item[], reads: [] as string[] }));
vi.mock("../../src/background/data", () => ({
  allItems: () => state.items,
  ensureData: async () => {},
  itemById: (id: string) => state.items.find((i) => i.id === id),
}));
vi.mock("../../src/background/session", () => ({ getKeys: async () => (state.unlocked ? {} : null) }));
vi.mock("../../src/background/settings", () => ({ getSettings: async () => ({ typeTotp: state.typeTotp }) }));
vi.mock("../../src/background/writes", () => ({ recordRead: (id: string, what: string) => void state.reads.push(`${what}:${id}`) }));
vi.mock("../../src/background/fill", async () => {
  const { frameMayFill } = await import("../../src/shared/site");
  const { totp: code } = await import("@vault/crypto/totp");
  return {
    senderSite: (s: chrome.runtime.MessageSender) => frameMayFill(s.url, s.tab?.url),
    codeOf: async (d: { secret: string; period: number }) => (await code(d)).code,
  };
});
import { codeStep, codeWaitMs, passwordFilled } from "../../src/background/code-step";
import { stepFits } from "../../src/background/tab-steps";

const store = new Map<string, unknown>();
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: { session: {
    get: async (k: string) => (store.has(k) ? { [k]: structuredClone(store.get(k)) } : {}),
    set: async (o: Record<string, unknown>) => { for (const [k, v] of Object.entries(o)) store.set(k, structuredClone(v)); },
    remove: async (ks: string | string[]) => { for (const k of [ks].flat()) store.delete(k); },
  } },
};

const SECRET = "JBSWY3DPEHPK3PXP";
const login = (id: string, url: string, username: string): Item =>
  ({ id, vaultId: "v", type: "login", createdAt: "", updatedAt: "2026-01-01", data: { t: "login", name: id, username, password: `pw-${id}`, url, notes: "" } });
const code = (id: string, issuer: string, account: string): Item =>
  ({ id, vaultId: "v", type: "totp", createdAt: "", updatedAt: "2026-01-01", data: { t: "totp", name: issuer, issuer, account, secret: SECRET, algorithm: "SHA1", digits: 6, period: 30 } });
const from = (tabId: number, url = "https://login.pvtest.com/code") =>
  ({ id: "ext", frameId: 0, url, tab: { id: tabId, url } }) as unknown as chrome.runtime.MessageSender;
const held = () => (store.get("pv.codeStep") ?? {}) as Record<string, { id: string; site: string; at: number }>;
const now = (at: number) => totp({ secret: SECRET }, at).then((r) => r.code);

// 10 seconds into a 30-second period: no wait unless a test moves the clock.
const MID = Date.UTC(2026, 10, 2, 12, 0, 10);

beforeAll(() => installPsl(readFileSync(new URL("../../vendor/public_suffix_list.dat", import.meta.url), "utf8")));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(MID);
  store.clear();
  Object.assign(state, { unlocked: true, typeTotp: true, reads: [] });
  state.items = [login("main", "https://login.pvtest.com", "ada@pvtest.com"), login("old", "pvtest.com", "old@pvtest.com"),
    login("other", "https://evil.pvother.net", "victim@pvother.net"), code("c", "PVTest", "ada@pvtest.com")];
});
afterEach(() => vi.useRealTimers());

describe("after a password went in", () => {
  it("remembers the login's code by id - never the secret, never the password - for that tab and site", async () => {
    await passwordFilled(from(7), "main");
    expect(held()["7"]).toEqual({ id: "c", site: "pvtest.com", at: MID });
    expect(JSON.stringify(held())).not.toMatch(new RegExp(`${SECRET}|pw-main`));
  });
  it("remembers nothing when the login has no code of its own (the only one is another login's)", async () => {
    await passwordFilled(from(7), "old");
    expect(held()["7"]).toBeUndefined();
  });
  it("a later fill without a code drops the step waiting in that tab", async () => {
    await passwordFilled(from(7), "main");
    await passwordFilled(from(7), "old");
    expect(held()["7"]).toBeUndefined();
  });
  it("remembers nothing for a login that does not belong to the page's site", async () => {
    await passwordFilled(from(7), "other");
    expect(held()["7"]).toBeUndefined();
  });
  it("remembers nothing when the setting is off or the vault is locked", async () => {
    state.typeTotp = false;
    await passwordFilled(from(7), "main");
    state.typeTotp = true;
    state.unlocked = false;
    await passwordFilled(from(7), "main");
    expect(held()["7"]).toBeUndefined();
  });
});

describe("an empty code field asks", () => {
  it("gets the current code in that tab on that site, once", async () => {
    await passwordFilled(from(7), "main");
    expect(await codeStep(from(7, "https://www.pvtest.com/2fa"))).toEqual({ code: await now(MID) });
    expect(await codeStep(from(7))).toBeNull();
    expect(state.reads).toEqual(["code:c"]);
  });
  it("gets nothing in another tab, and the right tab still can", async () => {
    await passwordFilled(from(7), "main");
    expect(await codeStep(from(8))).toBeNull();
    expect((await codeStep(from(7)))?.code).toBe(await now(MID));
  });
  it("gets nothing on another site, and that visit ends the step", async () => {
    await passwordFilled(from(7), "main");
    expect(await codeStep(from(7, "https://evil.pvother.net/code"))).toBeNull();
    expect(await codeStep(from(7))).toBeNull();
  });
  it("gets nothing after two minutes", async () => {
    await passwordFilled(from(7), "main");
    vi.setSystemTime(MID + 2 * 60 * 1000 + 1);
    expect(await codeStep(from(7))).toBeNull();
  });
  it("gets nothing when the vault locked or the setting went off in between", async () => {
    await passwordFilled(from(7), "main");
    state.unlocked = false;
    expect(await codeStep(from(7))).toBeNull();
    state.unlocked = true;
    await passwordFilled(from(7), "main");
    state.typeTotp = false;
    expect(await codeStep(from(7))).toBeNull();
    expect(state.reads).toEqual([]);
  });
  it("gets nothing when the code item has gone from the vault", async () => {
    await passwordFilled(from(7), "main");
    state.items = state.items.filter((i) => i.id !== "c");
    expect(await codeStep(from(7))).toBeNull();
  });
  it("two frames asking at once: only one gets the code", async () => {
    await passwordFilled(from(7), "main");
    const both = await Promise.all([codeStep(from(7)), codeStep(from(7, "https://auth.pvtest.com/f"))]);
    expect(both.filter(Boolean)).toHaveLength(1);
  });
  it("with 3 seconds or less left, waits for the next period and types that code", async () => {
    const boundary = Date.UTC(2026, 10, 2, 12, 0, 30);
    vi.setSystemTime(boundary - 2500);
    await passwordFilled(from(7), "main");
    const answer = codeStep(from(7));
    await vi.advanceTimersByTimeAsync(2000);
    expect(state.reads).toEqual([]); // still waiting: the old code would have had half a second left
    await vi.advanceTimersByTimeAsync(1000);
    const got = await answer;
    expect(Date.now()).toBeGreaterThan(boundary);
    expect(got?.code).toBe(await now(boundary + 1));
    expect(got?.code).not.toBe(await now(boundary - 2500));
  });
});

describe("timing rules", () => {
  it("waits only when 3 seconds or less are left, until just past the next period", () => {
    const start = Date.UTC(2026, 0, 1);
    expect(codeWaitMs(30, start + 26_000)).toBe(0);
    expect(codeWaitMs(30, start + 27_000)).toBe(3_250);
    expect(codeWaitMs(30, start + 29_999)).toBe(251);
    expect(codeWaitMs(60, start + 30_000)).toBe(0);
    expect(codeWaitMs(0, start + 28_000)).toBe(2_250);
  });
  it("a step fits only its own site, within two minutes", () => {
    const step = { id: "c", site: "pvtest.com", at: 1_000 };
    expect(stepFits(step, "pvtest.com", 1_000 + 120_000)).toBe(true);
    expect(stepFits(step, "pvtest.com", 1_000 + 120_001)).toBe(false);
    expect(stepFits(step, "pvother.net", 2_000)).toBe(false);
  });
});
