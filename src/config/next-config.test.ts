// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";

/**
 * The security headers are declarative config, not a route — this calls
 * `headers()` directly rather than standing up a server, which is enough to
 * catch a regression that silently drops or weakens a header.
 */
describe("next.config security headers", () => {
  it("applies the same header set to every path", async () => {
    const rules = await nextConfig.headers?.();

    expect(rules).toEqual([
      {
        source: "/:path*",
        headers: expect.arrayContaining([
          expect.objectContaining({ key: "Content-Security-Policy" }),
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          expect.objectContaining({ key: "Permissions-Policy" }),
        ]),
      },
    ]);
  });

  it("restricts frame-ancestors and does not allow the app to be framed", async () => {
    const rules = await nextConfig.headers?.();
    const csp = rules?.[0]?.headers.find((h) => h.key === "Content-Security-Policy")?.value;

    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
  });

  /**
   * Development needs `'unsafe-eval'` for webpack's eval-wrapped modules;
   * production must never have it. The config reads NODE_ENV once, when it
   * is loaded, so each case loads a fresh copy under its own NODE_ENV.
   */
  it("never allows eval outside development, and allows it only in development", async () => {
    const cspUnder = async (nodeEnv: string) => {
      vi.resetModules();
      vi.stubEnv("NODE_ENV", nodeEnv);
      const { default: config } = await import("../../next.config");
      const rules = await config.headers?.();
      return rules?.[0]?.headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
    };

    try {
      expect(await cspUnder("production")).not.toContain("unsafe-eval");
      expect(await cspUnder("test")).not.toContain("unsafe-eval");
      expect(await cspUnder("development")).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("outputs a standalone server build for the production container", () => {
    expect(nextConfig.output).toBe("standalone");
  });
});
