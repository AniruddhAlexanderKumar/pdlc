# Security Notes

## Founder prototype and CADit release gates

The upstream `/api/founders-console` prototype returns sample records and simulated outcomes and lacks a founder-specific authorization boundary. It is unmounted and its namespace is denied for all methods before ordinary session loading; the prototype UI is unavailable. The separate experimental founder flows remain local/test-only and their production security review remains blocked. No founder-management rollout is implied by CI.

The CADit iframe validates both the exact origin and the iframe window before accepting messages; it sends no partner credentials. Its live permissions, hosting headers and export remain unverified; see `docs/cadit-design-studio.md`. The separate upstream NVIDIA vision service accepts image URLs, falls back from the NVIDIA key to the generic AI key, and logs/returns upstream error text. Its credential routing, data disclosure and error handling require review before production use; the TypeScript fix alone is not security approval.

## Authentication and authorization

- Passwords use the hashing implementation in `apps/server/src/auth/crypto.ts`; credentials are never stored in plaintext.
- Session tokens are random, stored hashed, and issued in HTTP-only cookies. Session validity, expiry, user-disabled state, workspace membership, and system-admin status are loaded server-side.
- Workspace roles (`owner`, `admin`, `member`) and global system-admin access are distinct. Global admin access is stored in `users.is_admin`; an email address does not confer privileges.
- System-admin access is provisioned only through the operator-controlled `create-admin` script with the explicit `--system-admin` option. The option is not accepted by public registration or admin user-creation APIs.
- System-admin accounts cannot be disabled or deleted through the regular admin user-management API. Password reset/credential rotation remains available through the CLI.
- State-changing API calls enforce an origin check. Cookies use `SameSite=Lax`; HTTPS deployment enables Secure cookies and HSTS.
- Public authentication and access-request routes are rate-limited; request bodies have a global size cap and are validated with Zod.
- Open registration (the default `ACCESS_POLICY=beta-open`) does not weaken any of the above. Registration still hashes passwords with the same scrypt implementation, enforces a unique lower-cased email at the database index level (a racing duplicate is mapped to `409`, not a server error), validates inputs with Zod, requires explicit server-side Terms/Privacy acceptance (`acceptedTerms: true` is a schema-level requirement; the client cannot imply consent by omission), and is rate-limited per IP alongside login and password reset.
- Every new account is created as `owner` of its own workspace. It gains no system-admin flag, no membership of another workspace and no ability to read any other workspace; workspace isolation is enforced by the same `workspace_id` scoping used for all existing data.
- **Email verification** tokens are 32 random bytes, returned only in the email, carried in a URL fragment, stored only as SHA-256 hashes, single use and valid for 24 hours. Redemption runs in a transaction with a row lock, so a token cannot be consumed twice under concurrency. Verification is enforced (`REQUIRE_EMAIL_VERIFICATION=true`) only when an SMTP transport exists; enforcement is never *silently* dropped because a single message failed — the failure is logged, the token is deleted, and the account receives a session rather than being locked out of an unverifiable account.
- **Self-service password recovery** reuses `password_resets` (hashed, single use, expiring, session-revoking) and answers identically for known and unknown addresses, so it cannot be used to enumerate accounts. The response never discloses whether SMTP is configured.
- Existing accounts are unaffected: `email_verified_at` and `terms_accepted_at` are nullable and default to `NULL` for pre-existing rows, no user is asked to re-accept, re-verify or re-register, and `email_verifications`/`workspaces.onboarding` are additive.
- Project and issue APIs require an authenticated workspace session and scope projects by the active workspace. Assignees must be members of that same workspace. Project creation is restricted to workspace owners/admins; issue creation and updates are available to workspace members. Project-specific roles and permission schemes are not implemented.

## System-admin bootstrap / upgrade

The schema migration `005_system_admins` adds `users.is_admin` with a safe default of `false`. It intentionally does not promote users by email. After deploying the migration, an operator must explicitly create/promote the intended system administrator:

```bash
npm run create-admin -- --email admin@example.com --name "System Administrator" --workspace "Admin" --system-admin
```

For production, run the equivalent built script through the documented deployment procedure. Let it generate a temporary password, deliver it through a secure channel, and change it after signing in. `ADMIN_PASSWORD` can instead be supplied through the protected operator environment; never put it in source control or a command transcript.

The former hardcoded `admin@gmail.com` / `admin` login path has been removed. Existing accounts are not automatically granted global privileges; use the explicit CLI option to promote the intended account. Only a fresh disposable local database was migrated for verification; no pre-existing or production database was modified.

## Security follow-up

- Add API integration tests for unauthorized/forbidden admin routes, system-admin promotion/retention, and project/issue cross-workspace access.
- Use a disposable PostgreSQL database to verify migration `005_system_admins` and existing-user preservation before production rollout.
- Rotate credentials if the former fixed admin password was ever used outside a disposable development instance.

## Workspace password-reset email

Owners and workspace admins can send a single-use, 24-hour password reset link to another eligible member's registered email from Settings > Team. Members cannot send links, admins cannot target owners, and self-service password changes use Account settings. The server never returns the reset token to the requesting admin. Reset links are carried in the browser URL fragment, are hashed in the database, and are invalidated after use or password change; successful reset revokes existing sessions and outstanding links. Legacy path-based links remain supported. Reset-email generation is rate-limited per administrator; production multi-instance deployments should also use shared or edge rate limiting.

Configure `RESET_SMTP_HOST`, `RESET_SMTP_FROM`, optional `RESET_SMTP_PORT` (default 587), `RESET_SMTP_SECURE` (`true` for implicit TLS), and, when required, both `RESET_SMTP_USER` and `RESET_SMTP_PASSWORD`. Production requires TLS. Set `APP_URL` to the public application origin. SMTP credentials belong in the hosting environment, never source control. If email is not configured or delivery fails, the UI reports the error; a failed send does not leave an active new token. SMTP acceptance does not guarantee inbox delivery. Workspace administrators should confirm addresses and advise members to ignore unexpected requests.
