// Prisma CLI configuration (schema location, migrations, datasource).
// Prisma v7 no longer auto-loads .env files for the CLI, so it's loaded
// explicitly here — see src/lib/db.ts for the equivalent in app code.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
    // Only `prisma migrate diff --from-migrations` needs this: it replays
    // every committed migration into a throwaway database to compare the
    // result against schema.prisma. Prisma 7 removed the
    // `--shadow-database-url` flag that CI used to pass, and now reads it
    // here instead — so without this the drift check errors out (exit 1)
    // rather than reporting agreement (0) or drift (2).
    //
    // Left undefined when unset, which is every command except that one.
    // **Whatever this points at is RESET**, so it must never be a database
    // holding anything, least of all the one in DATABASE_URL.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
