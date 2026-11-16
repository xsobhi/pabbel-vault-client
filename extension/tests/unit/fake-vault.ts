/**
 * Just enough browser and server for the worker's trust and password code:
 * chrome.storage (local + session) in memory, and a fetch that answers the
 * vault API the way the server does - including its refusals (a revoked,
 * expired or pre-password-change browser gets a 410). The account is built
 * with the real crypto, so what the worker decrypts is what Android and the
 * web vault would.
 */
import { encrypt, generateAesKeyBytes } from "@vault/crypto/aead";
import { b64, random, unb64 } from "@vault/crypto/bytes";
import { hkdf } from "@vault/crypto/hkdf";
import { PROOF_INFO } from "@vault/crypto/key-proof";
import { deriveMasterKey, makeMkCheck } from "@vault/crypto/kdf";
import { aad, generateAccountKeys, wrapPrivateKey } from "@vault/crypto/keys";
import { newRecoveryKey, recoveryFields } from "@vault/crypto/recovery";

export const PASSWORD = "correct horse battery";
export const USER = { id: 7, email: "ada@example.com", name: "Ada" };

type Area = Map<string, unknown>;
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
function area(m: Area) {
  return {
    get: async (k: string) => (m.has(k) ? { [k]: clone(m.get(k)) } : {}),
    set: async (o: Record<string, unknown>) => { for (const [k, v] of Object.entries(o)) m.set(k, clone(v)); },
    remove: async (keys: string | string[]) => { for (const k of ([] as string[]).concat(keys)) m.delete(k); },
    onChanged: { addListener() {}, removeListener() {} },
  };
}

export function installChrome(): { local: Area; session: Area } {
  const local: Area = new Map(), session: Area = new Map();
  (globalThis as Record<string, unknown>).chrome = {
    storage: { local: area(local), session: area(session) },
    alarms: { create: async () => {}, clear: async () => true },
    runtime: { id: "test", getURL: (p: string) => `chrome-extension://test/${p}` },
    identity: { getRedirectURL: () => "https://test.chromiumapp.org/oauth" },
    i18n: { getMessage: (k: string) => k, getUILanguage: () => "en" },
  };
  local.set("pv.auth", { accessToken: "pbl_test", refreshToken: null, expiresAt: null, user: USER });
  return { local, session };
}

interface Device { share: string; createdAt: number; expiresAt: number; revoked: boolean }

/** An account with one personal vault and (optionally) a recovery key, served over a fake fetch. */
export async function fakeVault(opts: { recovery?: boolean } = {}) {
  const kdf = { salt: b64(random(16)), iterations: 1000 }; // low count: tests, not security
  const mk = await deriveMasterKey(PASSWORD, kdf, true);
  const keys = await generateAccountKeys();
  const vk = await generateAesKeyBytes();
  const rk = newRecoveryKey();
  const s = {
    me: {
      setUp: true, kdf, publicKey: keys.publicRaw, fingerprint: keys.fingerprint,
      encPrivateKey: await wrapPrivateKey(mk, keys.privateKey), mkCheck: await makeMkCheck(mk),
      recovery: opts.recovery ? { ...(await recoveryFields(mk, rk)), createdAt: null } : null,
    } as Record<string, unknown>,
    personal: { id: "pv-1", kind: "personal", name: "Personal", role: "owner", keyVersion: 1, wrappedKey: await encrypt(mk, vk, aad.personalVaultKey("pv-1")), memberKeyVersion: 1, memberCount: 1, itemCount: 0 },
    devices: new Map<string, Device>(),
    passwordChangedAt: Date.now() - 60_000,
    requests: [] as { method: string; path: string; body: unknown }[],
    offline: false,
    failPassword: false,
    refreshRefused: false,
  };
  let nextId = 1;
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  // Key proof, as backend vault-key-proof.ts checks it: ECDH from the ephemeral end against the account key, once.
  const challenges = new Map<string, CryptoKey>();
  async function proves(p: { challenge?: string; proof?: string } | undefined): Promise<boolean> {
    const eph = p?.challenge ? challenges.get(p.challenge) : undefined;
    if (!eph) return false;
    challenges.delete(p!.challenge!);
    const pub = await crypto.subtle.importKey("raw", unb64(s.me.publicKey as string) as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, eph, 256));
    return b64(await hkdf(shared, PROOF_INFO)) === p!.proof;
  }

  async function route(method: string, path: string, body: any): Promise<Response> {
    if (method === "GET" && path === "/me") return reply(200, s.me);
    if (method === "GET" && path === "/vaults") return reply(200, [s.personal]);
    if (method === "GET" && /^\/vaults\/[^/]+\/items$/.test(path)) return reply(200, { keyVersion: 1, items: [] });
    if (method === "POST" && path === "/api/oauth/token") return s.refreshRefused ? reply(400, { error: "invalid_grant" }) : reply(500, {});
    if (method === "POST" && path === "/devices") {
      if (body?.currentMkCheck !== s.me.mkCheck) return reply(409, { code: "STALE_KEY" });
      const id = `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
      const d: Device = { share: b64(random(32)), createdAt: Date.now(), expiresAt: Date.now() + 30 * 86_400_000, revoked: false };
      s.devices.set(id, d);
      return reply(201, { id, share: d.share, expiresAt: new Date(d.expiresAt).toISOString() });
    }
    const unlock = /^\/devices\/([^/]+)\/unlock$/.exec(path);
    if (method === "POST" && unlock) {
      const d = s.devices.get(decodeURIComponent(unlock[1]));
      if (!d) return reply(404, { code: "DEVICE_UNKNOWN" });
      if (d.revoked || d.createdAt < s.passwordChangedAt) { d.revoked = true; return reply(410, { code: "DEVICE_REVOKED" }); }
      if (d.expiresAt <= Date.now()) { d.revoked = true; return reply(410, { code: "DEVICE_EXPIRED" }); }
      return reply(200, { share: d.share, expiresAt: new Date(d.expiresAt).toISOString() });
    }
    const del = /^\/devices\/([^/]+)$/.exec(path);
    if (method === "DELETE" && del) {
      const d = s.devices.get(decodeURIComponent(del[1]));
      if (!d || d.revoked) return reply(404, { code: "DEVICE_UNKNOWN" });
      d.revoked = true;
      return reply(200, { ok: true });
    }
    if (method === "POST" && path === "/key-proof") {
      const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
      const challenge = `c${nextId++}.${Math.floor(Date.now() / 1000) + 300}`;
      challenges.set(challenge, eph.privateKey);
      return reply(200, { challenge, publicKey: b64(new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey))) });
    }
    if (method === "POST" && path === "/password") {
      if (s.failPassword) return reply(500, { error: "boom" });
      // A session alone (no proof) would have to pass the erase step-up, which this client never sends.
      if (!(await proves(body.keyProof))) return reply(403, { code: "WRONG_ACCOUNT_PASSWORD" });
      if (body.currentMkCheck && body.currentMkCheck !== s.me.mkCheck) return reply(409, { code: "STALE_KEY" });
      s.me = { ...s.me, kdf: { salt: body.salt, iterations: body.iterations }, encPrivateKey: body.encPrivateKey, mkCheck: body.mkCheck,
        recovery: body.recovery ? { ...body.recovery, createdAt: null } : null };
      s.personal = { ...s.personal, wrappedKey: body.personalKeys.find((p: { vaultId: string }) => p.vaultId === "pv-1").encKey };
      s.passwordChangedAt = Date.now() + 1; // like the backend: every trusted browser is revoked
      for (const d of s.devices.values()) d.revoked = true;
      return reply(200, { ok: true });
    }
    return reply(404, { error: `no route ${method} ${path}` });
  }

  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    if (s.offline) throw new TypeError("fetch failed");
    const method = init.method ?? "GET";
    const path = new URL(url).pathname.replace(/^\/api\/vault/, "");
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    s.requests.push({ method, path, body });
    return route(method, path, body);
  }) as typeof fetch;

  return { s, mk, vk, rk, keys };
}

export const rawOf = async (k: CryptoKey) => b64(new Uint8Array(await crypto.subtle.exportKey("raw", k)));
