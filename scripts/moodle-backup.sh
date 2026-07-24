#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/root/backups/moodle"
KEEP_DAYS=7
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG="/var/log/moodle-backup.log"
mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

log "=== Backup Moodle iniciado ($STAMP) ==="

# 1) Banco (pg_dump do DB 'moodle' via superuser do postgres) -> gzip
DB_FILE="$BACKUP_DIR/moodle-db-$STAMP.sql.gz"
if docker exec chatcenter_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d moodle' | gzip > "$DB_FILE"; then
  log "DB OK:  $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"
else
  log "ERRO no pg_dump"; exit 1
fi

# 2) moodledata (arquivos enviados). Exclui cache/sessao (regeneraveis)
DATA_FILE="$BACKUP_DIR/moodle-data-$STAMP.tar.gz"
if tar czf "$DATA_FILE" \
     --exclude='./cache' --exclude='./localcache' --exclude='./temp' \
     --exclude='./sessions' --exclude='./trashdir' --exclude='./lock' \
     -C /var/lib/docker/volumes/chatcenter_moodle_data/_data . ; then
  log "DATA OK: $DATA_FILE ($(du -h "$DATA_FILE" | cut -f1))"
else
  log "ERRO no tar do moodledata"; exit 1
fi

# 3) Rotacao: remove backups com mais de KEEP_DAYS dias
find "$BACKUP_DIR" -name 'moodle-*' -type f -mtime +$KEEP_DAYS -delete
log "Rotacao: mantidos ultimos $KEEP_DAYS dias"
log "=== Backup concluido ==="
