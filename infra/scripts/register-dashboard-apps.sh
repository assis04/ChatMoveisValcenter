#!/bin/bash
set -euo pipefail

# Registers (or updates) Chatwoot Dashboard Apps required by chatcenter-app.
# Idempotent — safe to re-run on every deploy. Targets the in-cluster Chatwoot
# URL by default; override CHATWOOT_API_URL to call from outside the network.
#
# Required env vars (sourced from /root/chatcenter/.env after sops decrypt):
#   CHATWOOT_API_TOKEN  — agent API token with admin role
#   CHATWOOT_ACCOUNT_ID — usually 1
#
# Optional:
#   CHATWOOT_API_URL — defaults to http://chatwoot-web:3000 (in-cluster)
#   CHATWOOT_PUBLIC_URL — defaults to https://chat.moveisvalcenter.com.br

CHATWOOT_API_URL="${CHATWOOT_API_URL:-http://chatwoot-web:3000}"
CHATWOOT_PUBLIC_URL="${CHATWOOT_PUBLIC_URL:-https://chat.moveisvalcenter.com.br}"
ACCOUNT_ID="${CHATWOOT_ACCOUNT_ID:-1}"

if [ -z "${CHATWOOT_API_TOKEN:-}" ]; then
  echo "FATAL: CHATWOOT_API_TOKEN não definido" >&2
  exit 1
fi

APP_TITLE="Gestão de Grupos"
APP_URL="${CHATWOOT_PUBLIC_URL}/ext/dashboard-app/groups"

api() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" \
      -H "Content-Type: application/json" \
      -H "api_access_token: ${CHATWOOT_API_TOKEN}" \
      -d "$body" \
      "${CHATWOOT_API_URL}/api/v1/accounts/${ACCOUNT_ID}${path}"
  else
    curl -sS -X "$method" \
      -H "api_access_token: ${CHATWOOT_API_TOKEN}" \
      "${CHATWOOT_API_URL}/api/v1/accounts/${ACCOUNT_ID}${path}"
  fi
}

echo ">>> Procurando Dashboard App existente \"${APP_TITLE}\"..."
EXISTING=$(api GET /dashboard_apps)
EXISTING_ID=$(echo "$EXISTING" | python3 -c "
import json, sys
data = json.load(sys.stdin)
items = data.get('payload', data) if isinstance(data, dict) else data
for it in (items or []):
    if it.get('title') == '${APP_TITLE}':
        print(it.get('id'))
        break
" 2>/dev/null || true)

PAYLOAD=$(cat <<EOF
{
  "title": "${APP_TITLE}",
  "content": [
    { "type": "frame", "url": "${APP_URL}" }
  ]
}
EOF
)

if [ -n "$EXISTING_ID" ]; then
  echo ">>> Atualizando Dashboard App id=${EXISTING_ID}"
  api PATCH "/dashboard_apps/${EXISTING_ID}" "$PAYLOAD" > /dev/null
  echo "OK — atualizado."
else
  echo ">>> Criando novo Dashboard App"
  api POST "/dashboard_apps" "$PAYLOAD" > /dev/null
  echo "OK — criado."
fi

echo ""
echo "Dashboard App pronto:"
echo "  Título: ${APP_TITLE}"
echo "  URL:    ${APP_URL}"
echo ""
echo "Aparece em cada conversa no painel direito do Chatwoot."
echo "Pra acessar a tela completa: ${CHATWOOT_PUBLIC_URL}/ext/grupos"
