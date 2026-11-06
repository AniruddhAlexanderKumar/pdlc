# Founder customer dashboard — local experiment

This is an unfinished, separately opted-in local/test experiment. It is not available in production, is not a complete platform-management console, and must not be used with real customer or founder credentials. Previous security blockers in `founders-part-1-2-review.md` remain open. The user subsequently authorized pushing the branch despite the possibility of an automatic deployment and migrations; whether deployment occurs is not established by that authorization.

## What works in the local experiment

- A fully authenticated founder can view the 100 most recently created non-demo customer accounts and workspaces. Operations role can read; Owner and Admin can manage.
- Owner/Admin can create an individual customer and solo workspace, or an organization owner and team workspace, in one transaction. Existing emails are rejected; existing accounts are not automatically joined, elevated or overwritten. A system-admin account is never created by this flow.
- The person receives no automatic email. The founder sees a one-time link to share securely; the link expires after one hour and allows the customer to choose their own password using the existing reset flow. Only the token hash is stored. If a link is lost or expires, this experiment has no resend/reissue control yet.
- Owner/Admin can suspend and reactivate non-system-admin customers. Suspension invalidates existing sessions and unused password-reset links. Customer data and workspaces are not deleted.
- Authenticated actions recheck the founder session and role inside the same transaction; creation and status changes write founder audit events transactionally. Normal users, even system administrators, are not founder sessions. Founder suspension denies subsequent access.

It does not yet offer pagination/search beyond the latest 100, customer editing, membership or organization administration, delivery/reissue of setup links, founder account management, billing, support inbox or full platform operations. The setup link is visible to the founder and is not intended as a production invitation design; any person holding it can use it until it expires. A lost response can leave an account created without a recoverable setup link. The management routes have not received production-grade throttling, independent security review or staging verification.

## Local opt-in and safety

The API requires both `FOUNDER_AUTH_EXPERIMENTAL=true` and `FOUNDER_MANAGEMENT_EXPERIMENTAL=true`, a non-production `NODE_ENV`, migrated disposable local database, and independently generated `SV_FOUNDER_TOTP_KEY` and `SV_FOUNDER_RATE_LIMIT_KEY` values. The browser build additionally needs `VITE_FOUNDER_AUTH_EXPERIMENTAL=true` and `VITE_FOUNDER_MANAGEMENT_EXPERIMENTAL=true`. The default app and default web build do not expose the dashboard. Even if both backend flags are set, `NODE_ENV=production` denies `/api/founders/*`; bootstrap also refuses production.

### Opening the console locally

1. Use a newly created, disposable PostgreSQL database named `founders_dashboard_local` on your own machine. Do not use an existing database, production, a production tunnel, or real customer data. Provide its connection string as `DATABASE_URL` in your local shell through your usual protected configuration. The commands below verify the hostname and database name before running migrations; that check alone cannot detect a tunnel, so you must ensure the server is truly disposable.
2. In that same shell, choose a **synthetic test password** at the prompt. The generated bootstrap secret and keys exist only in the shell environment; they are not printed or written to the repository. These are test-only credentials. The expected digest and submitted secret are both locally controlled, which is why this is not an approved production bootstrap.

```bash
export NODE_ENV=development APP_URL=http://localhost:5173
export FOUNDER_AUTH_EXPERIMENTAL=true FOUNDER_MANAGEMENT_EXPERIMENTAL=true
export VITE_FOUNDER_AUTH_EXPERIMENTAL=true VITE_FOUNDER_MANAGEMENT_EXPERIMENTAL=true
export SV_FOUNDER_TOTP_KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')"
export SV_FOUNDER_RATE_LIMIT_KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64"))')"
export SV_FOUNDER_BOOTSTRAP_SECRET="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')"
export SV_FOUNDER_BOOTSTRAP_SECRET_SHA256="$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(process.env.SV_FOUNDER_BOOTSTRAP_SECRET).digest("hex"))')"
read -r -s -p 'Synthetic test password (14+ characters): ' SV_FOUNDER_BOOTSTRAP_PASSWORD; echo
export SV_FOUNDER_BOOTSTRAP_PASSWORD SV_FOUNDER_BOOTSTRAP_NAME='Test founder' SV_FOUNDER_BOOTSTRAP_ENABLED=true
node -e 'const u=new URL(process.env.DATABASE_URL || "postgres://invalid/invalid"); if (!["localhost","127.0.0.1"].includes(u.hostname) || u.pathname !== "/founders_dashboard_local") { console.error("Use only a disposable localhost founders_dashboard_local database"); process.exit(1); }' && npm run migrate && npm run founder-bootstrap --workspace @sv/server
unset SV_FOUNDER_BOOTSTRAP_ENABLED SV_FOUNDER_BOOTSTRAP_SECRET SV_FOUNDER_BOOTSTRAP_SECRET_SHA256 SV_FOUNDER_BOOTSTRAP_PASSWORD
npm run dev
```

3. Open the normal sign-in page at `http://localhost:5173/login`. Sign in as the configured test Owner identity `f5manmission@sv.com` using the synthetic password you chose. Enroll a test authenticator, save its one-time recovery codes securely, and choose a different synthetic password when prompted. The dashboard then appears. These credentials belong only to the disposable database and do not provide access to the live application. Stop the development processes when finished.

In the explicitly opted-in local web build, the Owner email routes the password step to the separate founder authentication endpoint; email matching is only a routing hint, not authorization. The server must verify the password and MFA, and the first login also requires password rotation. The founder session is separate from ordinary user/admin sessions. If the founder password step returns an authentication failure or the experimental endpoint is absent, the form can attempt ordinary sign-in; any success creates only an ordinary session, never founder access. Rate-limit and other failures do not fall back. An existing ordinary account at the Owner email prevents bootstrap and must not be promoted or overwritten. Other founder roles still use the experimental `/founders` sign-in. The default build retains ordinary sign-in behavior, and production founder routes remain denied. This change does not rename or modify existing accounts in any database.

Run the bootstrap only once per disposable database. If migration/bootstrap fails, stop and investigate rather than proceeding as if an account was created. Avoid storing actual secrets in command history or sharing them in chat.

Migration 031 adds three allowed customer audit event names. It is statically registered, and the legacy startup behavior automatically applies all pending migrations unless the optional controlled-startup setting is used. Migrations 027–031 and deployment have not been verified in the actual production environment; the user authorized pushing despite the risk of automatic deployment and migration. This is not security acceptance. Do not paste secrets into chat, source, shell history or logs.

## Verification performed

On disposable local PostgreSQL 17.9, `founder-dashboard-api-smoke.ts` exercised founder role checks, ordinary-admin denial, CSRF, solo/team creation, duplicate rejection, single-use setup, customer session revocation, reactivation, audit attribution and rollback when audit writes fail. `founder-dashboard-browser-smoke.ts` exercised the normal login handoff, incorrect password/MFA, MFA enrollment and password rotation, ordinary user/admin and matching-email ordinary account separation, a forged UI hint, dashboard account creation, customer password setup and founder suspension. The bootstrap smoke separately verified rejection of an existing ordinary-email collision. `founder-unified-disabled-browser-smoke.ts` verified that a matching ordinary user can sign in when the founder API is off, with both the experimental and default web builds. The production-mode boundary smoke still returned 404 for founder routes with both experimental flags set. Workspace typecheck, default and experimental builds, and 114 unit tests passed. These are local test results, not production readiness or independent staging evidence.
