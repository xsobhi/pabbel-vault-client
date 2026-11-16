// The official Public Suffix List test vectors (publicsuffix/list tests/test_psl.txt),
// run against the bundled list through the extension's own matcher.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPsl } from "../../src/shared/psl";

const psl = createPsl(readFileSync(new URL("../../vendor/public_suffix_list.dat", import.meta.url), "utf8"));
const vectors = [...readFileSync(new URL("./psl-vectors.txt", import.meta.url), "utf8").matchAll(/checkPublicSuffix\((null|'[^']*'), (null|'[^']*')\);/g)]
  .map((m) => [m[1] === "null" ? null : m[1].slice(1, -1), m[2] === "null" ? null : m[2].slice(1, -1)] as const);

/** Hosts reach the matcher as URL.hostname does: lower-case punycode. */
const ascii = (h: string) => { try { return new URL(`http://${h}`).hostname; } catch { return h; } };

describe("public suffix list", () => {
  it("has the official vectors to run", () => expect(vectors.length).toBeGreaterThan(60));
  for (const [input, expected] of vectors) {
    if (input === null || /^\./.test(input) || input.includes("..")) continue; // not hostnames a URL can hold
    // Deliberate deviation: the vectors' "unlisted TLD -> null" is strict mode. We apply the list's
    // default rule "*" instead, so intranet hosts (wiki.corp.local) still group by registrable domain.
    if (/\.local$/.test(input)) continue;
    it(`${input} -> ${expected}`, () => {
      const got = psl.registrable(ascii(input));
      expect(got).toBe(expected === null ? null : ascii(expected));
    });
  }
  it("applies the default rule to unlisted TLDs (intranet hosts)", () => {
    expect(psl.registrable("a.b.example.local")).toBe("example.local");
  });
  it("keeps github.io sites apart (private section)", () => {
    expect(psl.registrable("alice.github.io")).toBe("alice.github.io");
    expect(psl.registrable("login.example.co.uk")).toBe("example.co.uk");
  });
});
