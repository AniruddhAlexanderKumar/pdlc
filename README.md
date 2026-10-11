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
# Build all workspaces (shared-types, api, web)
npm run build

# Start production API server
node apps/api/dist/server.js
```

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
5. **Frontend Suite**: Status color mappings and telemetry ratio computations.

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
│   │   ├── src/
│   │   │   ├── components/      # Technical UI components (Header, StatusBadge, Search)
│   │   │   ├── views/           # 12 Mission control engineering modules
│   │   │   ├── lib/             # Typed API client & session manager
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

## 7. License

Licensed under the MIT License. Built for rigorous engineering organizations.
