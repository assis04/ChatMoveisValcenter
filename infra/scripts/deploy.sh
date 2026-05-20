#!/bin/bash
set -euo pipefail

echo "=== Chatcenter Deploy ==="

cd /root/chatcenter

AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-/root/.config/sops/age/keys.txt}"

if [ ! -f "$AGE_KEY_FILE" ]; then
  echo "FATAL: missing age key at $AGE_KEY_FILE — cannot decrypt secrets." >&2
  exit 1
fi

# 1. Materialize decrypted .env files (umask 077 → 600 perms).
echo ">>> Decrypting secrets..."
umask 077
SOPS_AGE_KEY_FILE="$AGE_KEY_FILE" sops --decrypt --input-type yaml --output-type dotenv \
  secrets/production.enc.yaml > .env
SOPS_AGE_KEY_FILE="$AGE_KEY_FILE" sops --decrypt --input-type yaml --output-type dotenv \
  secrets/web.enc.yaml > apps/web/.env.production
umask 022

# 2. Build Next.js app
echo ">>> Building Next.js app..."
docker compose build app

# 3. Run Chatwoot migrations
echo ">>> Running Chatwoot migrations..."
docker compose run --rm chatwoot-web bundle exec rails db:chatwoot_prepare

# 4. Start all services
echo ">>> Starting services..."
docker compose up -d

# 5. Health check
echo ">>> Waiting for services..."
sleep 15

echo "--- Service Status ---"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=== Deploy complete ==="
echo "Chatwoot:  https://chat.moveisvalcenter.com.br"
echo "App:       https://chat.moveisvalcenter.com.br/ext/"
echo "Evolution: https://chat.moveisvalcenter.com.br/evolution/"

# Plaintext .env files remain on disk with 600 perms. They are the runtime
# input for any subsequent `docker compose` command (e.g. `up -d --build app`).
# They are gitignored. To rotate, edit `secrets/*.enc.yaml`, push, redeploy.
