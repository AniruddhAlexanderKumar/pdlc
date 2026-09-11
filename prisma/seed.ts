/**
 * Development bootstrap.
 *
 * Creates the minimum needed to sign in locally: one organization, one
 * administrator with real Argon2id credentials, and one empty project. It
 * seeds NO engineering content — fabricated requirements or verification
 * results in a traceability system are worse than none.
 *
 * Credentials come from the environment. There is no default password in this
 * repository: a committed one would end up in a deployed database sooner or
 * later. Set these before running (see .env.example):
 *
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME, SEED_ORGANIZATION_NAME
 *
 * Idempotent — safe to re-run. Run with: npm run db:seed
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/auth/password";

const MINIMUM_PASSWORD_LENGTH = 12;
const DEV_PROJECT_NAME = "[DEV] Sample Program";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `${name} is not set. The seed will not invent a password — export SEED_ADMIN_EMAIL, ` +
        "SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME and SEED_ORGANIZATION_NAME first (see .env.example).",
    );
  }
  return value.trim();
}

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — cannot seed.");
  }

  const email = requireEnv("SEED_ADMIN_EMAIL").toLowerCase();
  const password = requireEnv("SEED_ADMIN_PASSWORD");
  const adminName = requireEnv("SEED_ADMIN_NAME");
  const organizationName = requireEnv("SEED_ORGANIZATION_NAME");

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new Error(`SEED_ADMIN_PASSWORD must be at least ${MINIMUM_PASSWORD_LENGTH} characters.`);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const slug = organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);

    const organization = await prisma.organization.upsert({
      where: { slug },
      update: {},
      create: { name: organizationName, slug },
    });

    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name: adminName, role: "ADMIN", organizationId: organization.id },
    });

    // Re-hashed on every run so rotating SEED_ADMIN_PASSWORD takes effect.
    const passwordHash = await hashPassword(password);
    await prisma.userCredential.upsert({
      where: { userId: user.id },
      update: { passwordHash },
      create: { userId: user.id, passwordHash },
    });

    const project = await prisma.project.upsert({
      where: {
        organizationId_name: { organizationId: organization.id, name: DEV_PROJECT_NAME },
      },
      update: {},
      create: {
        organizationId: organization.id,
        name: DEV_PROJECT_NAME,
        description: "Empty development project. Contains no engineering data.",
      },
    });

    // Never log the password or any credential material.
    console.info("Seeded development data:");
    console.info(`  organization ${organization.slug} (${organization.id})`);
    console.info(`  admin user   ${user.email}`);
    console.info(`  project      ${project.name}`);
    console.info("Sign in at /sign-in with SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
