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
  },
});
