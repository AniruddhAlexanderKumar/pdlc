# Deployment Guide

## Prerequisites

* **Node.js:** `>= 20.9.0` (LTS recommended)
* **PostgreSQL:** Version 17 (or compatible managed service like AWS Aurora / Cloud SQL)
* **Docker:** Engine 24+ & Docker Compose (for local development or containerized deployment)

---

## Local Development Setup

1. **Clone repository & install dependencies:**
   ```bash
   npm ci
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your local credentials and SEED_ADMIN_PASSWORD
   ```

3. **Start PostgreSQL container:**
   ```bash
   docker compose up -d --wait
   ```

4. **Generate Prisma Client & apply migrations:**
   ```bash
   npx prisma generate
   npm run db:migrate:deploy
   ```

5. **Seed local database (optional):**
   ```bash
   npm run db:seed
   ```

6. **Start development server:**
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```

---

## Production Deployment (Docker)

### 1. Build the Production Container
```bash
docker build -t pdlc-platform:latest .
```

### 2. Run the Container
```bash
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:password@db-host:5432/pdlc_prod?schema=public" \
  -e NODE_ENV="production" \
  -e LOG_LEVEL="info" \
  -e NEXT_PUBLIC_APP_NAME="PDLC Platform" \
  --name pdlc-platform \
  pdlc-platform:latest
```

### 3. Kubernetes / GovCloud Deployment
For defense or high-security deployments (ITAR/EAR):
* Package the container image into an internal secure registry.
* Mount secrets (`DATABASE_URL`) via Kubernetes Secrets or Vault.
* Apply database migrations via a Kubernetes `Job` executing `npx prisma migrate deploy` before rolling out the application pods.

---

## Free Cloud Hosting Options

For demoing, staging, or pitches without cloud infrastructure costs:

| Component | Recommended Free Provider | Free Tier Details |
| :--- | :--- | :--- |
| **Next.js Web App** | **Vercel** (Hobby) | Free forever, automated git-push builds, zero-config Next.js 16 App Router support. |
| **PostgreSQL Database** | **Neon** or **Supabase** | **Neon:** Free serverless Postgres (0.5GB storage, instant branching, connection pooling). <br>**Supabase:** Free 500MB Postgres instance. |
| **Full Stack (Self-Hosted VPS)** | **Oracle Cloud (OCI) Always Free** | Free forever: Up to 4 ARM cores, 24GB RAM, 200GB storage. Can run Docker Compose without cold starts. |

