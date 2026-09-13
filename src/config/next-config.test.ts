// @vitest-environment node
import { describe, expect, it } from "vitest";
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

  it("outputs a standalone server build for the production container", () => {
    expect(nextConfig.output).toBe("standalone");
  });
});
