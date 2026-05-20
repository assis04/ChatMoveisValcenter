# Deploy

## Estado atual (manual, via SSH)

1. SSH no servidor: `ssh root@<vps> -p 22022`.
2. `cd /root/chatcenter && git pull` (assim que este repo for adotado como fonte da verdade — ver "Cutover" abaixo).
3. `./infra/scripts/deploy.sh` — builda o app Next.js, roda migrations do Chatwoot, sobe os containers, mostra status.
4. Smoke test em <https://chat.moveisvalcenter.com.br>.

Rollback manual: subir a versão anterior do compose e fazer `docker compose up -d` + rollback do dump Postgres mais recente (`infra/scripts/restore.sh` — a ser criado).

## Cutover: do estado-no-servidor para repo-é-a-fonte-da-verdade

1. **Snapshot completo do servidor** (DB + tarballs) — já feito; cópia em `snapshots/` local.
2. **`git clone https://github.com/Lucashavg/ChatMoveisValcenter.git` em `/root/chatcenter-new/`** no servidor.
3. **Mover `/root/chatcenter/.env`** para `/root/chatcenter-new/.env` (mesmos valores).
4. **Mover `/root/chatcenter/apps/web/.env.production`** para o lugar equivalente.
5. **Parar o stack antigo**: `cd /root/chatcenter && docker compose down`.
6. **Renomear**: `mv /root/chatcenter /root/chatcenter-old && mv /root/chatcenter-new /root/chatcenter`.
7. **Subir**: `cd /root/chatcenter && docker compose up -d`.
8. **Validar**: containers `Up (healthy)`, login no Chatwoot, mensagem de teste via WhatsApp.
9. Após 7 dias de estabilidade, `rm -rf /root/chatcenter-old`.

## CI/CD — roadmap

Em GitHub Actions (`.github/workflows/`):

| Workflow | Trigger | Já existe? | O que falta |
| --- | --- | --- | --- |
| `ci.yml` | PR / push main | ✅ | lint + typecheck + build do `apps/web`, validate do compose |
| `image-app.yml` | push em `apps/web/**` em main | ✅ | publica `ghcr.io/lucashavg/chatcenter-app:{sha,latest}` |
| `secret-scan.yml` | PR / push main | ✅ | gitleaks |
| `image-chatwoot.yml` | push no fork `Lucashavg/chatwoot` branch `chatcenter/*` | ⏳ | builda e publica `ghcr.io/lucashavg/chatwoot:chatcenter-v4.14.0-search` |
| `deploy.yml` | manual / push main | ⏳ | SSH no servidor, faz `git pull` + `docker compose pull` + `docker compose up -d` |

Pré-requisitos para `deploy.yml`:
- Secret `DEPLOY_SSH_KEY` (chave ed25519 sem senha) configurada em GitHub → Settings → Secrets.
- Secret `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`.
- `concurrency: deploy-prod cancel-in-progress: false` para evitar deploys concorrentes.
- Environment do GitHub `production` com required reviewer (Lucas) para approval manual.

## Staging

Hoje não existe. Decisão pendente: VPS separada (~R$ 30/mês) vs. compose paralelo no mesmo host com sufixos `_staging` e portas diferentes (mais barato, blast radius maior). Ver ADR a ser criado.
