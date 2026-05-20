#!/bin/bash
set -euo pipefail

BACKUP_DIR="/root/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=14
PG_USER="${POSTGRES_USER:-chatcenter}"

mkdir -p "$BACKUP_DIR"

echo "=== Chatcenter Backup ($DATE) ==="

# 1. Chatwoot Postgres — custom format (-Fc) so it can be restored selectively.
echo ">>> chatwoot_production..."
docker exec chatcenter_postgres pg_dump -U "$PG_USER" -Fc chatwoot_production \
  > "$BACKUP_DIR/chatwoot_db_${DATE}.dump"

# 2. Evolution Postgres — separate dump.
echo ">>> evolution_db..."
docker exec chatcenter_postgres pg_dump -U "$PG_USER" -Fc evolution_db \
  > "$BACKUP_DIR/evolution_db_${DATE}.dump"

# 3. ActiveStorage attachments (Chatwoot uploads — images, audios, files).
echo ">>> chatwoot storage..."
docker run --rm -v chatcenter_chatwoot_storage:/data -v "$BACKUP_DIR":/backup \
  alpine tar czf "/backup/chatwoot_storage_${DATE}.tar.gz" -C /data .

# 4. Retention — keep $RETENTION_DAYS days, drop older.
echo ">>> retention (>${RETENTION_DAYS}d)..."
find "$BACKUP_DIR" -maxdepth 1 -type f \( \
    -name 'chatwoot_db_*.dump' -o \
    -name 'evolution_db_*.dump' -o \
    -name 'chatwoot_storage_*.tar.gz' \
  \) -mtime "+$RETENTION_DAYS" -delete

# Note: we no longer back up .env files. The encrypted source of truth lives in
# git (`secrets/*.enc.yaml`). Decrypted env files on the host are derived state.

echo "=== Backup complete: $BACKUP_DIR ==="
ls -lh "$BACKUP_DIR"/*"$DATE"*
