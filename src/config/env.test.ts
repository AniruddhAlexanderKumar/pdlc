import { describe, expect, it } from "vitest";
import { envSchema, parseEnv } from "@/config/env";

const VALID_ENV = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/pdlc",
  LOG_LEVEL: "warn",
  NEXT_PUBLIC_APP_NAME: "PDLC Platform",
  SESSION_TTL_DAYS: "45",
};

describe("env schema", () => {
  it("accepts a fully-specified, valid environment", () => {
    const result = parseEnv(VALID_ENV);
    // SESSION_TTL_DAYS is coerced from its string form in the environment.
    expect(result).toEqual({ ...VALID_ENV, SESSION_TTL_DAYS: 45 });
  });

  it("applies documented defaults when optional variables are omitted", () => {
    const result = parseEnv({ DATABASE_URL: VALID_ENV.DATABASE_URL });
    expect(result.NODE_ENV).toBe("development");
    expect(result.LOG_LEVEL).toBe("info");
    expect(result.NEXT_PUBLIC_APP_NAME).toBe("PDLC Platform");
    // Sessions are never open-ended: a finite lifetime applies even unconfigured.
    expect(result.SESSION_TTL_DAYS).toBe(30);
  });

  it("rejects a non-positive or absurd session lifetime", () => {
    for (const value of ["0", "-5", "not-a-number", "4000"]) {
      const result = envSchema.safeParse({ ...VALID_ENV, SESSION_TTL_DAYS: value });
      expect(result.success).toBe(false);
    }
  });

  it("throws when the required DATABASE_URL is missing", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("throws when DATABASE_URL is present but not a valid connection string", () => {
    expect(() => parseEnv({ DATABASE_URL: "not-a-url" })).toThrow(/DATABASE_URL/);
  });

  it("rejects an unrecognized NODE_ENV value", () => {
    const result = envSchema.safeParse({
      ...VALID_ENV,
      NODE_ENV: "staging",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized LOG_LEVEL value", () => {
    const result = envSchema.safeParse({
      ...VALID_ENV,
      LOG_LEVEL: "verbose",
    });
    expect(result.success).toBe(false);
  });
});
