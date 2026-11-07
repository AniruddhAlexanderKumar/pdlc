// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";

function reference(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Stored basis fingerprints were written by `node:crypto`; if this ever
 * disagreed with it by a single bit, every stored fingerprint would read as
 * "changed since it was checked". So the oracle here is node:crypto itself,
 * across every padding boundary and encoding case that could go wrong.
 */
describe("sha256Hex", () => {
  it("matches the published test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("matches node:crypto at every length around the 64-byte block and padding boundaries", () => {
    for (let length = 0; length <= 200; length++) {
      const input = "x".repeat(length);
      expect(sha256Hex(input), `length ${length}`).toBe(reference(input));
    }
  });

  it("matches node:crypto for multi-byte UTF-8, emoji and a lone surrogate", () => {
    for (const input of ["Ω", "naïve café", "日本語の要件", "🚀 thrust ≥ 450 kN", "\uD800", "a\nb\n", "\u0000"]) {
      expect(sha256Hex(input), JSON.stringify(input)).toBe(reference(input));
    }
  });

  it("matches node:crypto for a long, realistic fingerprint input", () => {
    const parts = Array.from({ length: 500 }, (_, i) => `requirement:REQ-${i}=APPROVED@rev${i % 7}`);
    const input = [...parts].sort().join("\n");
    expect(sha256Hex(input)).toBe(reference(input));
  });
});
