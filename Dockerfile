# Production application image.
#
# Three stages: install dependencies once, build once (with the full
# dev+prod dependency set, which the build needs), then assemble a minimal
# runtime image from Next.js's own `output: "standalone"` trace — the actual
# runtime `node_modules` this build reached, not the full tree `npm ci`
# installed. Nothing in this image is a dev server: the entrypoint is the
# standalone server Next.js generates for `next start`-equivalent behavior,
# and `NODE_ENV=production` is set explicitly rather than assumed.
#
# `node:22-bookworm-slim` (glibc), not an Alpine/musl base: `@node-rs/argon2`
# ships prebuilt native binaries, and musl compatibility for optional
# native-dependency packages is a real, recurring failure mode for exactly
# this kind of package. Reliability over image size, as instructed.
#
# This image does not run migrations and does not seed data. See
# DEPLOYMENT.md for the migration step, which is a separate, explicit
# deployment action — not something a container boots into automatically.

ARG NODE_IMAGE=node:22-bookworm-slim

# --- deps: install once, reused by the build stage ---------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: generate the Prisma client, then build --------------------------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The generated Prisma client is not committed (see .gitignore) — every build
# regenerates it fresh from the schema actually in this build context.
RUN npx prisma generate
# Next.js reads NODE_ENV at build time to decide what it is optimizing.
ENV NODE_ENV=production
RUN npm run build

# --- runner: the actual production image ---------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# The standalone server binds this host/port; both explicit rather than
# relying on a version-specific default.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Next.js's own trace of the runtime `node_modules` this build actually
# needs, plus the compiled server and pages.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Safety net alongside the trace above: `@node-rs/argon2` is a native addon
# excluded from bundling (`serverExternalPackages` in next.config.ts) and
# resolved through platform-specific optional dependencies, which Next.js's
# static trace has historically been unreliable about capturing completely.
# Copying it explicitly costs a few megabytes and removes that risk.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@node-rs ./node_modules/@node-rs

USER nextjs

EXPOSE 3000

# No HEALTHCHECK here: Compose/orchestrator-level health checks (see
# docker-compose.prod.yml) hit /api/health and /api/health/live over HTTP,
# which needs no extra tooling baked into this image to run curl/wget with.

CMD ["node", "server.js"]
