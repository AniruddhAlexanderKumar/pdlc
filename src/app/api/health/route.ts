import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Readiness probe: can this instance actually do its job right now? That
 * means reaching PostgreSQL, so unlike `/api/health/live` this one is
 * allowed to fail when the database is unreachable — that failure is the
 * signal a load balancer needs to stop sending it traffic.
 *
 * Never mutates state; reports only. No connection string, credential, or
 * query detail appears in the response body on failure, only the fact that
 * the check failed — a stack trace or driver error message goes to the
 * server log (see `log.error` below), never to the client.
 */

// Always evaluated at request time — never statically cached at build.
export const dynamic = "force-dynamic";

const log = logger.child({ module: "api/health" });

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      checks: { database: "ok" },
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    log.error("Database healthcheck failed", { err: error });
    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        checks: { database: "unreachable" },
      },
      { status: 503 },
    );
  }
}
