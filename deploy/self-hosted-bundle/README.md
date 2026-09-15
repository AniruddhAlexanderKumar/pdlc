# PDLC Platform — self-hosted bundle

This is a deployment configuration bundle, not a standalone installer. It
contains exactly three things:

- `docker-compose.prod.yml` — the real production Compose file this project
  ships and tests against (identical to the one in the repository root).
- `.env.production.example` — the environment variable template, copied
  from `.env.example`.
- `setup.sh` — a script that clones the application source (this bundle
  does not embed it), fills in your PostgreSQL credentials, and runs the
  same three-command deploy sequence documented in `DEPLOYMENT.md`.

**What this bundle does and does not do**

- It does **not** contain the application's source code. `setup.sh` clones
  it from `https://github.com/The-5-man-mission/pdlc` — this is the one
  network call the whole process makes, and it is stated here plainly
  rather than left for you to discover. If you already have the source
  checked out, point `setup.sh` at it instead (see the script's own `--path`
  flag) and it makes no network call at all.
- It does **not** install Docker, Node.js, or PostgreSQL for you — see
  "Prerequisites" below.
- It is **not** a Windows-native installer (no `.exe`/`.msi`, no Windows
  Service registration). It runs the same way on Linux, macOS, or Windows
  with Docker Desktop / WSL2. A real Windows installer is a stated, not-yet
  -built goal — see the download page for the current state of that work.

## Prerequisites

- Docker or Podman, and Docker Compose.
- `git`, to clone the source (unless you already have it).
- A PostgreSQL 17 instance is provisioned *for* you by
  `docker-compose.prod.yml` itself — you do not need one separately.

## Usage

```sh
chmod +x setup.sh
./setup.sh
```

The script will:

1. Ask where to put (or find) the application source and clone it if needed.
2. Copy `.env.production.example` to `.env.production` and prompt for a
   PostgreSQL password (or generate one), writing nothing you didn't
   confirm.
3. Run the exact three commands `DEPLOYMENT.md` documents: build, migrate,
   then start.
4. Print the URL to open and remind you that a reverse proxy for TLS is
   your responsibility — this application does not terminate TLS itself.

Everything it does is visible in `setup.sh` itself before you run it — it
is a plain shell script, not a compiled binary.

## Full documentation

`DEPLOYMENT.md` in the cloned source is the authoritative deployment guide.
This bundle is a convenience wrapper around it, not a replacement for it.
