import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

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
