# Temporary demo workspaces

The landing page opens an interactive guest workspace without requiring sign-in, even when public registration is closed. The server creates a separate solo workspace and populates it using the normal sample-data service. The guest can explore and edit its own products, materials, suppliers, projects and graph; the normal workspace authorization checks still apply. Demo changes are not transferred to a real account. System administrators retain their existing access, so visitors should not enter sensitive data.

Each guest session has a fixed two-hour expiry (it does not slide with activity). The server periodically removes expired demo workspaces, associated guest users, sessions and workspace analytics. A guest must exit the demo before signing in or registering. Existing authenticated sessions are never replaced by starting a demo. Guest access to account management, workspace creation or joining, invitations, voice and AI endpoints is blocked on the server; product suggestions use deterministic rules only.

To limit resource use, demo creation is limited to 10 requests per IP per hour per server process, with a database-serialized limit of 200 active guest workspaces across replicas. Configure `TRUST_PROXY` correctly for the deployment's trusted reverse proxies, and use appropriate edge rate limiting in production: the per-process limiter is not shared across replicas. Expired workspaces are swept every 15 minutes while the server is running. If the service is stopped, cleanup resumes when it runs again.

Deploy the backend and migration `012_demo_guests` before or together with the frontend. The server applies pending migrations at startup. Frontend-only deployment cannot open the guest demo against an older API.

For an isolated local test database and server started with `NODE_ENV=test` and `ALLOW_SIGNUP=false`:

```sh
DEMO_SMOKE_URL=http://localhost:4000 DATABASE_URL=postgres://velocity:velocity@localhost:5433/velocity node --import tsx apps/server/scripts/demo-smoke.mjs
```

The smoke test creates accounts and workspaces and expects a fresh database; never run it against production.
