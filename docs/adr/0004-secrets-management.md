# 0004 — Secrets em SOPS + age (commitáveis e cifrados)

- Status: proposto
- Data: 2026-05-20
- Decisor: Lucas (CTO)

## Contexto

Inventário de segredos hoje em produção:

| Origem | Conteúdo |
| --- | --- |
| `/root/chatcenter/.env` (plaintext, 644) | 24 chaves incluindo `POSTGRES_PASSWORD`, `SECRET_KEY_BASE`, `SMTP_PASSWORD`, `EVOLUTION_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `ANTHROPIC_API_KEY` |
| `/root/chatcenter/apps/web/.env.production` (plaintext) | duplica algumas das chaves acima |
| `/root/backups/env_*.bak` (plaintext) | cópias geradas pelo `backup.sh` |
| Cabeça do Lucas | a única fonte de verdade |

Problemas:
1. Nenhuma cópia segura fora do servidor — se o disco morrer, perdemos os segredos.
2. Backups copiam o `.env` em plaintext pro mesmo disco — qualquer leitura do backup vaza.
3. Rotação é manual e silenciosa.
4. Não há histórico de quem mudou o quê.
5. Quando o CI precisar dos segredos pra deploy, vai duplicar a fonte (GitHub Secrets desconectado do servidor).

Alternativas avaliadas:

| Opção | Pró | Contra |
| --- | --- | --- |
| **SOPS + age (esta)** | Cifrado no repo; chave de master fora do repo; revisão em PR; suporte nativo a YAML; integra com GitHub Actions | Adiciona uma ferramenta no fluxo |
| Vault / Doppler / Infisical | Auditoria completa, rotação automatizada | Custo recorrente; mais um serviço pra ficar de pé |
| GitHub Secrets only | Zero infra extra | Não cobre o servidor; sem versionamento; sem revisão |
| `.env` em S3 cifrado | Simples | Sem revisão em PR; sem audit trail útil |

## Decisão

**SOPS** ([github.com/getsops/sops](https://github.com/getsops/sops)) com backend **age** ([github.com/FiloSottile/age](https://github.com/FiloSottile/age)).

Layout:
```
secrets/
├─ .sops.yaml                 regras de cifra (recipients por arquivo)
├─ production.enc.yaml        cifrado, commitado
└─ staging.enc.yaml           cifrado, commitado (quando staging existir)
```

Chaves age:
- Cada operador humano com permissão tem 1 chave age (gerada localmente, **chave privada nunca vai pro repo**, fica em `~/.config/sops/age/keys.txt`).
- GitHub Actions tem sua própria chave, com a privada em `secrets.SOPS_AGE_KEY`.
- A lista de recipients em `.sops.yaml` controla quem pode decifrar.

Fluxo de uso no servidor:
1. `sops -d secrets/production.enc.yaml > .env` antes do `docker compose up`.
2. `.env` decifrado tem `0600` e nunca é commitado (gitignore).
3. No deploy CI: o workflow decifra com a chave de Actions e escreve o `.env` no servidor via SSH.

Rotação: edita `secrets/production.enc.yaml` (SOPS abre `$EDITOR` com o conteúdo decifrado, recifra ao salvar), abre PR, merge gera deploy automático.

## Consequências

✅ Segredos versionados, cifrados, revisados em PR.
✅ Off-site backup automático (estão no GitHub).
✅ Audit trail (`git log secrets/`).
✅ Rotação humana = 1 PR.
⚠️ Se a chave master de Actions vazar, atacante decifra tudo — proteger com cuidado (org-level secret, sem export).
⚠️ Onboarding de operador novo = adicionar age public key em `.sops.yaml` + recifrar arquivos.
⚠️ Não cobre rotação automática — para o `ANTHROPIC_API_KEY` ou `ASAAS_API_KEY`, ainda é manual. Aceitável dado o volume atual de segredos.

## Plano de cutover

1. Instalar `sops` e `age` localmente.
2. `age-keygen -o ~/.config/sops/age/keys.txt` na máquina do Lucas. Salvar a chave privada no 1Password/Bitwarden.
3. Criar `secrets/.sops.yaml` com a public key do Lucas.
4. Criar `secrets/production.enc.yaml` com o conteúdo atual do `/root/chatcenter/.env` (via `sops` no edit mode).
5. Gerar chave age separada pra GitHub Actions; cadastrar como `secrets.SOPS_AGE_KEY`.
6. Adaptar `deploy.sh` para `sops -d` antes do `docker compose`.
7. No primeiro deploy via CI, validar e remover o `.env` em plaintext do servidor.
