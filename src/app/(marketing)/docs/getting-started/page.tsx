import type { Metadata } from "next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "@/components/common/code-block";
import { DocsPage } from "../_components/docs-page";

export const metadata: Metadata = {
  title: "Getting started",
  description: "Install PDLC Platform, sign in, and create your first project.",
};

export default function GettingStartedPage() {
  return (
    <DocsPage
      title="Getting started"
      description="Two real install paths, both self-hosted, both offline once the image is built."
      lastUpdated="2026-09-15"
      sourcePath="src/app/(marketing)/docs/getting-started/page.tsx"
    >
      <section className="flex flex-col gap-3">
        <h2>Install</h2>
        <p>
          Both paths below run the same application against PostgreSQL 17 you control — there is no
          hosted, no-install option today.
        </p>
        <Tabs defaultValue="docker">
          <TabsList>
            <TabsTrigger value="docker">Docker Compose</TabsTrigger>
            <TabsTrigger value="bundle">Self-hosted bundle</TabsTrigger>
          </TabsList>
          <TabsContent value="docker">
            <p className="mb-2 text-muted-foreground">
              Build the image, apply migrations once, then start the stack — exactly what CI runs.
            </p>
            <CodeBlock>{`docker compose -f docker-compose.prod.yml --env-file .env.production build
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm app npx prisma migrate deploy
docker compose -f docker-compose.prod.yml --env-file .env.production up -d`}</CodeBlock>
            <p className="mt-2 text-muted-foreground">
              Binds to <code className="font-mono">127.0.0.1:3000</code> by default — put a reverse proxy in
              front for TLS. Full detail, including every environment variable, is in{" "}
              <a href="/docs/deployment" className="underline-offset-4 hover:underline">
                Deployment
              </a>
              .
            </p>
          </TabsContent>
          <TabsContent value="bundle">
            <p className="mb-2 text-muted-foreground">
              For a host without Docker already set up: download the self-hosted bundle from{" "}
              <a href="/download" className="underline-offset-4 hover:underline">
                the download page
              </a>
              . It contains <code className="font-mono">docker-compose.prod.yml</code>, an{" "}
              <code className="font-mono">.env</code> template, and a setup script — the same production path
              above, packaged. It is not a Windows-native installer; see the download page for what that
              distinction means today.
            </p>
          </TabsContent>
        </Tabs>
      </section>

      <section className="flex flex-col gap-3">
        <h2>First sign-in</h2>
        <p>
          The first account created becomes that organization&apos;s owner. There is no separate admin
          bootstrap step — sign up, and the organization exists from that action.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>The seeded demo project</h2>
        <p>
          <code className="font-mono">npm run db:seed:scenario</code> creates a demo organization with one
          example requirement, decision, change request, and certification program — enough to see the real
          shape of the data, not a populated showcase. It is clearly named as a demo project and is not
          created automatically in a production deployment.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Creating a project and inviting colleagues</h2>
        <p>
          From the workspace, <strong className="text-foreground">Projects → New project</strong> creates one
          inside your organization. Project membership is managed from a project&apos;s own Members page —
          every member needs an explicit role (Manager, Engineer, Reviewer, or Viewer) on that specific
          project; organization membership alone grants no project access.
        </p>
      </section>
    </DocsPage>
  );
}
