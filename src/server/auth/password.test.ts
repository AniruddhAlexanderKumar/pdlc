// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

const PASSWORD = "correct horse battery staple";

describe("password hashing", () => {
  it("never returns the plaintext password", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(hash).not.toBe(PASSWORD);
    expect(hash).not.toContain(PASSWORD);
    // Argon2id PHC string, carrying algorithm and parameters with the hash.
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it("salts each hash, so the same password hashes differently every time", async () => {
    const [first, second] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);

    expect(first).not.toBe(second);
    // Both still verify — the salt lives in the encoded hash.
    expect(await verifyPassword(first, PASSWORD)).toBe(true);
    expect(await verifyPassword(second, PASSWORD)).toBe(true);
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword(hash, PASSWORD)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(await verifyPassword(hash, "wrong password entirely")).toBe(false);
    // Near misses fail too: no prefix or case-insensitive matching.
    expect(await verifyPassword(hash, PASSWORD.slice(0, -1))).toBe(false);
    expect(await verifyPassword(hash, PASSWORD.toUpperCase())).toBe(false);
    expect(await verifyPassword(hash, "")).toBe(false);
  });

  it("treats a malformed stored hash as a failed verification, not an exception", async () => {
    // A corrupt credential row must read as "wrong password", not a 500 that
    // tells an attacker something unusual happened.
    await expect(verifyPassword("not-a-valid-argon2-hash", PASSWORD)).resolves.toBe(false);
    await expect(verifyPassword("", PASSWORD)).resolves.toBe(false);
  });
});
