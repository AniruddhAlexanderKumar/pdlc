# Security Notes

## Ordinary founder journey

“Founder” on the building desk means a product builder with a normal workspace session. It grants **no** system-admin or experimental founder privileges. The journey keeps the existing session, CSRF, role, demo and tenant boundaries.

- A saved answer is team-visible. A saved **draft** is personal: product ownership is resolved against the active workspace, the author comes from the session, and list/delete operations cannot select another user. The shared `/api/workspace/data` response omits drafts. Account operators with database access are not excluded by this privacy boundary. Product/user deletion cascades to drafts.
- A member may keep a draft of a teammate’s assigned activity but cannot overwrite the shared answer. Reviews are owner/admin-only (including a solo owner reviewing their own work). Lesson edits and review decisions from the UI include the version of the answer the user saw. The server rejects stale overwrites/decisions instead of silently accepting them; changing an answer invalidates prior approval. An approved “Not yet” is not a verified finding.
- Lesson assistance is explicitly requested, limited per user and metered by the existing backend assistant adapter. When enabled, it may send excerpts of the selected product’s description, notes, answers, tasks, cost totals, attention items and the submitted draft. Free text can contain sensitive information; this is **not** automatic de-identification. It does not send whole workspace catalogs, other products or teammates’ private drafts. The response is displayed as text with no write capability. Demo sessions use the built-in guide. See [provider disclosure and accounting](AI_ASSISTANT.md).
- First-time credit is enforced by a database uniqueness constraint, not a browser counter. Repeating work in another session or as another member gives no duplicate credit. Guide depth, optional streak and team board visibility do not change access to product data.

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
