#!/usr/bin/env bash
#
# PDLC Platform — self-hosted setup.
#
# What this script actually does, in order, and nothing else:
#   1. Locates or clones the application source (the one network call this
#      script makes, and only if the source isn't already present at --path).
#   2. Copies .env.production.example to .env.production and fills in a
#      PostgreSQL password — generated if you don't supply one, never a
#      hardcoded default.
#   3. Runs the exact three-command deploy sequence documented in
#      DEPLOYMENT.md: build, migrate, then start.
#
# It does not install Docker, Node, or PostgreSQL. It does not configure a
# reverse proxy or TLS — that remains an operator step, documented in
# DEPLOYMENT.md. It makes no call to any service other than the one clone
# below.

set -euo pipefail

REPO_URL="https://github.com/The-5-man-mission/pdlc.git"
SOURCE_PATH=""
ENV_FILE=".env.production"

usage() {
  echo "Usage: ./setup.sh [--path DIR] [--repo-url URL]"
  echo "  --path DIR      Use an existing checkout instead of cloning. No network call is made."
  echo "  --repo-url URL  Clone from a different remote (e.g. a local mirror)."
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --path) SOURCE_PATH="$2"; shift 2 ;;
    --repo-url) REPO_URL="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown argument: $1"; usage ;;
  esac
done

command -v docker >/dev/null 2>&1 || { echo "docker is required and was not found on PATH."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose (v2) is required."; exit 1; }

if [ -z "$SOURCE_PATH" ]; then
  SOURCE_PATH="./pdlc"
  if [ -d "$SOURCE_PATH/.git" ]; then
    echo "Found an existing checkout at $SOURCE_PATH — not cloning again."
  else
    command -v git >/dev/null 2>&1 || { echo "git is required to clone the source. Pass --path to use an existing checkout instead."; exit 1; }
    echo "Cloning $REPO_URL into $SOURCE_PATH ..."
    git clone --depth 1 "$REPO_URL" "$SOURCE_PATH"
  fi
else
  [ -d "$SOURCE_PATH" ] || { echo "--path $SOURCE_PATH does not exist."; exit 1; }
  echo "Using existing source at $SOURCE_PATH — no network call made."
fi

cd "$SOURCE_PATH"

if [ -f "$ENV_FILE" ]; then
  echo "$ENV_FILE already exists — leaving it as is."
else
  cp "$(dirname "$0")/.env.production.example" "$ENV_FILE" 2>/dev/null || cp .env.example "$ENV_FILE"

  GENERATED_PASSWORD=$(openssl rand -base64 24 2>/dev/null | tr -d '/+=' | cut -c1-24 || date +%s%N | sha256sum | cut -c1-24)
  read -r -p "PostgreSQL password [generated: ${GENERATED_PASSWORD}]: " USER_PASSWORD
  PASSWORD="${USER_PASSWORD:-$GENERATED_PASSWORD}"

  if [ "$(uname)" = "Darwin" ]; then
    sed -i '' "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${PASSWORD}/" "$ENV_FILE"
  else
    sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${PASSWORD}/" "$ENV_FILE"
  fi
  echo "Wrote $ENV_FILE with a PostgreSQL password. This file is not committed to git — keep it out of version control."
fi

echo ""
echo "Building the image ..."
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" build

echo ""
echo "Applying database migrations ..."
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" run --rm app npx prisma migrate deploy

echo ""
echo "Starting the application ..."
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d

echo ""
echo "Done. The application is listening on 127.0.0.1:3000 — not exposed to the"
echo "network directly. Put a reverse proxy in front of it for TLS before"
echo "reaching it from anywhere but this machine; see DEPLOYMENT.md's"
echo "'Reverse proxy / TLS expectations' section."
