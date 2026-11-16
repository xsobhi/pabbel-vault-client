import { describe, expect, it } from "vitest";
import { generateAesKeyBytes, importAesKey } from "./aead";
import { unb64 } from "./bytes";
import { MASK_LABEL_MAX, openMaskMeta, sealMaskMeta } from "./mask-meta";

const key = async () => importAesKey(await generateAesKeyBytes());
const A = "3f2b8c9e-1d4a-4b6f-9e0a-7c5d2e1f0a9b";
const B = "11111111-2222-4333-8444-555555555555";

describe("mask meta", () => {
  it("round-trips a label and a site under the personal key", async () => {
    const k = await key();
    const blob = await sealMaskMeta(k, A, { label: "  GitHub ", site: "GitHub.com" });
    expect(await openMaskMeta(k, A, blob)).toEqual({ label: "GitHub", site: "github.com" });
  });

  it("is the vault's envelope, and nothing readable is in it", async () => {
    const blob = (await sealMaskMeta(await key(), A, { label: "Netflix", site: "netflix.com" }))!;
    const bytes = unb64(blob);
    expect(bytes[0]).toBe(0x01);
    expect(new TextDecoder("latin1").decode(bytes)).not.toMatch(/netflix/i);
  });

  it("does not open on another mask (the id is in the AAD) or under another key", async () => {
    const k = await key();
    const blob = await sealMaskMeta(k, A, { label: "Shop" });
    expect(await openMaskMeta(k, B, blob)).toEqual({ broken: true });
    expect(await openMaskMeta(await key(), A, blob)).toEqual({ broken: true });
  });

  it("is nothing at all when there is nothing to say", async () => {
    const k = await key();
    expect(await sealMaskMeta(k, A, { label: "   ", site: "" })).toBeNull();
    expect(await openMaskMeta(k, A, null)).toEqual({});
  });

  it("keeps labels short and free of control and bidi characters", async () => {
    const k = await key();
    const blob = await sealMaskMeta(k, A, { label: `Shop‮gnp.exe ${"😀".repeat(MASK_LABEL_MAX)}` });
    const label = (await openMaskMeta(k, A, blob)).label!;
    expect(label.startsWith("Shopgnp.exe ")).toBe(true);
    expect(Array.from(label)).toHaveLength(MASK_LABEL_MAX);
  });
});
