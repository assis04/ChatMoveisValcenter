#!/bin/bash
set -e

echo "=== Chatcenter Deploy ==="

cd /root/chatcenter

# 1. Build Next.js app
echo ">>> Building Next.js app..."
docker compose build app

# 2. Run Chatwoot migrations
echo ">>> Running Chatwoot migrations..."
docker compose run --rm chatwoot-web bundle exec rails db:chatwoot_prepare

# 3. Start all services
echo ">>> Starting services..."
docker compose up -d

# 4. Health check
echo ">>> Waiting for services..."
sleep 15

echo "--- Service Status ---"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=== Deploy complete ==="
echo "Chatwoot:  https://chat.moveisvalcenter.com.br"
echo "App:       https://chat.moveisvalcenter.com.br/ext/"
echo "Evolution: https://chat.moveisvalcenter.com.br/evolution/"
