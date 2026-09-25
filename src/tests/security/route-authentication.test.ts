// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every API route requires a signed-in session, except the ones that exist
 * to create one or to report health.
 *
 * SECURITY.md states this as a property of the system: "only `/api/auth/*`
 * and `/api/health*` skip it". Each route's own test mocks the
 * authentication call, so each proves its route *uses* it — but nothing
 * proved that every route does. A simulated store-integration route
 * (`/api/integrations/amazon`) shipped with no authentication at all,
 * answering anyone on the internet, and nothing failed. This scans the real
 * route tree so the next unauthenticated route fails here instead of in
 * production.
 */

const API = join(process.cwd(), "src/app/api");

/** The only routes allowed to answer without a session, and why. */
const PUBLIC_ROUTE_PREFIXES = [
  "auth/", // sign-in, sign-up, sign-out, session: they establish or end one
  "health/", // liveness and readiness probes for the operator's orchestrator
  "health", // the readiness probe itself: src/app/api/health/route.ts
];

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === "route.ts" ? [full] : [];
  });
}

const ROUTES = routeFiles(API).map((path) => ({
  path: relative(API, path).replace(/\\/g, "/"),
  source: readFileSync(path, "utf8"),
}));

function isPublic(path: string): boolean {
  const dir = path.replace(/\/?route\.ts$/, "");
  return PUBLIC_ROUTE_PREFIXES.some((prefix) => dir === prefix.replace(/\/$/, "") || dir.startsWith(prefix));
}

describe("API route authentication", () => {
  it("finds the real route tree", () => {
    expect(ROUTES.length).toBeGreaterThan(100);
  });

  it("requires a session on every route outside auth and health", () => {
    const unauthenticated = ROUTES.filter(
      ({ path, source }) => !isPublic(path) && !source.includes("requireAuthenticatedContext"),
    ).map(({ path }) => path);

    expect(unauthenticated, `routes answering without a session: ${unauthenticated.join(", ")}`).toEqual([]);
  });

  /**
   * The allowlist should not quietly grow. If a new public route is ever
   * genuinely needed, adding it here is a deliberate, reviewed change — and
   * SECURITY.md's sentence has to change with it.
   */
  it("exempts exactly the routes SECURITY.md names, and no others", () => {
    const exempt = ROUTES.filter(({ path }) => isPublic(path)).map(({ path }) => path).sort();

    expect(exempt).toEqual([
      "auth/session/route.ts",
      "auth/sign-in/route.ts",
      "auth/sign-out/route.ts",
      "auth/sign-up/route.ts",
      "health/live/route.ts",
      "health/route.ts",
    ]);
  });
});
