#!/usr/bin/env bash
# Aquece o cache de grupos das inboxes CONECTADAS (descobertas dinamicamente
# via /ext/api/inboxes). Se adapta sozinho quando instancias mudam.
set -uo pipefail
BASE="https://chat.moveisvalcenter.com.br"
LOG="/var/log/groups-warmup.log"
ts(){ date '+%Y-%m-%d %H:%M:%S'; }
ids=$(curl -s --max-time 30 -H "Origin: $BASE" "$BASE/ext/api/inboxes" 2>/dev/null \
  | grep -oE '"inbox_id":[0-9]+' | grep -oE '[0-9]+')
[ -z "$ids" ] && echo "$(ts) sem inboxes conectadas (ou API fora)" >> "$LOG"
for id in $ids; do
  code=$(curl -s -o /dev/null --max-time 250 -w '%{http_code}' \
    -H "Origin: $BASE" "$BASE/ext/api/groups?inbox_id=$id" 2>/dev/null)
  echo "$(ts) inbox $id -> HTTP $code" >> "$LOG"
  sleep 30
done
tail -n 1000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" 2>/dev/null || true
