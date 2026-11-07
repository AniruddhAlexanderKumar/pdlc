// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one property `auth.route.test.ts` does not cover: that `secure` is
 * actually environment-dependent, not just present-or-absent. A cookie
 * issued in production without `secure` would ride over plain HTTP on any
 * misconfigured hop in front of the app — this is the test that would catch
 * that regression.
 */

const cookieStore = { set: vi.fn(), get: vi.fn() };

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

// A mutable mock: cookies.ts reads `env.NODE_ENV` fresh on every call, so
// reassigning this object's property between tests (rather than re-mocking
// the module) is enough to exercise both environments in one file.
const mockEnv = { NODE_ENV: "development" as "development" | "production" };
vi.mock("@/config/env", () => ({ env: mockEnv }));

const { setSessionCookie, clearSessionCookie, SESSION_COOKIE_NAME } = await import("./cookies");

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.NODE_ENV = "development";
});

describe("session cookie security attributes", () => {
  it("is not marked secure in development — plain HTTP on localhost", async () => {
    mockEnv.NODE_ENV = "development";
    await setSessionCookie("token", new Date("2026-06-01T00:00:00.000Z"));

    expect(cookieStore.set).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      "token",
      expect.objectContaining({ secure: false }),
    );
  });

  it("is marked secure in production", async () => {
    mockEnv.NODE_ENV = "production";
    await setSessionCookie("token", new Date("2026-06-01T00:00:00.000Z"));

    expect(cookieStore.set).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      "token",
      expect.objectContaining({ secure: true }),
    );
  });

  it("always sets httpOnly, sameSite=lax and path=/, in every environment", async () => {
    for (const nodeEnv of ["development", "production"] as const) {
      mockEnv.NODE_ENV = nodeEnv;
      await setSessionCookie("token", new Date("2026-06-01T00:00:00.000Z"));

      expect(cookieStore.set).toHaveBeenLastCalledWith(
        SESSION_COOKIE_NAME,
        "token",
        expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
      );
    }
  });

  it("clears the cookie with the same secure attribute production requires", async () => {
    mockEnv.NODE_ENV = "production";
    await clearSessionCookie();

    expect(cookieStore.set).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      "",
      expect.objectContaining({ secure: true, httpOnly: true, maxAge: 0 }),
    );
  });
});
