# External review access

Workspace owners and admins can share explicitly selected project issues from **External Review Access** on a project issues page. The reviewer sees the issue key, type, status, title and full description, and optional relationships only when both endpoints were selected. Assignees, labels, relationship descriptions, private employee information and other issues are excluded. Reviewers cannot use the link as an authenticated workspace session. Sharing engineering requirements, files, verification, change records and evidence is not supported because these are not persisted models in this application. Document viewing and downloads are unavailable.

Unrestricted links are disabled by default; an owner/admin must explicitly enable them. Disabling that setting revokes existing unrestricted links. Links may expire after 24 hours, 7/30/90 days, a custom time within 90 days, or not expire (only owner/admin can create them). They can be revoked immediately. Management and audit history are restricted to workspace owners/admins. The raw link is displayed once and cannot be recovered later; create a replacement if it is lost. The random token is in the URL fragment (not sent in HTTP requests), is stored as a SHA-256 hash, and is sent to the reviewer API only in the Authorization header. Review endpoints are no-store, noindex and no-referrer, and the review page is excluded from client analytics. Existing app authentication is not modified. Reviewers do not occupy workspace seats or get membership. Deleting an expired review deletes its audit history.

## Email-restricted links

Set all of these server-side variables to enable one-time-code delivery:

- `REVIEW_SMTP_HOST`, `REVIEW_SMTP_PORT` (default 587), `REVIEW_SMTP_FROM`.
- `REVIEW_OTP_SECRET`: a long, random secret of at least 32 characters, shared consistently by all backend replicas. Keep it in the server's secret manager. Rotating it invalidates outstanding codes.
- `REVIEW_SMTP_USER`, `REVIEW_SMTP_PASSWORD` when SMTP authentication is required.
- `REVIEW_SMTP_SECURE=true` for implicit TLS, otherwise STARTTLS is required outside test mode.

Do not use real SMTP credentials or production data for tests. The server will refuse to create an email-restricted link when email is not configured. Codes expire after 10 minutes, allow five attempts, are hashed with the server secret, and are single use. Verification grants a separate short-lived, hashed, review-scoped session; it does not create an account or membership. Each content request still checks link expiry and revocation. Production must use an HTTPS `APP_URL`; link creation is refused otherwise.

The application uses process-local rate limits; configure `TRUST_PROXY` correctly and use a shared/edge rate limiter when running multiple replicas. Expired verification challenges and sessions are swept periodically. Review and audit records remain until an administrator deletes an expired review. Back up the database and deploy migrations 012–016 before exposing these endpoints. Verify the deployment's HTTPS, reverse-proxy log configuration and outbound SMTP delivery separately; fragments must not be captured by client-side analytics or error reporting.

## Test

`apps/server/scripts/external-review-smoke.mjs` is for a disposable local DB, local API in test mode and fake SMTP capture only. Set `REVIEW_TEST_URL`, `REVIEW_TEST_DB` and `REVIEW_TEST_MAIL` as described in that script. Never point it at production.
