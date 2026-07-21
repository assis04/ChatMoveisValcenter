#!/usr/bin/env bash
# Evolution WhatsApp health-check + auto-recovery (probe INTERNO via docker exec/node).
# Descobre as instancias DINAMICAMENTE (fetchInstances) — se adapta quando
# instancias sao adicionadas/removidas, sem precisar editar este script.
set -uo pipefail

CONTAINER="chatcenter_evolution"
PROBE_NUMBER="5511953437880"
LOG="/var/log/evolution-healthcheck.log"
COOLDOWN_FILE="/tmp/evo-hc-last-restart"
COOLDOWN_SECONDS=900

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

# probe INTERNO: node fetch em 127.0.0.1:8080 dentro do container (sem DNS/nginx/subdominio)
probe(){
  timeout 40 docker exec "$CONTAINER" node -e '
    fetch("http://127.0.0.1:8080/chat/whatsappNumbers/"+process.argv[1],{
      method:"POST",
      headers:{apikey:process.env.AUTHENTICATION_API_KEY,"content-type":"application/json"},
      body:JSON.stringify({numbers:[process.argv[2]]})
    }).then(r=>r.text()).then(t=>{process.stdout.write(t);process.exit(0)})
     .catch(e=>{process.stdout.write("PROBE_ERR:"+e.message);process.exit(1)})
  ' "$1" "$PROBE_NUMBER" 2>/dev/null || echo ""
}

running=$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo "false")
if [ "$running" != "true" ]; then
  log "CONTAINER FORA DO AR."; restart_container; exit 0
fi

# Descobre as instancias existentes dinamicamente (nao mais hardcoded).
mapfile -t INSTANCES < <(timeout 40 docker exec "$CONTAINER" node -e '
  fetch("http://127.0.0.1:8080/instance/fetchInstances",{headers:{apikey:process.env.AUTHENTICATION_API_KEY}})
    .then(r=>r.json())
    .then(d=>{(Array.isArray(d)?d:[]).forEach(i=>{ if(i&&i.name) console.log(i.name) })})
    .catch(()=>{})
' 2>/dev/null)

# Sem instancias = API nao respondeu (container up mas Evolution travado) -> recuperar.
if [ "${#INSTANCES[@]}" -eq 0 ]; then
  log "SEM INSTANCIAS (Evolution nao respondeu fetchInstances) -> tratando como nao-saudavel"
  restart_container
  exit 0
fi

dead=0
for inst in "${INSTANCES[@]}"; do
  r=$(probe "$inst")
  if echo "$r" | grep -q '"exists"'; then
    log "OK    $inst"
  else
    sleep 5; r=$(probe "$inst")
    if echo "$r" | grep -q '"exists"'; then
      log "OK    $inst (recheck)"
    else
      log "MORTO $inst -> ${r:0:120}"; dead=1
    fi
  fi
done

[ "$dead" -eq 1 ] && restart_container

[ -f "$LOG" ] && { tail -n 2000 "$LOG" > "${LOG}.tmp" 2>/dev/null && mv "${LOG}.tmp" "$LOG" 2>/dev/null || true; }
