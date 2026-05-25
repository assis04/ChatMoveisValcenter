# 0005 — Gestão de grupos WhatsApp via Dashboard App, sem patchar o fork

- Status: proposto
- Data: 2026-05-25
- Decisor: Lucas (CTO)

## Contexto

A operação precisa **criar** grupos de WhatsApp, **adicionar/remover/promover membros** e **sair de grupos** diretamente do atendimento. Chatwoot não expõe essas ações na UI para o canal WhatsApp Baileys — a Evolution API as suporta nativamente.

A integração nativa Evolution↔Chatwoot v2 (`Chatwoot.enabled: true` nas duas instâncias, validado em produção no DB) **já trata corretamente o fluxo de mensagens em grupo**:

- Cada grupo vira **um Contact** com `identifier=<jid>@g.us` e sufixo `(GROUP)` no nome.
- Mensagens caem em **uma Conversation única por grupo**, sem fragmentação por participante.
- A Evolution prefixa cada mensagem com `**+55 11 XXXXX-XXXX - Nome:**\n\n<texto>` em markdown — atribuição do remetente completa, funciona em qualquer client (web, mobile).
- Respostas do agente roteiam de volta para o JID do grupo via webhook outbound.

O gap real é portanto somente **criação proativa e gestão de membros**, não recebimento/envio de mensagens.

## Decisão

Construir a feature como **camada adicional sobre a integração existente**, sem desligar nada da Evolution e sem patchar o fork do Chatwoot:

1. **Rotas API em `apps/web/src/app/api/groups/*`** envelopando os endpoints de grupo da Evolution (`/group/create`, `/group/updateParticipant`, `/group/updateGroupSubject`, etc.). Resolução `inbox_id → instance_name` automática via `fetchInstances` da Evolution + `fetchInboxes` do Chatwoot (cache 60s).

2. **Dashboard App registrado em `Settings → Integrations`** apontando para `/ext/dashboard-app/groups`. A página detecta o contexto via `postMessage` do Chatwoot e renderiza:
   - Em conversa de grupo (`contact.identifier` termina em `@g.us`) → painel de membros.
   - Sem contexto de conversa → lista de grupos + wizard de criação.

3. **Rota standalone `/ext/grupos`** acessível por URL direto (bookmark/atalho) para usos sem contexto de conversa.

4. **Script idempotente** `infra/scripts/register-dashboard-apps.sh` cria/atualiza o Dashboard App via API do Chatwoot. Roda manualmente (por enquanto) após cada deploy.

5. **Autorização**: validação de `Origin` header contra `CHATWOOT_PUBLIC_URL` em todas as rotas. A autenticação é delegada à sessão do Chatwoot (somente agentes logados veem o iframe). Sem JWT próprio, sem token por usuário.

## Por que não patchar o fork

Patchar o fork (`chatcenter/*` em [Lucashavg/chatwoot](https://github.com/Lucashavg/chatwoot)) pra ter telas Vue nativas seria mais "pixel-perfect", mas:

- **Custo de manutenção**: cada bump de versão do Chatwoot (ver [ADR 0003](./0003-chatwoot-fork-via-ghcr.md)) viraria rebase de telas Vue inteiras. Hoje só carregamos a customização de busca inline; multiplicar isso por 4–5 telas de grupos é dívida real.
- **Velocidade de iteração**: mudar uma tela TSX no nosso app é `git push` + deploy do `chatcenter-app`. Mudar Vue no fork é PR no fork, build de imagem (~6 min), pull no servidor.
- **Não há gap funcional**: Dashboard Apps rendam dentro do painel direito da conversa com mesma persistência de scroll, mesmo ciclo de vida que telas nativas. A diferença visual é cosmética (iframe vs. embed nativo).
- **Reversível**: se a UX de Dashboard App não satisfizer, podemos migrar para fork-patch no futuro sem reescrever lógica — só a apresentação muda.

## Por que não desligar a integração built-in da Evolution

Considerado, descartado. Desligar `Chatwoot.enabled` na Evolution e assumir o pipeline inbound/outbound no nosso `/api/webhooks/evolution` (hoje stub) traria controle total, mas:

- A integração rodou mais de 15 mil mensagens em produção sem erro conhecido (validado em conv_id=213, 58 mensagens com atribuição correta).
- Reescrever isso introduz risco de regressão em todo o tráfego, não só em grupos.
- A atribuição de sender já está resolvida pela integração — não há valor a adicionar.

Mantemos a integração nativa, construímos apenas a camada que falta.

## Consequências

✅ Zero impacto na infra existente — só adiciona código no `apps/web`.
✅ Funciona dinamicamente para **todas** as conexões Evolution (Valcenter_Lucas, Valcenter_ADM e futuras) via resolução por `Chatwoot.nameInbox`.
✅ Atendentes veem o painel de membros direto na conversa do grupo, gestão usa `/ext/grupos` pra visão geral.
✅ Pré-requisito apenas: rodar `register-dashboard-apps.sh` uma vez após o primeiro deploy.
⚠️ UI vive num iframe — limitações de tema/altura existem mas são gerenciáveis.
⚠️ Cache de 60s no mapping `inbox→instance` significa que conectar uma nova instância pode demorar até 1 min pra aparecer no wizard (mitigável com `?refresh=true`).
⚠️ Não há permissionamento por agente — qualquer agente logado pode criar/sair de grupos. Adicionar role check é trabalho futuro se necessário.

## Plano de rollout

1. Merge da feature no `main`.
2. `git pull` no servidor; `./infra/scripts/deploy.sh` (rebuilda `chatcenter-app`).
3. `./infra/scripts/register-dashboard-apps.sh` (rodar uma vez; idempotente).
4. Abrir uma conversa de grupo no Chatwoot — Dashboard App "Gestão de Grupos" aparece no painel direito.
5. Reconectar `Valcenter_ADM` (relogin do QR Code) — a feature passa a operar nessa instância automaticamente.
