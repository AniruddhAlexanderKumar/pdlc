// @vitest-environment node
import { describe, expect, it } from "vitest";

/**
 * The liveness endpoint must answer with no dependency on anything outside
 * the process — no database, nothing importable that could itself fail for
 * an infrastructure reason. Asserted here structurally: this test never
 * mocks @/lib/db at all, so if the route ever imported it, this file's
 * import of the route would throw for lacking that mock, not silently pass.
 */

const { GET } = await import("./route");

describe("GET /api/health/live", () => {
  it("answers 200 with no arguments and no async work", () => {
    const response = GET();

    expect(response.status).toBe(200);
  });

  it("reports ok and a timestamp, nothing else", async () => {
    const response = GET();
    const body = await response.json();

    expect(body).toEqual({ status: "ok", timestamp: expect.any(String) });
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
  });
});
