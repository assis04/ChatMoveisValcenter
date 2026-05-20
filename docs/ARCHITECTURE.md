# Arquitetura — ChatMoveisValcenter

> Estado atual. As decisões load-bearing têm ADR próprio em `docs/adr/`.

## Visão geral

```
        Internet
            │
            ▼
        ┌─────────┐    chat.moveisvalcenter.com.br
        │  Nginx  │    80 → 443 (TLS via Let's Encrypt)
        │  alpine │
        └────┬────┘
             │
   ┌─────────┼──────────────────────────────────────────────┐
   │         │                                              │
   ▼         ▼                                              ▼
┌────────┐ ┌────────────────┐                       ┌──────────────┐
│Chatwoot│ │ chatcenter-app │                       │ Evolution API│
│  (web) │ │  (Next.js 15)  │                       │   (WhatsApp) │
│  :3000 │ │     :3001      │                       │     :8080    │
└────┬───┘ └────────┬───────┘                       └──────┬───────┘
     │              │                                      │
     │ ┌────────────┴────────────────┐                     │
     │ │                             │                     │
     ▼ ▼                             ▼                     ▼
┌──────────┐                    ┌──────────┐         ┌──────────┐
│ Chatwoot │                    │ Supabase │         │   Redis  │
│ Sidekiq  │                    │  (auth + │         │    :6379 │
│ (worker) │                    │  storage)│         │          │
└────┬─────┘                    └──────────┘         └────┬─────┘
     │                                                    │
     ▼                                                    ▼
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL 16 + pgvector                                   │
│  databases: chatwoot_production, evolution_db               │
└─────────────────────────────────────────────────────────────┘
```

## Serviços (`docker-compose.yml`)

| Container | Imagem | Função |
| --- | --- | --- |
| `chatcenter_nginx` | `nginx:alpine` | Reverse proxy + TLS; faz routing por path |
| `chatcenter_certbot` | `certbot/certbot` | Loop de renovação Let's Encrypt |
| `chatcenter_chatwoot_web` | `chatcenter/chatwoot:v4.14.0-search` | Chatwoot Rails web — fork interno (ver ADR 0003) |
| `chatcenter_chatwoot_sidekiq` | mesma imagem | Worker Sidekiq do Chatwoot |
| `chatcenter_app` | `chatcenter-app:latest` | App Next.js — Dashboard App embedado + webhooks |
| `chatcenter_evolution` | `evoapicloud/evolution-api:v2.3.7` | Bridge oficial WhatsApp ↔ Chatwoot |
| `chatcenter_postgres` | `pgvector/pgvector:pg16` | Postgres com extensão de vetores |
| `chatcenter_redis` | `redis:7-alpine` | Cache + filas Sidekiq + cache Evolution |

## Routing Nginx

| Path público | Upstream interno |
| --- | --- |
| `/` | `chatwoot-web:3000` (UI principal do Chatwoot) |
| `/ext/*` | `app:3001` (Next.js — Dashboard App e páginas internas) |
| `/evolution/*` | `evolution:8080` (Evolution API com prefixo) |

Headers: rate limit 30 r/s (`api`), 60 r/s (`webhooks`); `underscores_in_headers on` para os tokens `api_access_token` do Chatwoot.

## Fluxos de dados

### 1. Mensagem entrando do WhatsApp
1. WhatsApp → Evolution API recebe via webhook do Meta.
2. Evolution grava em `evolution_db` (mensagens, contatos, instâncias).
3. Evolution chama o Chatwoot (`CHATWOOT_ENABLED=true`) e cria conversa/mensagem em `chatwoot_production`.
4. Chatwoot dispara webhook `message_created` → `https://chat.moveisvalcenter.com.br/ext/api/webhooks/chatwoot`.
5. `apps/web` recebe e processa (atualmente stub — ver `TODO Module 2`).

### 2. Agente respondendo no Chatwoot UI
1. Agente envia mensagem na interface do Chatwoot.
2. Sidekiq processa o job de envio.
3. Chatwoot chama Evolution via API interna; Evolution despacha pro WhatsApp.

### 3. Dashboard App (Next.js embedado)
1. Chatwoot embeda o iframe `https://chat.moveisvalcenter.com.br/ext/dashboard-app/<page>` numa aba.
2. Chatwoot envia o contexto da conversa via `postMessage` (`chatwoot-dashboard-app:context`).
3. `apps/web/src/app/dashboard-app/layout.tsx` captura e disponibiliza pra árvore.

### 4. Pagamento (Asaas)
1. Asaas → webhook → `https://chat.moveisvalcenter.com.br/ext/api/webhooks/asaas`.
2. `apps/web` processa (atualmente stub — `TODO Module 4`).

## Customizações sobre o Chatwoot

Duas formas — usadas hoje:

1. **Patch em runtime via bind mount** (`infra/chatwoot/audio_opus_inline.rb`): inclui `audio/opus` na allowlist do `ActiveStorage.content_types_allowed_inline`, para os áudios do WhatsApp tocarem inline no player do Chatwoot em vez de fazerem download.
2. **Fork da imagem Docker** (`chatcenter/chatwoot:v4.14.0-search`): contém a modificação do `app/javascript/dashboard/components/ChatList.vue` (busca inline em PT-BR na lista de conversas). Hoje a imagem é buildada localmente no servidor — ver ADR 0003 para a migração para GHCR.

## Persistência

- `chatcenter_postgres_data` — dados de Chatwoot e Evolution.
- `chatcenter_redis_data` — filas Sidekiq, cache Evolution.
- `chatcenter_chatwoot_storage` — `/app/storage` do Chatwoot (ActiveStorage local).
- `chatcenter_certbot_certs` (external) — `/etc/letsencrypt`.
- `chatcenter_certbot_webroot` (external) — challenge ACME.

Backups: `infra/scripts/backup.sh` faz `pg_dump` + cópia do `.env`. Política de retenção atual: 7 dumps locais. Falta cron ativo e offsite — ver `docs/RUNBOOK.md`.

## Limites de memória definidos no compose

| Serviço | Limite |
| --- | --- |
| postgres | 512M |
| redis | 192M |
| chatwoot-web | 768M |
| chatwoot-sidekiq | 512M |
| evolution | 384M |
| app | 256M |

Total declarado: ~2,6 GB.
