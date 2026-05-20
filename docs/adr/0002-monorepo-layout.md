# 0002 — Monorepo único para stack + IaC

- Status: aceito
- Data: 2026-05-20
- Decisor: Lucas (CTO)

## Contexto

A produção tem hoje (no servidor, sem versionamento):
- `docker-compose.yml` orquestrando 8 serviços
- App Next.js custom (`apps/web/`)
- Patches Ruby injetados no Chatwoot via bind mount (`infra/chatwoot/`)
- Configuração do Nginx
- Scripts operacionais (deploy, backup, init-ssl)
- (futuro) Migrations do Supabase

Alternativas avaliadas:

| Opção | Pró | Contra |
| --- | --- | --- |
| **Monorepo único (este)** | 1 PR pra mudar app + compose + nginx atomicamente. Rollback atômico. CI vê tudo. | Builds ficam pesados sem caching seletivo; precisa de discipline com path filters. |
| Repo por serviço (`apps/web`, `infra`, etc.) | Isolamento forte; permissões granulares. | Mudanças que cruzam serviço viram 3 PRs em 3 repos; alinhamento de versão sofre. |
| Monorepo + submódulos pro fork do Chatwoot | Versionamento explícito do fork dentro deste repo. | Submódulo Git é hostil a usuário comum; `git pull` não pega o submódulo por default; quase ninguém ama. |

## Decisão

**Monorepo único** neste repo `ChatMoveisValcenter`, com o layout descrito no `README.md`. O fork do Chatwoot **fica em um repo separado** (`Lucashavg/chatwoot`) e é consumido só via imagem Docker publicada em GHCR — ver [ADR 0003](./0003-chatwoot-fork-via-ghcr.md).

`docker-compose.yml` mora na **raiz** (não em `infra/compose/`) para que os bind mounts continuem com paths relativos curtos (`./apps/web`, `./infra/chatwoot/...`).

## Consequências

✅ Mudanças cross-cutting (ex.: novo endpoint webhook que precisa de tag no Nginx) viram 1 PR atômico.
✅ Onboarding: tudo está num lugar.
✅ Path filters no `dependabot.yml` e nos workflows mantêm builds segmentados.
⚠️ Se aparecer um segundo app que NÃO compartilha infra (ex.: site institucional), vamos reconsiderar.
