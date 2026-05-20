# 0003 — Fork do Chatwoot publicado como imagem no GHCR

- Status: proposto
- Data: 2026-05-20
- Decisor: Lucas (CTO)

## Contexto

Hoje a produção roda `chatcenter/chatwoot:v4.14.0-search`, uma imagem buildada localmente no servidor a partir de `/root/chatwoot-fork`. Esse fork tem dois problemas estruturais:

1. **O remote `origin` aponta pra `https://github.com/chatwoot/chatwoot.git`** (upstream). Não há fork no GitHub do Lucashavg. Qualquer `git push origin` falha por falta de permissão, e a customização **só existe no working tree em detached HEAD** (1 modificação uncommitted em `app/javascript/dashboard/components/ChatList.vue` — busca inline em PT-BR).

2. **A imagem só existe no host de produção**. Se o servidor pegar fogo, ninguém consegue reconstruir sem reproduzir o fork na mão.

Mais: o **patch em runtime via bind mount** (`infra/chatwoot/audio_opus_inline.rb`) é mais simples mas só funciona para coisas que cabem num initializer. Mudanças em templates Vue, controllers, migrations etc. exigem imagem custom.

## Decisão

1. **Criar fork oficial do Chatwoot** em `https://github.com/Lucashavg/chatwoot`.
2. **Branch nomeada** `chatcenter/v4.14.0-search`, sempre criada a partir de uma tag oficial do Chatwoot (não de `develop`).
3. **Commit da customização** atual (`ChatList.vue`) com mensagem honesta apontando para este ADR.
4. **Workflow GitHub Actions** no fork builda e publica `ghcr.io/lucashavg/chatwoot:chatcenter-v4.14.0-search` (e tag `:sha-<short>`) a cada push em `chatcenter/*`.
5. **`docker-compose.yml` deste repo passa a referenciar a imagem do GHCR**, removendo o build local.
6. **Sincronização com upstream**: ao subir para uma nova versão oficial do Chatwoot, criamos `chatcenter/vX.Y.Z` a partir da nova tag, rebasamos/cherry-pickamos os commits da branch anterior, e bumpamos a tag no compose.

## Consequências

✅ A customização tem dono explícito num repo público — fim do risco "perdi a modificação num git pull".
✅ Imagem reproduzível em qualquer máquina via `docker pull`.
✅ CI valida o build do fork sempre que mudar.
✅ Audit trail: vê o que mudamos vs. Chatwoot upstream com `git diff origin/v4.14.0...chatcenter/v4.14.0-search`.
⚠️ Adiciona um repo a manter.
⚠️ Cada bump de versão do Chatwoot exige rebase — não é "fork-and-forget".
⚠️ GHCR tem rate limit; se virar problema, migramos pra Docker Hub privado ou Artifact Registry.

## Plano de cutover

1. Fork no GitHub: `gh repo fork chatwoot/chatwoot --org Lucashavg --remote=false`.
2. Clonar fork na máquina local, criar branch `chatcenter/v4.14.0-search` a partir da tag `v4.14.0`.
3. Aplicar o patch capturado em `snapshots/<ts>/chatwoot-fork.diff`, commitar com mensagem que referencia este ADR.
4. Adicionar `.github/workflows/image.yml` no fork — publica em GHCR.
5. Push da branch; aguardar build.
6. Atualizar `docker-compose.yml` deste repo: remover `build:` (não tinha, já é só `image:`), trocar `chatcenter/chatwoot:v4.14.0-search` por `ghcr.io/lucashavg/chatwoot:chatcenter-v4.14.0-search`.
7. No servidor: `docker compose pull chatwoot-web chatwoot-sidekiq && docker compose up -d`.
8. Após estabilidade, remover `/root/chatwoot-fork` do servidor.
