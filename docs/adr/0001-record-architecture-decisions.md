# 0001 — Registrar decisões arquiteturais

- Status: aceito
- Data: 2026-05-20
- Decisor: Lucas (CTO)

## Contexto

Estamos formalizando a base de código no GitHub depois de meses de iteração direto no servidor. Algumas decisões load-bearing precisam ser explicáveis pra alguém que entra no projeto em 2027 ou pra um auditor que olhe o repo. Comentário inline não escala. README também não.

## Decisão

Adotar [Architecture Decision Records](https://adr.github.io/) em `docs/adr/`, formato leve (Markdown), numeração sequencial de 4 dígitos.

Cada ADR contém:
- **Status** — proposto / aceito / depreciado / substituído por ADR ####.
- **Data** e **Decisor**.
- **Contexto** — qual problema/restrição motivou a decisão.
- **Decisão** — o que foi decidido.
- **Consequências** — o que melhora, o que piora, o que fica em aberto.

ADRs **nunca são editados** após aceitos, exceto para mudar o status (ex.: depreciar). Mudança de rumo = novo ADR que substitui o anterior.

## Consequências

✅ Histórico de raciocínio fora do `git log` (que mistura tudo).
✅ Conversa de design pode acontecer em PR de ADR.
⚠️ Requer disciplina pra escrever ANTES de implementar mudanças grandes.
