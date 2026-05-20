# Runbook — Operações comuns

Servidor de produção: `root@<vps>:22022` (acesso via chave ed25519).

## Logs em tempo real

```sh
cd /root/chatcenter
docker compose logs -f --tail=200 chatwoot-web
docker compose logs -f --tail=200 chatwoot-sidekiq
docker compose logs -f --tail=200 evolution
docker compose logs -f --tail=200 app
docker compose logs -f --tail=200 nginx
```

## Restart de um serviço

```sh
cd /root/chatcenter
docker compose restart chatwoot-web    # graceful — usa o entrypoint
# ou, para rebuild + restart de uma imagem buildada localmente:
docker compose up -d --build app
```

## Backup manual

```sh
cd /root/chatcenter
./infra/scripts/backup.sh
ls -lh /root/backups
```

Para um dump pontual:
```sh
docker exec chatcenter_postgres pg_dump -U chatcenter -Fc chatwoot_production \
  > /root/backups/chatwoot_pre_op_$(date +%Y%m%d_%H%M%S).dump
```

## Restore (Chatwoot)

> Dá downtime. Avise o atendimento antes.

```sh
cd /root/chatcenter
docker compose stop chatwoot-web chatwoot-sidekiq

docker exec -i chatcenter_postgres psql -U chatcenter -c \
  "DROP DATABASE chatwoot_production WITH (FORCE);"
docker exec -i chatcenter_postgres psql -U chatcenter -c \
  "CREATE DATABASE chatwoot_production OWNER chatcenter;"

docker exec -i chatcenter_postgres pg_restore -U chatcenter -d chatwoot_production \
  < /root/backups/<dump-file>.dump

docker compose up -d chatwoot-web chatwoot-sidekiq
```

## Renovação TLS

Automático via container `chatcenter_certbot` (loop 12h). Para renovar manualmente:
```sh
docker exec chatcenter_certbot certbot renew --force-renewal
docker exec chatcenter_nginx nginx -s reload
```

## Conectar uma nova instância do WhatsApp

1. Acesse <https://chat.moveisvalcenter.com.br/evolution/manager>.
2. Login com `EVOLUTION_API_KEY` (do `.env`).
3. Crie/abra a instância e escaneie o QR.
4. No Chatwoot, vincule um inbox via webhook (a integração nativa Evolution↔Chatwoot já está habilitada — `CHATWOOT_ENABLED=true`).

## Adicionar/rotar uma variável de ambiente

Segredos vivem cifrados em `secrets/production.enc.yaml` (Chatwoot + Evolution + integrações) e `secrets/web.enc.yaml` (Next.js app). Edição via SOPS.

**Do laptop do operador** (recomendado — preserva audit trail correto):
```sh
sops secrets/production.enc.yaml      # abre $EDITOR, salva → recifra
git add secrets/production.enc.yaml
git commit -m "secrets: rotate <X>"
git push
```

Depois, no servidor:
```sh
cd /root/chatcenter && git pull && ./infra/scripts/deploy.sh
```

**No servidor (atalho):**
```sh
cd /root/chatcenter
sops secrets/production.enc.yaml
git commit -am "secrets: rotate <X>" && git push
./infra/scripts/deploy.sh
```

Pra mudar só uma variável sem reiniciar tudo:
```sh
./infra/scripts/deploy.sh   # decifra ambos os .env
docker compose up -d --no-deps <service>
```

## Migrations do Chatwoot (durante upgrade da versão)

```sh
cd /root/chatcenter
docker compose run --rm chatwoot-web bundle exec rails db:chatwoot_prepare
```

## Rebuild da imagem custom do Chatwoot (transição: hoje builda no host)

```sh
cd /root/chatwoot-fork
git fetch --tags upstream            # quando o remote estiver corrigido (ver ADR 0003)
docker build -t chatcenter/chatwoot:v4.14.0-search .
cd /root/chatcenter
docker compose up -d chatwoot-web chatwoot-sidekiq
```

Quando o fork estiver no GitHub e a imagem no GHCR, esse fluxo vira `docker compose pull && docker compose up -d`.

## Smoke test pós-deploy

- [ ] <https://chat.moveisvalcenter.com.br> carrega o login do Chatwoot
- [ ] Login funciona
- [ ] Conversas listam (sem erro 500)
- [ ] Mandar mensagem de WhatsApp de teste → chega no inbox
- [ ] Responder pelo Chatwoot → chega no WhatsApp
- [ ] Áudio do WhatsApp toca inline no player
- [ ] `/ext/` carrega a app Next.js (deve mostrar "Chatcenter operacional")
- [ ] `/evolution/manager` carrega o painel da Evolution

## O que checar quando o atendimento "ficou lento"

```sh
docker stats --no-stream
# Procurar containers em alto CPU ou perto do limite de memória.

docker compose exec postgres psql -U chatcenter -d chatwoot_production -c \
  "SELECT pid, query_start, state, query FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start;"

docker compose exec redis redis-cli info memory
```
