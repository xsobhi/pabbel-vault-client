import { describe, expect, it } from "vitest";
import { generatePassword } from "./generator";

describe("generatePassword", () => {
  it("has the asked length (clamped to 8..128) and every enabled class", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword({ length: 24 });
      expect(p).toHaveLength(24);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[2-9]/);
      expect(p).toMatch(/[!@#$%^&*\-_=+?]/);
    }
    expect(generatePassword(1)).toHaveLength(8);
    expect(generatePassword(999)).toHaveLength(128);
  });
  it("leaves out ambiguous glyphs and honours switched-off classes", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword({ length: 40, uppercase: false, symbols: false, numbers: false });
      expect(p).toMatch(/^[a-z]+$/);
      expect(p).not.toMatch(/[l10O]/);
    }
  });
  it("does not repeat", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
