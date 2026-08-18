#!/usr/bin/env bash
# Aquece o cache de grupos das inboxes CONECTADAS (descobertas dinamicamente
# via /ext/api/inboxes). Se adapta sozinho quando instancias mudam.
# Pos-escopo: as rotas de grupo exigem o token x-cw-ctx. Este script interno
# assina um token de admin (is_admin => todas as inboxes) com o GROUP_CTX_SECRET.
set -uo pipefail
BASE="https://chat.moveisvalcenter.com.br"
LOG="/var/log/groups-warmup.log"
ENV_FILE="/root/chatcenter/.env"
ts(){ date '+%Y-%m-%d %H:%M:%S'; }
b64url(){ openssl base64 -A | tr '+/' '-_' | tr -d '='; }

SECRET=$(grep -E '^GROUP_CTX_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2-)
if [ -z "$SECRET" ]; then echo "$(ts) GROUP_CTX_SECRET ausente em $ENV_FILE" >> "$LOG"; exit 1; fi
now=$(date +%s); exp=$((now+3600))
h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
p=$(printf '{"is_admin":true,"inbox_ids":[],"iat":%d,"exp":%d}' "$now" "$exp" | b64url)
sig=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$SECRET" -binary | b64url)
TOKEN="$h.$p.$sig"

ids=$(curl -s --max-time 30 -H "Origin: $BASE" -H "x-cw-ctx: $TOKEN" "$BASE/ext/api/inboxes" 2>/dev/null \
  | grep -oE '"inbox_id":[0-9]+' | grep -oE '[0-9]+')
[ -z "$ids" ] && echo "$(ts) sem inboxes conectadas (ou API fora)" >> "$LOG"
for id in $ids; do
  code=$(curl -s -o /dev/null --max-time 250 -w '%{http_code}' \
    -H "Origin: $BASE" -H "x-cw-ctx: $TOKEN" "$BASE/ext/api/groups?inbox_id=$id" 2>/dev/null)
  echo "$(ts) inbox $id -> HTTP $code" >> "$LOG"
  sleep 30
done
tail -n 1000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" 2>/dev/null || true
