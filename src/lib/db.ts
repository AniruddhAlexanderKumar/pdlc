import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/config/env";
import type { Prisma } from "@/generated/prisma/client";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Either the root client or an interactive-transaction client.
 *
 * Repository functions accept this so a caller can run several writes inside
 * one `prisma.$transaction(...)` without the repository knowing or caring.
 */
export type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Prisma Client singleton, connected via the PostgreSQL driver adapter
 * (required by Prisma 7's `prisma-client` generator — there is no
 * schema-embedded connection string or query engine binary anymore).
 *
 * Cached on `globalThis` in non-production so Next.js's dev-mode module
 * reloading doesn't spin up a new connection pool on every file save.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
