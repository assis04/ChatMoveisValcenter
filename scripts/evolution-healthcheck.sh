#!/usr/bin/env bash
# Evolution WhatsApp health-check + auto-recovery
# Detecta socket zumbi (connectionStatus mente) e reinicia o container.
set -uo pipefail

CONTAINER="chatcenter_evolution"
BASE="https://evolution.moveisvalcenter.com.br"
INSTANCES=("Valcenter_Lucas" "Valcenter_ADM")
PROBE_NUMBER="5511953437880"      # so consulta presenca; NAO envia mensagem
LOG="/var/log/evolution-healthcheck.log"
COOLDOWN_FILE="/tmp/evo-hc-last-restart"
COOLDOWN_SECONDS=900              # no maximo 1 restart / 15 min

ts(){ date '+%Y-%m-%d %H:%M:%S'; }
log(){ echo "$(ts) $*" >> "$LOG"; }

restart_container(){
  local now last; now=$(date +%s); last=0
  [ -f "$COOLDOWN_FILE" ] && last=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)
  if [ $((now - last)) -lt "$COOLDOWN_SECONDS" ]; then
    log "  -> em COOLDOWN ($((now-last))s). Sem acao."; return
  fi
  log "  -> reiniciando $CONTAINER ..."
  if docker restart "$CONTAINER" >/dev/null 2>&1; then
    echo "$now" > "$COOLDOWN_FILE"; log "  -> restart OK."
  else
    log "  -> ERRO ao reiniciar."
  fi
}

running=$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo "false")
if [ "$running" != "true" ]; then
  log "CONTAINER FORA DO AR."; restart_container; exit 0
fi

KEY=$(docker exec "$CONTAINER" printenv AUTHENTICATION_API_KEY 2>/dev/null || echo "")
if [ -z "$KEY" ]; then
  log "AVISO: container up mas sem API key (exec falhou). Pulando ciclo."; exit 0
fi

probe(){
  curl -s --max-time 30 -X POST -H "apikey: $KEY" -H "Content-Type: application/json" \
    "$BASE/chat/whatsappNumbers/$1" -d "{\"numbers\":[\"$PROBE_NUMBER\"]}" 2>/dev/null || echo ""
}

dead=0
for inst in "${INSTANCES[@]}"; do
  r=$(probe "$inst")
  if echo "$r" | grep -q '"exists"'; then
    log "OK    $inst"
  else
    sleep 5; r=$(probe "$inst")   # recheck anti falso-positivo
    if echo "$r" | grep -q '"exists"'; then
      log "OK    $inst (recheck)"
    else
      log "MORTO $inst -> ${r:0:120}"; dead=1
    fi
  fi
done

[ "$dead" -eq 1 ] && restart_container

[ -f "$LOG" ] && { tail -n 2000 "$LOG" > "${LOG}.tmp" 2>/dev/null && mv "${LOG}.tmp" "$LOG" 2>/dev/null || true; }
