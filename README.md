# ChatMoveisValcenter

Plataforma de atendimento e operação omnichannel da **Móveis Valcenter**.

Produção: <https://chat.moveisvalcenter.com.br>

## Stack

| Camada | Tecnologia |
| --- | --- |
| Atendimento | [Chatwoot](https://github.com/chatwoot/chatwoot) v4.14.0 (fork com customizações) |
| WhatsApp | [Evolution API](https://github.com/EvolutionAPI/evolution-api) v2.3.7 |
| Dashboard app | Next.js 15 + React 19 + Tailwind 4 (`apps/web/`) |
| Banco | PostgreSQL 16 + extensão `pgvector` |
| Cache / fila | Redis 7 |
| Auth & storage externo | Supabase |
| LLM | Anthropic (Claude) |
| Pagamentos | Asaas |
| Reverse proxy / TLS | Nginx + Certbot |

Tudo orquestrado por um único `docker-compose.yml` na raiz.

## Layout do repositório

```
.
├─ apps/web/              Next.js 15 dashboard app (embedado em /ext/ do Chatwoot)
├─ infra/
│  ├─ chatwoot/           Patches/initializers Ruby injetados em runtime
│  ├─ nginx/              Configuração do reverse proxy
│  └─ scripts/            backup.sh, deploy.sh, init-ssl.sh
├─ supabase/              Migrations versionadas pelo Supabase CLI
├─ docs/
│  ├─ ARCHITECTURE.md     Como tudo se conecta
│  ├─ DEPLOY.md           Como sobe pra produção
│  ├─ RUNBOOK.md          Operações comuns (backup, restore, logs, SSL…)
│  └─ adr/                Decisões arquiteturais registradas
├─ .github/               CI, CODEOWNERS, dependabot
├─ docker-compose.yml     Topologia dos serviços de produção
└─ .env.example           Template das variáveis de ambiente
```

## Desenvolvimento local

A app Next.js (`apps/web/`) pode ser desenvolvida fora do compose. Os serviços Chatwoot/Evolution/Postgres/Redis ainda exigem o stack completo subido.

```sh
cd apps/web
cp .env.example .env.local
npm install
npm run dev      # porta 3001
```

`npm run typecheck` e `npm run lint` rodam no CI a cada PR.

## Subir produção do zero

Ver [`docs/DEPLOY.md`](docs/DEPLOY.md) — passos resumidos:

1. Provisionar VPS (Ubuntu 22.04, Docker + Compose plugin).
2. Clonar este repo em `/root/chatcenter/`.
3. Preencher `.env` (a partir de `.env.example`) e `apps/web/.env.production`.
4. Subir `infra/scripts/init-ssl.sh` para obter o certificado Let's Encrypt.
5. Rodar `infra/scripts/deploy.sh`.

## Operações

Backup, restore, troca de domínio, troca de inbox, debug de webhook — tudo em [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

## Decisões arquiteturais

Decisões load-bearing têm ADR em [`docs/adr/`](docs/adr/).
