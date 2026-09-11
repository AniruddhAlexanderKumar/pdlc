import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Shared harness for the PostgreSQL integration tests.
 *
 * This connects to a real server. There is no emulation and no fallback: if
 * `DATABASE_URL` is missing or the server is unreachable, the tests skip and
 * say so. A skipped integration test is honest; a passing fake one is not.
 */

const connectionString = process.env["DATABASE_URL"];

/** A client bound to the real database, or null when there is nothing to connect to. */
export const integrationPrisma: PrismaClient | null = connectionString
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }), log: ["error"] })
  : null;

/**
 * Whether a real PostgreSQL server answered.
 *
 * Probed once at module load with an actual query, so a `DATABASE_URL` that
 * merely parses does not count as available.
 */
export const databaseAvailable: boolean = await (async () => {
  if (!integrationPrisma) return false;
  try {
    await integrationPrisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
})();

/** Explains the skip once, rather than in every test file. */
export const SKIP_REASON =
  "Requires a reachable PostgreSQL server. Run `docker compose up -d` and `npm run db:migrate:deploy`, then set DATABASE_URL.";

if (!databaseAvailable) {
  // Visible in the test output so a skipped suite is never mistaken for a
  // passing one.
  console.warn(`\n[integration] SKIPPED — ${SKIP_REASON}\n`);
}

/** Unique per run, so concurrent runs and reruns never collide. */
export function uniqueSuffix(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

export interface TestTenant {
  organizationId: string;
  userId: string;
  projectId: string;
}

/**
 * Creates an isolated organization, user and project for one test file.
 *
 * Everything a test writes hangs off this organization, so cleanup is a
 * single cascading delete and no test can see another's rows.
 */
export async function createTestTenant(label: string): Promise<TestTenant> {
  const prisma = integrationPrisma;
  if (!prisma) throw new Error("No database connection");

  const suffix = uniqueSuffix(label);

  const organization = await prisma.organization.create({
    data: { name: `[TEST] ${suffix}`, slug: `test-${suffix}` },
  });

  const user = await prisma.user.create({
    data: {
      email: `${suffix}@test.invalid`,
      name: "Integration Test User",
      role: "ADMIN",
      organizationId: organization.id,
    },
  });

  const project = await prisma.project.create({
    data: { organizationId: organization.id, name: `[TEST] Project ${suffix}` },
  });

  return { organizationId: organization.id, userId: user.id, projectId: project.id };
}

/** Removes everything the tenant owns. Cascades handle the artifacts and links. */
export async function destroyTestTenant(tenant: TestTenant): Promise<void> {
  const prisma = integrationPrisma;
  if (!prisma) return;
  await prisma.organization.deleteMany({ where: { id: tenant.organizationId } });
}

export async function disconnectIntegrationPrisma(): Promise<void> {
  await integrationPrisma?.$disconnect();
}
