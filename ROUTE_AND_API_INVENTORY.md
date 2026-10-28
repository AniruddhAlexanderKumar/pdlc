# Route and API Inventory

**Audit date:** 2026-10-28. This is derived from `apps/web/src/main.tsx` and the Express routers mounted by `apps/server/src/app.ts`.
Updated after the approved initial Projects/Issues slice; source presence does not imply full Jira parity or browser/API integration coverage.

## Web routes

| Path | Page/guard | Notes |
|---|---|---|
| `/` | Public landing when signed out; workspace dashboard when signed in | Root behavior is selected by `RequireAuth` |
| `/demo` | Public demo | Standalone expandable-card demo |
| `/request-access` | Public request form | Available without session |
| `/login` | Guest-only | Redirects authenticated users |
| `/signup`, `/register` | Guest-only registration | Both render registration mode |
| `/reset/:token` | Guest-only password reset | Token-based |
| `/join/:token` | Invite join | Public token flow |
| `/admin` | Admin-only | System dashboard |
| `/analytics` | Admin-only | Admin analytics dashboard route |
| `/products` | Authenticated workspace | Product portfolio |
| `/products/:id` | Authenticated workspace | Product detail, defaults to overview |
| `/products/:id/:tab` | Authenticated workspace | Product tabs: overview, discover, materials, costs, tasks, improve |
| `/projects` | Authenticated workspace | List workspace projects; workspace owner/admin can create |
| `/projects/:projectId/issues` | Authenticated workspace | Project issue list, search/pagination, issue creation and status updates |
| `/materials` | Authenticated workspace | Materials catalog |
| `/suppliers` | Authenticated workspace | Suppliers and quotes |
| `/achievements` | Authenticated workspace | User achievements/progress |
| `/settings` | Authenticated workspace | Workspace, team, account, privacy settings |
| `*` under authenticated layout | Redirect to `/` | Fallback is within the authenticated route tree |

## API-wide behavior

- API prefix: `/api`, JSON body limit 200 KB.
- Helmet security headers, cookie parsing, origin verification for writes, general rate limiting, session loading, and Pino request logging are installed before routers.
- `requireAuth` protects workspace/game/dashboard/product/catalog routes. `/api/admin` additionally applies `requireAdmin`. Request-access submission is public but separately rate-limited.
- Inputs are generally validated with Zod and parameter helpers in `routes/util.ts`/`lib/http.ts`. Success/error envelope differs by endpoint; do not assume one universal wrapper.
- `GET /api/health` performs `SELECT 1`; database failure returns 503.

## API endpoint groups

| Method and path | Access | Purpose |
|---|---|---|
| `GET /api/health` | Public | Liveness/readiness database probe |
| `GET /api/auth/config` | Public | Whether self-registration is allowed |
| `POST /api/auth/register` | Public, rate-limited | Create account/workspace or join by invite, then establish session |
| `POST /api/auth/login` | Public, rate-limited | Authenticate, establish session, record login analytics |
| `POST /api/auth/logout` | Public/session-aware | Revoke session and clear cookie |
| `GET /api/auth/me` | Public/session-aware | Current user and workspace context |
| `POST /api/auth/switch-workspace` | Authenticated | Switch current workspace session |
| `PATCH /api/auth/profile` | Authenticated | Update profile |
| `POST /api/auth/password` | Authenticated | Change password |
| `GET /api/auth/invite/:token` | Public | Inspect invite |
| `POST /api/auth/accept-invite` | Public | Redeem invite |
| `GET /api/auth/reset/:token` | Public | Inspect password-reset token |
| `POST /api/auth/reset` | Public | Redeem reset token |
| `POST /api/access-requests` | Public, five/hour per IP outside test | Validate and persist access request; returns 201 with ID/status |
| `GET /api/admin/overview` | Admin | Global user/workspace/product counts and recent records |
| `GET /api/admin/access-requests` | Admin | List access requests |
| `PATCH /api/admin/access-requests/:id` | Admin | Update request status and internal note |
| `GET /api/admin/users` | Admin | Global users and membership/product summaries |
| `POST /api/admin/users` | Admin | Create user |
| `PATCH /api/admin/users/:id` | Admin | Update user |
| `DELETE /api/admin/users/:id` | Admin | Delete user |
| `GET /api/admin/workspaces` | Admin | List workspaces and related summaries |
| `POST /api/admin/workspaces` | Admin | Create workspace |
| `PATCH /api/admin/workspaces/:id` | Admin | Update workspace |
| `DELETE /api/admin/workspaces/:id` | Admin | Delete workspace |
| `POST /api/admin/workspaces/:id/members` | Admin | Add workspace member |
| `PATCH /api/admin/workspaces/:id/members/:userId` | Admin | Update membership |
| `DELETE /api/admin/workspaces/:id/members/:userId` | Admin | Remove membership |
| `GET /api/admin/products` | Admin | List all products |
| `PATCH /api/admin/products/:id` | Admin | Update product |
| `DELETE /api/admin/products/:id` | Admin | Delete product |
| `POST /api/analytics/track` | Public/session-aware | Record analytics event |
| `GET /api/analytics/overview` | Admin | Analytics summary |
| `GET /api/analytics/logins` | Admin | Login records |
| `GET /api/analytics/activity` | Admin | Activity records |
| `GET /api/analytics/users` | Admin | Analytics by user |
| `GET /api/workspace/data` | Authenticated | Load current workspace products/materials/suppliers |
| `PATCH /api/workspace` | Workspace owner/admin | Update workspace settings |
| `POST /api/workspace/sample-data` | Authenticated | Load examples only into empty workspace |
| `GET /api/workspace/members` | Authenticated | List current workspace members |
| `PATCH /api/workspace/members/:userId` | Workspace owner/admin | Change membership role |
| `DELETE /api/workspace/members/:userId` | Authenticated with role rules | Leave/remove member |
| `POST /api/workspace/members/:userId/reset-link` | Workspace owner/admin | Generate password reset link |
| `GET /api/workspace/invites` | Workspace owner/admin | List active invites |
| `POST /api/workspace/invites` | Workspace owner/admin | Create invite |
| `DELETE /api/workspace/invites/:id` | Authenticated with role rules | Revoke invite |
| `GET /api/game/me` | Authenticated | Current player stats |
| `GET /api/game/leaderboard` | Authenticated | Workspace leaderboard |
| `GET /api/dashboard` | Authenticated | Resolve user's dashboard preset/layout |
| `PUT /api/dashboard` | Authenticated | Save a supported dashboard preset |
| `POST /api/products` | Authenticated | Create a product in current workspace |
| `PATCH /api/products/:id` | Authenticated | Update product fields/lifecycle stage |
| `DELETE /api/products/:id` | Authenticated | Delete current-workspace product |
| `PUT /api/products/:id/answers/:key` | Authenticated | Save/remove validated discovery answer |
| `PUT /api/products/:id/materials/:materialId` | Authenticated | Add/update BOM line |
| `DELETE /api/products/:id/materials/:materialId` | Authenticated | Remove BOM line |
| `POST /api/products/:id/tasks` | Authenticated | Create product task |
| `PATCH /api/products/:id/tasks/:taskId` | Authenticated | Update product task |
| `DELETE /api/products/:id/tasks/:taskId` | Authenticated | Delete product task |
| `GET /api/products/:id/insights` | Authenticated | Calculate product insight suggestions |
| `POST /api/products/:id/insights/apply` | Authenticated | Apply an insight action |
| `GET /api/materials` | Authenticated | List current-workspace materials |
| `POST /api/materials` | Authenticated | Create material and optional supplier quotes |
| `PATCH /api/materials/:id` | Authenticated | Update material/quotes |
| `DELETE /api/materials/:id` | Authenticated | Delete material |
| `GET /api/suppliers` | Authenticated | List current-workspace suppliers |
| `POST /api/suppliers` | Authenticated | Create supplier and optional material quotes |
| `PATCH /api/suppliers/:id` | Authenticated | Update supplier/quotes |
| `DELETE /api/suppliers/:id` | Authenticated | Delete supplier |
| `GET /api/projects` | Authenticated | List projects in current workspace with issue counts |
| `POST /api/projects` | Workspace owner/admin | Create project with workspace-unique key |
| `GET /api/projects/:projectId/issues` | Authenticated | Search/filter by status and paginate a workspace project's issues |
| `POST /api/projects/:projectId/issues` | Authenticated | Create Task/Bug/Story with priority, labels, reporter and optional workspace-member assignee |
| `PATCH /api/projects/:projectId/issues/:issueId` | Authenticated | Update issue fields, assignee, or fixed status |

Project/issue routes are separate from `/api/products` and its product task API. Projects are workspace scoped; members can create/update issues, while project creation is owner/admin-only. No project-level permissions are implemented yet. Unknown API paths return JSON 404. See `apps/server/src/routes` for request schema details and precise response types.

## Unverified runtime concerns

- The route inventory is source-derived. Typecheck/build/shared unit tests passed, but no HTTP/API integration or browser tests are configured. Isolated PostgreSQL migration verification status is tracked in `REGRESSION_TEST_PLAN.md`.
- Several existing list endpoints return complete collections and use local search/filter. The project issue endpoint has bounded pagination, but query-plan and large-dataset performance are not established by this audit.
- API mutations are often coordinated by `mutate()` and XP ledger logic; verify transaction boundaries when adding new cross-entity operations.
