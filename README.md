# NexGen PLM — Engineering OS
## Engineering Product Development Life Cycle Operating System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF.svg)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-22-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791.svg)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748.svg)](https://www.prisma.io/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC.svg)](https://tailwindcss.com/)

NexGen PLM is a production-grade, full-lifecycle **Engineering Operating System** designed for high-consequence engineering organizations (aerospace, defense, automotive, medical, and robotics). 

It replaces disconnected spreadsheets, static diagrams, and prototype mockups with an **authoritative, auditable relational graph** connecting:
- Opportunities & Feasibility Assessments
- Requirements Engineering & Bidirectional Traceability
- Product Breakdown Structure (PBS) & Architecture Allocations
- Verification Procedures & Empirical Execution Ledgers
- Technical Hazards & Safety Risk Matrices
- Quality Nonconformance Investigations & Corrective Action Closures
- Change Control Board with Automated Ripple-Effect Impact Analysis (ECRs & ECOs)
- Configuration Baselines with Immutable Snapshots and Comparison Diffing
- Stage Gates & Release Management with Enforced Mandatory Blockers
- Controlled Engineering Document Repositories & Checksums
- Comprehensive Immutable Audit Log

---

## 1. Quick Start

### Prerequisites
- **Node.js**: v22.x or higher
- **npm**: v10.x or higher
- **PostgreSQL**: v17.x (local service on port 5432 or via Docker)

### Installation & Initialization

1. Clone or navigate to the repository:
   ```bash
   cd C:\Users\Aniruddh\.gemini\antigravity\scratch\nexgen-plm
   ```

2. Install dependencies across all npm workspaces:
   ```bash
   npm install
   ```

3. Ensure PostgreSQL is running and `.env` has your connection string:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nexgen_plm"
   PORT=4000
   JWT_SECRET="nexgen-engineering-os-secure-secret-key-2026"
   ```

4. Push the Prisma relational schema and generate the client:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. Seed the database with authentic engineering data:
   ```bash
   npx tsx apps/api/src/seed.ts
   ```

---

## 2. Running the Application

### Option A: Simultaneous Development Mode
Run both backend API and frontend Vite servers concurrently:
```bash
# Terminal 1: Start Backend API (Port 4000)
npm run dev --workspace=@nexgen/api

# Terminal 2: Start Frontend Application (Port 3000)
npm run dev --workspace=@nexgen/web
```

Open your browser at **`http://localhost:3000`**.

### Option B: Production Build & Execution
```bash
# Build the deployable single-page app (shared-types + web -> apps/web/dist)
npm run build

# Build the backend separately (needs a generated Prisma client)
npm run db:generate
npm run build:api

# Start production API server
node apps/api/dist/server.js
```

`npm run build:all` still builds every workspace in one go; `npm run build`
deliberately targets only the static frontend, because that is what the
Cloudflare Worker deploys (see section 8).

### Option C: Self-Hosted Docker Compose
```bash
docker compose up -d
```
Starts PostgreSQL 17, MinIO S3-compatible storage, API service, and Nginx frontend.

---

## 3. Pre-Configured Demonstration Accounts

| Role | Email | Password | Scope |
|---|---|---|---|
| **Chief Systems Engineer** | `engineer@nexgen.os` | `password123` | Lead design authority & requirements lead |
| **Quality Assurance Lead** | `quality@nexgen.os` | `password123` | Test witness, nonconformance disposition |
| **VP / Org Administrator** | `admin@nexgen.os` | `admin123` | CCB chair, baseline approvals, gate releases |

*Note: The frontend web client automatically authenticates as `Dr. Elena Rostova` (`engineer@nexgen.os`) on first load for an immediate interactive session.*

---

## 4. Testing & Verification

Execute the complete test suite across all monorepo workspaces:
```bash
npm test
```

This executes:
1. **Requirement Quality Advisory Rules**: Detects ambiguous terms (`"adequate"`, `"fast"`, `"sufficient"`), checks normative phrasing (`"shall"`), and flags unallocated requirements.
2. **Deterministic Stage Gate Evaluation**: Verifies that failed test `VRF-002` deterministically triggers mandatory release blocker `GATE-VRF-01`.
3. **Automated Ripple-Effect Change Impact**: Verifies that proposing a change to `REQ-002` correctly traces affected PBS component `SYS-002`, invalidates test `VRF-002`, and flags re-test obligations.
4. **REST API Endpoints**: End-to-end integration tests using Supertest verifying authentication, telemetry endpoints, and impact analysis.
5. **Frontend Suite**: Status color mappings, telemetry ratio computations, and widget-board tile packing (gap-free layout at the default four-column arrangement).

---

## 5. Walkthrough of Critical Engineering Workflows

### Journey A: Requirement to Verification Traceability
1. Navigate to **02 Requirements**.
2. Select `REQ-002` (*Actuator stroke time shall be < 0.8s under 5kN load*).
3. The right-hand drawer displays:
   - Architecture allocation: `SYS-002` (Brushless DC Motor).
   - Linked verification procedure: `VRF-002` (Dynamic Load Test - Failed).
   - Linked safety hazard: `RSK-001` (Motor Thermal Overload).
   - Normative quality advisory audit.

### Journey B: Real Verification Test Execution (Rule 2 Enforcement)
1. Navigate to **04 Verification**.
2. Locate `VRF-002` (*Dynamic Load Test*).
3. Click **EXECUTE TEST RUN**.
4. Unlike mock prototypes, this opens a **Formal Test Execution Dialog**:
   - Record test rig configuration (`Hydraulic Dynamometer Rig #4`).
   - Witness inspector sign-off.
   - Enter empirical physical readings (e.g. `Full Stroke Duration: 0.78s`).
   - Select formal outcome (`Passed`).
   - Enter observations.
5. Click **COMMIT TEST EVIDENCE**.
6. The test outcome and observations are committed to the PostgreSQL execution ledger. Previous failed attempts are preserved historically in the **Execution Ledger**.

### Journey C: Change Control Board & Automated Ripple Effect (The Ripple Effect)
1. Navigate to **05 Change Control**.
2. In the **Impact Analysis Canvas**, select `REQ-002`.
3. The engine traverses the PostgreSQL dependency graph and reveals:
   - Affected architecture: `SYS-002` (Brushless DC Motor).
   - Invalidated test evidence: `VRF-002` (*Requires mandatory re-test*).
   - Re-opened safety risks: `RSK-001` (*Thermal FEA re-assessment required*).
4. Click **GENERATE ENGINEERING CHANGE REQUEST (ECR)** to submit a Class I Major change.
5. In **Change Requests**, review, approve the ECR, and click **PROMOTE TO ECO** to generate an authorized Engineering Change Order.

### Journey D: Enforced Stage Gate Blocker Evaluation
1. Navigate to **09 Release Gate** (or view the Telemetry Dashboard).
2. The gate evaluation displays **GATE BLOCKED** with exact failure criteria:
   - `GATE-VRF-01`: Failed verification tests detected.
   - `GATE-RSK-01`: High risks open without mitigation.
   - `GATE-QLT-01`: Open nonconformance `NC-001` in progress.
3. Attempting to click **EXECUTE FORMAL RELEASE** on a draft candidate causes the backend server to **DENY** the release with a 422 Unprocessable Entity error, listing all active blockers.
4. Once all tests pass and nonconformances are dispositioned with verified evidence in **07 Quality & NC**, the gate evaluates to **READY FOR REVIEW**, permitting formal configuration freeze.

---

## 6. Monorepo Structure

```text
nexgen-plm/
├── apps/
│   ├── web/                     # React 18 + Vite + TypeScript frontend
│   │   ├── components.json      # shadcn/ui CLI configuration (see section 7)
│   │   ├── src/
│   │   │   ├── components/      # Technical UI components (Header, StatusBadge, Search)
│   │   │   │   └── ui/          # shadcn-style registry components (draggable widget grid)
│   │   │   ├── views/           # 14 Mission control engineering modules
│   │   │   ├── lib/             # Typed API client, session manager & cn() helper
│   │   │   └── tests/           # Frontend unit tests
│   │   ├── Dockerfile
│   │   └── vite.config.ts
│   └── api/                     # Node.js Express REST API server
│       ├── src/
│       │   ├── engines/         # Gate evaluation, impact analysis, quality checkers
│       │   ├── routes/          # Typed REST API route modules
│       │   ├── tests/           # Vitest unit & integration test suites
│       │   ├── auth.ts          # bcrypt & JWT security middleware
│       │   ├── audit.ts         # Immutable audit logging service
│       │   ├── seed.ts          # Authentic demonstration dataset
│       │   └── server.ts        # Express entry point & health check
│       └── Dockerfile
├── packages/
│   └── shared-types/            # Universal TypeScript domain interfaces & DTOs
├── prisma/
│   └── schema.prisma            # Normalized PostgreSQL relational schema
├── wrangler.toml                # Cloudflare Worker config (static assets, section 8)
├── docs/
│   └── ARCHITECTURE.md          # Technical systems engineering architecture guide
├── reference/
│   └── nexgen_plm_systems_engineering_os.html  # Starting visual reference prototype
├── docker-compose.yml           # Self-hosted production orchestration
├── .env.example
├── package.json
└── README.md
```

---

## 7. Engineering Widget Board (shadcn/ui + Motion)

The mission-control home screen can be rearranged: **02 Widget Board** is the
workspace landing surface (set by `activeTab` in `apps/web/src/App.tsx`) and
renders authoritative engineering state as draggable, size-aware tiles, while
**01 Telemetry** keeps the original fixed dashboard layout.

| Piece | Path |
|---|---|
| Grid engine (registry component) | `apps/web/src/components/ui/draggable-widget-grid.tsx` |
| Reference board (simulated agent-observability data) | `apps/web/src/components/ui/draggable-widget-grid-demo.tsx` |
| Production board bound to PostgreSQL telemetry | `apps/web/src/views/WidgetBoardView.tsx` |
| shadcn CLI configuration | `apps/web/components.json` |
| `cn()` class helper | `apps/web/src/lib/utils.ts` |

### 7.1 Board interaction contract

- **Mouse / pen** — drag a tile to rearrange it. **Touch** — press and hold
  (350 ms), then drag; a plain swipe still scrolls the page.
- **Keyboard** — focus a tile, hold `Alt`, press `←`/`→`/`↑`/`↓`.
- The layout is persisted to `localStorage` under
  `nexgen.widget-board.layout.v1`; **Reset layout** in the section header
  restores the default arrangement.
- Sizes are `sm` (1×1), `wide` (2×1), `tall` (1×2) and `lg` (2×2). The tiler
  packs the sequence into a gap-free rectangle at any column count, so the
  board adapts from four columns down to two.
- Tiles expose `role="listitem"`, `aria-label`, `aria-posinset` and
  `aria-setsize`; animations honour `prefers-reduced-motion`.

### 7.2 Adding a tile to the live board

1. Append an entry to `DEFAULT_BOARD` in `views/WidgetBoardView.tsx`
   (`{ id, kind, size, label }`) — keep the total area a multiple of four so the
   exact tiler can fill the four-column board.
2. Add the matching renderer to the `TILES` record. Each renderer receives
   `{ telemetry, onNavigate }`, where `telemetry` is the response of
   `GET /api/v1/projects/:id/telemetry`.
3. Reuse the tile primitives (`Frame`, `Figure`, `Meter`, `Stat`, `Jump`) and
   theme tokens (`bg-card`, `text-muted-foreground`, `ring-border`, `bg-brand`)
   so tiles follow the mission-control theme.

### 7.3 shadcn/ui structure

This monorepo is a **Vite + React 18 + TypeScript + Tailwind 3** workspace, so
shadcn's `components/ui` convention is kept inside the web app:

```text
apps/web/
├── components.json            # shadcn CLI config (aliases, tailwind paths)
├── tailwind.config.js         # token colours + tailwindcss-animate + container queries
├── tsconfig.json              # "@/*" -> "./src/*"
└── src/
    ├── components/ui/         # <-- all shadcn/registry components live here
    ├── components/            # application components (Header, StatusBadge, …)
    ├── lib/utils.ts           # cn()
    └── index.css              # design tokens (--color-*)
```

`src/components/ui` is required, not cosmetic:

- `components.json` declares `"ui": "@/components/ui"`, and the shadcn CLI writes
  every `add` into that folder; a different path makes registry components land
  beside hand-written app components and breaks their relative imports.
- Registry snippets import siblings as `@/components/ui/<name>` and expect the
  `@/*` alias; the board demo uses exactly that form.
- Keeping the folder in the web workspace (rather than the monorepo root) keeps
  Tailwind's `content` globs, Vite aliasing and TypeScript `paths` consistent —
  there is one `tsconfig.json` per workspace.

Adding more registry components:

```bash
cd apps/web
npx shadcn@latest add button card tooltip   # reads components.json, installs deps
```

Starting from an empty project, the equivalent bootstrap is:

```bash
npm create vite@latest my-app -- --template react-ts   # TypeScript + React
cd my-app && npm install
npm install -D tailwindcss@3 postcss autoprefixer tailwindcss-animate @tailwindcss/container-queries
npx tailwindcss init -p
npx shadcn@latest init                                  # creates components/ui + components.json
npx shadcn@latest add <component>
```

### 7.4 Tailwind theme tokens

`tailwind.config.js` maps the shadcn token names to CSS variables defined in
`src/index.css`:

```js
const token = (name, fallback) =>
  `color-mix(in srgb, var(--color-${name}, ${fallback}) calc(<alpha-value> * 100%), transparent)`;
```

Two details make this configuration work:

- Tailwind 3 cannot apply an `/opacity` modifier to a bare `var(…)` colour, so
  tokens are wrapped in `color-mix()` — that keeps `bg-foreground/15`,
  `bg-muted-foreground/60` and `ring-foreground/40` working.
- Token values are plain colours (`#0a0a0a`), **not** HSL channel triples. The
  board's own palette override (light + dark) relies on this, and the global
  `border-radius` clamp in `index.css` explicitly opts widget tiles out so their
  `radius` prop is honoured.

### 7.5 Previewing without PostgreSQL

The board is client-only: with the API stopped it renders the offline banner and
placeholder figures, and **Reference board** (code-split, loaded on demand)
shows the full simulated board. Start the stack (`npm run dev:api` with
PostgreSQL seeded) to populate authoritative values.

---

## 8. Deployment

### 8.1 Cloudflare Workers (`pdlc`)

The Worker named `pdlc` publishes the built single-page app as static assets.
Configuration lives in the repository so Workers Builds needs no dashboard
tweaks beyond the defaults:

| Setting | Value |
|---|---|
| Root directory | repository root (or `apps/web` — both configs exist, see below) |
| Build command | `npm run build` (default — builds `shared-types` + `web`) |
| Deploy command | `npx wrangler deploy` (default), or `npm run deploy` |
| Config file | `/wrangler.toml` (root directory) or `/apps/web/wrangler.toml` |
| Assets directory | `apps/web/dist` (root) / `dist` (web workspace) |
| Node version | `.nvmrc` → 22 (`engines.node >= 20`) |

`wrangler.toml` uses an assets-only Worker:

```toml
name = "pdlc"
compatibility_date = "2026-10-12"

[assets]
directory = "./apps/web/dist"
not_found_handling = "single-page-application"
```

`not_found_handling = "single-page-application"` serves `index.html` for
unknown paths, so deep links do not 404. `apps/web/public/_redirects` repeats
that rule for Pages/Netlify-style hosts.

Both `wrangler.toml` files describe the same Worker, so the project deploys
whether the dashboard's root directory is the repository root or `apps/web`
(they differ only in the relative assets path). Each also carries an
`[env.production]` block: Workers Builds sometimes appends `--env production`,
which fails with "No configuration found for environment" when no environment
is defined, and the explicit `name` keeps the deploy target on the `pdlc`
Worker instead of `pdlc-production`.

Verify the deploy locally without publishing anything:

```bash
npm run build
npm run deploy:dry-run   # npx wrangler deploy --dry-run
```

The Worker serves only the frontend. `apps/web/src/lib/api.ts` calls the API at
the relative path `/api/v1/…`, so on the Worker origin those requests 404 and the
board falls back to its offline banner; point the app at a deployed API with a
reverse proxy route or `VITE_API_URL` when the backend is hosted.

### 8.2 Other hosts

- **Docker Compose** — `docker compose up -d` (section 2, option C) serves the
  same `apps/web/dist` through Nginx with `/api` proxied to the API container.
- **Vercel / Netlify** — set the project root directory to `apps/web`, the build
  command to `npm run build --workspace=@nexgen/web` (or run `npm run build`
  from the repository root) and the output directory to `apps/web/dist`.
  The repository has no `vercel.json` or `netlify.toml`, so these settings live
  in each project's dashboard.

---

## 9. License

Licensed under the MIT License. Built for rigorous engineering organizations.
