import { NextResponse } from "next/server";

/**
 * Liveness probe: proves only that the Node process is up and the Next.js
 * router can dispatch a request to it. No database call, no dependency on
 * anything outside this process — a liveness check that reached out to
 * PostgreSQL would make an orchestrator restart a perfectly healthy
 * application container every time the database had a blip, which is
 * exactly the failure mode liveness and readiness are split to avoid.
 *
 * `/api/health` (unchanged) is the readiness check: it proves the
 * application can actually do its job, which does mean reaching PostgreSQL.
 * Use this route for "should the container be restarted?" and `/api/health`
 * for "should this instance receive traffic?".
 */
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
