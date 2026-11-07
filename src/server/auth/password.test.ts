// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, verifyPasswordSafely } from "./password";

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

describe("verifyPasswordSafely — closing the sign-in timing side channel", () => {
  it("still verifies a real hash correctly, both ways", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(await verifyPasswordSafely(hash, PASSWORD)).toBe(true);
    expect(await verifyPasswordSafely(hash, "wrong password entirely")).toBe(false);
  });

  it("never succeeds when there is no hash to check against", async () => {
    expect(await verifyPasswordSafely(undefined, PASSWORD)).toBe(false);
    expect(await verifyPasswordSafely(undefined, "")).toBe(false);
  });

  it(
    "spends roughly the same time whether or not an account exists",
    async () => {
      const hash = await hashPassword(PASSWORD);

      // Warm the lazily-computed decoy hash before timing either path, so
      // its one-time cost cannot land inside the "no account" measurement.
      await verifyPasswordSafely(undefined, "warm-up");

      const time = async (thunk: () => Promise<unknown>) => {
        const start = performance.now();
        await thunk();
        return performance.now() - start;
      };

      const withAccount = await time(() => verifyPasswordSafely(hash, "wrong password"));
      const withoutAccount = await time(() => verifyPasswordSafely(undefined, "wrong password"));

      // Not asserting near-equality to the millisecond — CI/dev machines are
      // too noisy for that. What this must rule out is the *structural* gap
      // the vulnerability actually was: an account that exists costing a
      // full extra Argon2id pass (tens of ms) versus one that does not
      // costing none. A generous 4x ratio budget catches that class of bug
      // while tolerating ordinary scheduling jitter.
      const slower = Math.max(withAccount, withoutAccount);
      const faster = Math.max(Math.min(withAccount, withoutAccount), 1);
      expect(slower / faster).toBeLessThan(4);
    },
    // Several real Argon2id passes; generous relative to the default.
    10_000,
  );
});
