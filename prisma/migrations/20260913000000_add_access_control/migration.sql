-- Real organization/project access control, on top of the existing
-- self-hosted authentication — no identity provider, no session model
-- change. Two additions:
--
--   1. `organizationRole` on `users` (OWNER | MEMBER) — separate from the
--      pre-existing `role` column (ADMIN/ENGINEER/VIEWER), which is carried
--      on every session but has never been checked anywhere in application
--      code and is left exactly as it was.
--   2. `project_memberships` — explicit, project-scoped access. From this
--      migration on, belonging to an organization no longer implies access
--      to every project in it; a user needs a real row here, or to be their
--      organization's OWNER.
--
-- Additive only: no existing table, column, index, constraint or enum is
-- altered or dropped. `organizationRole` is added NOT NULL with a DEFAULT
-- so the column is well-formed the moment it exists, matching the
-- established pattern for every status-like column this schema has added.
--
-- The two backfill statements at the end exist for `Existing projects must
-- not become inaccessible` (see ARCHITECTURE.md's Engineering Access
-- Control section): they identify, deterministically, the one user any
-- existing organization already had de facto full control through — the
-- one who registered it, i.e. the earliest-created user in that
-- organization, since no invite flow existed before this migration — and
-- preserve exactly their existing effective access: OWNER at the
-- organization level, and an explicit MANAGER membership on every project
-- already in that organization. No other user gains anything they did not
-- already have, and no user is granted access to a project outside their
-- own organization.

-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('MANAGER', 'ENGINEER', 'REVIEWER', 'VIEWER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "organizationRole" "OrganizationRole" NOT NULL DEFAULT 'MEMBER';

-- CreateTable
CREATE TABLE "project_memberships" (
    "id" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_memberships_projectId_idx" ON "project_memberships"("projectId");

-- CreateIndex
CREATE INDEX "project_memberships_userId_idx" ON "project_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "project_memberships_projectId_userId_key" ON "project_memberships"("projectId", "userId");

-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: the earliest-created user in each organization becomes its
-- OWNER. On a database with no existing rows (every environment this
-- product has been deployed to so far), this affects nothing.
UPDATE "users" u
SET "organizationRole" = 'OWNER'
WHERE u."id" = (
  SELECT u2."id" FROM "users" u2
  WHERE u2."organizationId" = u."organizationId"
  ORDER BY u2."createdAt" ASC, u2."id" ASC
  LIMIT 1
);

-- Backfill: that same user gets an explicit MANAGER membership on every
-- project already in their organization — the exact access they already
-- had, made explicit rather than expanded or narrowed. ON CONFLICT guards
-- the case where a row already exists for that (project, user) pair, which
-- cannot happen on a fresh table but keeps this statement safely re-runnable.
INSERT INTO "project_memberships" ("id", "role", "projectId", "userId", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'MANAGER',
  p."id",
  owner."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "projects" p
JOIN LATERAL (
  SELECT u."id" FROM "users" u
  WHERE u."organizationId" = p."organizationId"
  ORDER BY u."createdAt" ASC, u."id" ASC
  LIMIT 1
) owner ON true
ON CONFLICT ("projectId", "userId") DO NOTHING;
