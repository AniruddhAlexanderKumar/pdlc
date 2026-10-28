# Security Notes

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
