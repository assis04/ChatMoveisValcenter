#!/usr/bin/env bash
# errscan.sh - varredura SOMENTE LEITURA de erros recentes: host, containers e Chatwoot.
# Nao reinicia nem grava nada. Saida segura pra colar: mascara chaves/tokens/e-mails,
# troca digitos por # (some telefone/id) e agrupa linhas iguais.
# Uso: bash /root/chatcenter/scripts/errscan.sh [HORAS]    (padrao 72)
set -u
H=${1:-72}
TOP=${TOP:-8}

norm() {
  sed -E \
    -e 's/((api_?key|apikey|token|secret|password|authorization|bearer)[^A-Za-z0-9]{1,4})[A-Za-z0-9._~+\/=-]{6,}/\1***/Ig' \
    -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/<email>/g' \
    -e 's/\?[^ "]*/?<q>/g' \
    -e 's/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/<uuid>/Ig' \
    -e 's/\b[0-9A-F]{16,}\b/<id>/Ig' \
    -e 's/[0-9]+/#/g' \
    -e 's/[[:space:]]+/ /g' | cut -c1-170
}

# scan <container> <regex de erro> [regex de ruido a ignorar]
scan() {
  local c=$1 re=$2 ex=${3:-'^$'} tmp n
  if ! docker inspect "$c" >/dev/null 2>&1; then echo "== $c: (nao existe)"; return; fi
  tmp=$(mktemp)
  docker logs -t --since "${H}h" "$c" 2>&1 | grep -aE "$re" | grep -avE "$ex" > "$tmp"
  n=$(wc -l < "$tmp")
  echo "== $c: $n linhas de erro em ${H}h | por dia: $(cut -c6-10 "$tmp" | sort | uniq -c | awk '{printf "%s=%s ", $2, $1}')"
  [ "$n" -gt 0 ] && cut -d' ' -f2- "$tmp" | norm | sort | uniq -c | sort -rn | head -"$TOP"
  rm -f "$tmp"
}

echo "##### HOST ($(date '+%d/%m %H:%M') | janela ${H}h)"
uptime
free -m | sed -n '1,3p'
df -h / | tail -1
echo "-- unidades systemd com falha:"
systemctl --failed --no-legend --plain | head -5
echo "-- processos mortos por falta de memoria (7d):"
journalctl -k --since "7 days ago" -o short-iso --no-pager 2>/dev/null | grep -i 'killed process' \
  | awk '{match($0, /Killed process [0-9]+ \([^)]+\)/); print substr($1, 1, 16), substr($0, RSTART, RLENGTH)}' | tail -8
echo "-- journal nivel err (${H}h):"
journalctl -p err --since "${H} hours ago" --no-pager -o cat 2>/dev/null | norm | sort | uniq -c | sort -rn | head -"$TOP"

echo; echo "##### CONTAINERS"
docker ps -a --format '{{.Names}}' | sort | while read -r c; do
  docker inspect -f '{{.Name}} {{.State.Status}} restarts={{.RestartCount}} oom={{.State.OOMKilled}} exit={{.State.ExitCode}} desde={{.State.StartedAt}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}-{{end}}' "$c" \
    | sed -E 's#^/##; s/\.[0-9]+Z/Z/'
done
docker stats --no-stream --format '{{.Name}} mem={{.MemUsage}} cpu={{.CPUPerc}}' | sort

echo; echo "##### ERROS POR CONTAINER"
RB_NOISE='\.rb:[0-9]+:in |/gems/|^\S+ \s+from |RubyLLM|rubyllm|deprecat'
scan chatcenter_chatwoot_web     'ERROR|FATAL|E, \[|F, \[|[A-Z][A-Za-z]+(Error|Exception)\b|Errno::|Completed 5[0-9][0-9]' "$RB_NOISE"
scan chatcenter_chatwoot_sidekiq 'ERROR|FATAL|E, \[|F, \[|[A-Z][A-Za-z]+(Error|Exception)\b|Errno::|raised exception' "$RB_NOISE"
scan chatcenter_evolution        'ERROR|FATAL|Unhandled|uncaught|"level":(50|60)'
scan chatcenter_app              'Error|ERROR|Unhandled|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN'
scan chatcenter_postgres         'ERROR:|FATAL:|PANIC:'
scan chatcenter_redis            'WARNING|Error|MISCONF|OOM|Can.t'
scan chatcenter_nginx            '\[(error|crit|alert|emerg)\]'
scan chatcenter_moodle           'Fatal|PHP Warning|:error\]|ERROR|Exception'

echo; echo "##### NGINX: respostas 5xx/499 por rota (${H}h)"
NG=$(docker logs --since "${H}h" chatcenter_nginx 2>/dev/null | awk '
  { tot++ }
  $9 ~ /^(5[0-9][0-9]|499)$/ {
    split($7, p, "?"); n = split(p[1], s, "/"); k = "/" s[2]; if (n > 2) k = k "/" s[3]
    gsub(/[0-9]+/, "#", k); m = $6; gsub(/"/, "", m); bad[$9 " " m " " k]++; nb++
  }
  END { printf "total=%d erro=%d\n", tot, nb; for (x in bad) printf "%6d %s\n", bad[x], x }')
echo "$NG" | grep '^total='
echo "$NG" | grep -v '^total=' | sort -rn | head -12

echo; echo "##### CHATWOOT (Sidekiq + mensagens que falharam)"
docker exec -i -e H="$H" chatcenter_chatwoot_web bundle exec rails runner - <<'RBEOF' 2>&1 | grep -vE 'RubyLLM|rubyllm|ip_lookup|^[WI], |^$'
require 'sidekiq/api'
since = ENV.fetch('H', '72').to_i.hours.ago
scrub = ->(s) { s.to_s.gsub(/[\w.+-]+@[\w.-]+/, '<email>').gsub(/\d+/, '#')[0, 100] }
queues = Sidekiq::Queue.all.map { |q| "#{q.name}=#{q.size}" }.join(' ')
puts "sidekiq: processos=#{Sidekiq::ProcessSet.new.size} filas[#{queues}] retry=#{Sidekiq::RetrySet.new.size} " \
     "dead=#{Sidekiq::DeadSet.new.size} agendados=#{Sidekiq::ScheduledSet.new.size}"
tally = Hash.new(0)
[Sidekiq::RetrySet.new, Sidekiq::DeadSet.new].each do |set|
  set.each do |j|
    next if j['failed_at'] && Time.zone.at(j['failed_at'].to_f) < since

    tally["#{set.name} #{j.display_class} | #{j['error_class']}: #{scrub.(j['error_message'])}"] += 1
  end
end
puts "  jobs com falha na janela (retry/dead):#{' nenhum' if tally.empty?}"
tally.sort_by { |_, v| -v }.first(12).each { |k, v| puts format('  %4d %s', v, k) }

out = Message.unscoped.where(message_type: :outgoing, created_at: since..)
bad = out.where(status: :failed)
puts "mensagens de saida: #{out.count} | com falha: #{bad.count} | por dia: " +
     bad.group(Arel.sql("to_char(created_at - interval '3 hours', 'DD/MM')")).count.sort.map { |d, v| "#{d}=#{v}" }.join(' ')
bad.group(:inbox_id).count.sort_by { |_, v| -v }.each { |iid, v| puts format('  %4d caixa %s', v, Inbox.find_by(id: iid)&.name) }
bad.order(id: :desc).limit(1000).map { |m| scrub.(m.content_attributes['external_error']).presence || '(sem motivo)' }
   .tally.sort_by { |_, v| -v }.first(8).each { |k, v| puts format('  %4d motivo: %s', v, k) }
RBEOF

echo; echo "##### ROTINAS (watchdog, disjuntor, backup, TLS)"
for f in $(ls -t /root/chatcenter/*.log /root/chatcenter/*/*.log /var/log/*watchdog*.log /var/log/evolution-*.log 2>/dev/null | head -6); do
  echo "-- $f (modificado $(date -r "$f" '+%d/%m %H:%M')), ultimas linhas que nao sao OK:"
  grep -aivE '(^|[^a-z])ok([^a-z]|$)|^$' "$f" | tail -5 | norm
done
[ -f /root/chatcenter/watchdog-state/state.json ] && { echo "-- estado do watchdog:"; head -c 1200 /root/chatcenter/watchdog-state/state.json | sed -E 's/[0-9]{8,}/<num>/g'; echo; }
echo "-- ultimos backups do Moodle:"; ls -lt /root/backups/moodle 2>/dev/null | sed -n '2,4p' | awk '{print $6, $7, $8, $5, $9}'
echo "-- certificados TLS:"; docker exec chatcenter_certbot certbot certificates 2>/dev/null | grep -E 'Certificate Name|Expiry' | sed -E 's/^ +//'
echo "##### FIM"
