/**
 * Development/demo scenario seed — separate from `prisma/seed.ts`.
 *
 * `prisma/seed.ts` is the minimal bootstrap (one organization, one admin,
 * one empty project) and stays exactly that on purpose — it is also what
 * `prisma db seed` / `prisma migrate reset` invoke automatically, so it must
 * never grow engineering content a reset could silently reintroduce. This
 * script is the opposite: an explicit, separate, realistically-populated
 * project for local development and demonstrations, run only by name
 * (`npm run db:seed:scenario`) and never wired into Prisma's own seed hook.
 *
 * Builds through the real application services — `buildEngineeringScenario`
 * in `src/tests/fixtures/engineering-scenario.ts`, the same function the
 * PostgreSQL integration test and the E2E acceptance spec both use — so
 * "what does a populated project look like" is answered identically in all
 * three places, not invented a third time here.
 *
 * Idempotent in the ordinary sense a fresh run is: run it twice with the
 * same environment and you get two organizations with two independent
 * scenarios (each identifier-prefixed and timestamped), never a duplicate
 * inside one organization. If you want a clean slate, remove the previous
 * organization yourself (or `npm run db:reset:local` in development).
 *
 * NEVER runs in production — refuses immediately if NODE_ENV=production,
 * on top of the fact that nothing in this repository's deployment path
 * invokes this script automatically (see DEPLOYMENT.md).
 *
 * Credentials: this script sets its own real Argon2id-hashed passwords for
 * every account it creates (never a shared default), and prints every one
 * of them to the terminal exactly once so you can actually sign in — the
 * one place in this codebase a password is intentionally shown, because a
 * local demo account with no way to log into it would not be a demo of
 * anything. Never logs a session token, a database credential, or anything
 * beyond these deliberately-fictional demo passwords.
 *
 * Run with: npm run db:seed:scenario
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/server/auth/password";
import {
  buildEngineeringScenario,
  createProjectRoleUsers,
} from "../src/tests/fixtures/engineering-scenario";

async function main(): Promise<void> {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "Refusing to run the demo scenario seed with NODE_ENV=production. " +
        "This script creates synthetic accounts and engineering records and must never touch a production database.",
    );
  }

  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — cannot seed.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const suffix = `${Date.now()}`.slice(-8);
  const prefix = `SCN-${suffix}`;

  try {
    // --- Organization, owner, project — the same shape createTestTenant uses,
    // written directly here because this script runs outside the test harness. ---
    const organization = await prisma.organization.create({
      data: {
        name: `[DEMO] Aerospace Propulsion Program ${suffix}`,
        slug: `demo-propulsion-${suffix}`,
      },
    });

    const ownerEmail = `demo-owner-${suffix}@scenario.test`;
    const ownerPassword = `Demo-Owner-${suffix}-2026!`;
    const owner = await prisma.user.create({
      data: {
        email: ownerEmail,
        name: "Demo Program Owner (fictional)",
        role: "ADMIN",
        organizationId: organization.id,
        organizationRole: "OWNER",
      },
    });
    await prisma.userCredential.create({
      data: { userId: owner.id, passwordHash: await hashPassword(ownerPassword) },
    });

    const project = await prisma.project.create({
      data: {
        organizationId: organization.id,
        name: `[DEMO] Upper Stage Propulsion ${suffix}`,
        description:
          "A fictional upper-stage propulsion development program, for demonstration only.",
      },
    });

    const tenant = { organizationId: organization.id, userId: owner.id, projectId: project.id };
    const identifiers = { prefix };

    console.info(`Seeding demo scenario "${prefix}" into organization ${organization.slug} ...`);

    const roleUsers = await createProjectRoleUsers(tenant, identifiers);
    const scenario = await buildEngineeringScenario(tenant, identifiers);

    console.info("\nDemo scenario seeded. Sign in at /sign-in with any of:\n");
    console.info(`  OWNER    ${ownerEmail} / ${ownerPassword}`);
    console.info(`  MANAGER  ${roleUsers.manager.email} / ${roleUsers.manager.password}`);
    console.info(`  ENGINEER ${roleUsers.engineer.email} / ${roleUsers.engineer.password}`);
    console.info(`  REVIEWER ${roleUsers.reviewer.email} / ${roleUsers.reviewer.password}`);
    console.info(`  VIEWER   ${roleUsers.viewer.email} / ${roleUsers.viewer.password}`);
    console.info(
      `  (organization member, no project access) ${roleUsers.nonMember.email} / ${roleUsers.nonMember.password}`,
    );
    console.info(`\nProject: ${project.name} (${project.id})`);
    console.info(
      `Requirement ${scenario.requirement.identifier}, Decision ${scenario.decision.identifier}, `,
    );
    console.info(
      `Change Request ${scenario.changeRequest.identifier}, Certification program ${scenario.certificationProgram.identifier}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Demo scenario seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
