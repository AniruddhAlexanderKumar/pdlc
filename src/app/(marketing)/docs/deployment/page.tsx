import type { Metadata } from "next";
import { CodeBlock } from "@/components/common/code-block";
import { DocsPage } from "../_components/docs-page";

export const metadata: Metadata = {
  title: "Deployment",
  description: "Docker Compose production deployment, environment variables, backups, and upgrades.",
};

export default function DeploymentDocsPage() {
  return (
    <DocsPage
      title="Deployment"
      description="Summarized from DEPLOYMENT.md, which is the authoritative version for anything more detailed than what's here."
      lastUpdated="2026-09-15"
      sourcePath="src/app/(marketing)/docs/deployment/page.tsx"
    >
      <section className="flex flex-col gap-3">
        <h2>Prerequisites</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>A host that can run containers, or Node.js 20.9+ directly.</li>
          <li>PostgreSQL 17 — the schema and driver adapter are written against it specifically; no other database is supported anywhere in this codebase.</li>
          <li>A reverse proxy for TLS termination. This application does not terminate TLS itself.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Production deploy</h2>
        <CodeBlock>{`docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm app npx prisma migrate deploy
docker compose -f docker-compose.prod.yml --env-file .env.production up -d`}</CodeBlock>
        <p>Binds to <code className="font-mono">127.0.0.1:3000</code> by default.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Environment variables</h2>
        <p>
          <code className="font-mono">.env.example</code> in the repository is the authoritative, current
          list. Every variable is validated at process startup — a missing or malformed required one fails
          startup immediately rather than surfacing as an obscure runtime error later.
        </p>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li><code className="font-mono">DATABASE_URL</code> — required, no default.</li>
          <li><code className="font-mono">NODE_ENV</code> — <code className="font-mono">production</code>; set automatically by <code className="font-mono">next build</code>/<code className="font-mono">next start</code>.</li>
          <li><code className="font-mono">SESSION_TTL_DAYS</code> — optional, defaults to 30.</li>
          <li><code className="font-mono">LOG_LEVEL</code> — optional, <code className="font-mono">info</code> or <code className="font-mono">warn</code> in production.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Migrations</h2>
        <p>
          Forward-only by design. A migration failure or an unwanted schema change is recovered by restoring
          a backup or authoring a new forward migration — never an automatic rollback.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Backups</h2>
        <p>
          The application implements no backup automation. The documented procedure is a standard{" "}
          <code className="font-mono">pg_dump</code>/<code className="font-mono">pg_restore</code> pair —
          running it on a schedule, and verifying restores, is an operator responsibility this codebase does
          not and cannot discharge for you.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Health checks</h2>
        <p>
          <code className="font-mono">/api/health</code> reports application and database connectivity —
          wire it to your load balancer or orchestrator&apos;s readiness probe.
        </p>
      </section>
    </DocsPage>
  );
}
