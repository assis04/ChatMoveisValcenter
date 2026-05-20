#!/bin/bash
set -e

BACKUP_DIR="/root/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "=== Chatcenter Backup ($DATE) ==="

# Backup Chatwoot PostgreSQL
echo ">>> Backing up Chatwoot database..."
docker exec chatcenter_postgres pg_dump -U chatcenter chatwoot_production | gzip > "$BACKUP_DIR/chatwoot_db_$DATE.sql.gz"

# Backup .env files
echo ">>> Backing up configs..."
cp /root/chatcenter/.env "$BACKUP_DIR/env_$DATE.bak"
cp /root/chatcenter/apps/web/.env.production "$BACKUP_DIR/env_web_$DATE.bak" 2>/dev/null || true

# Cleanup old backups (keep last 7)
echo ">>> Cleaning old backups..."
ls -t "$BACKUP_DIR"/chatwoot_db_*.sql.gz | tail -n +8 | xargs rm -f 2>/dev/null || true

echo "=== Backup complete: $BACKUP_DIR ==="
ls -lh "$BACKUP_DIR"/*"$DATE"*
