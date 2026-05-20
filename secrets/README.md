# `secrets/`

Cifrados com [SOPS](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age). Plaintext nunca entra aqui — só os arquivos `.enc.yaml`.

Rationale completo: [`docs/adr/0004-secrets-management.md`](../docs/adr/0004-secrets-management.md).

## Arquivos

| Arquivo | Conteúdo plaintext equivalente | Para onde vai no deploy |
| --- | --- | --- |
| `production.enc.yaml` | `/root/chatcenter/.env` | Decifrado antes do `docker compose up` |
| `web.enc.yaml` | `/root/chatcenter/apps/web/.env.production` | Decifrado antes do `docker compose build app` |

## Editar um segredo (do laptop do operador)

Pré-requisitos: `sops` e `age` instalados (`brew install sops age` no macOS; `apt install age` + binário sops em Linux), e `~/.config/sops/age/keys.txt` com uma chave privada cuja pública esteja no `.sops.yaml`.

```sh
sops secrets/production.enc.yaml         # abre $EDITOR com o plaintext; salva → recifra automaticamente
```

Commit + push o `.enc.yaml` mudado. O deploy seguinte propaga.

## Editar direto no servidor (atalho — não recomendado)

```sh
ssh root@<vps> -p 22022
cd /root/chatcenter
sops secrets/production.enc.yaml
git add -p && git commit -m "secrets: rotate <which>" && git push
```

> O motivo de não ser recomendado: o servidor tem a chave privada **server**. Edições autorizadas pelo Lucas devem usar a chave dele, pra audit trail ficar correto.

## Decifrar manualmente (para debugging)

```sh
sops --decrypt secrets/production.enc.yaml > /tmp/decrypted.env
# Lembra: /tmp/decrypted.env é plaintext. `shred -u /tmp/decrypted.env` quando terminar.
```

## Adicionar um novo operador

1. Pessoa nova roda `age-keygen -o ~/.config/sops/age/keys.txt` na máquina dela.
2. Manda a pública (`age1...`) num canal seguro.
3. Atualizar `secrets/.sops.yaml` adicionando a nova chave nos blocos `age:`.
4. `sops updatekeys secrets/production.enc.yaml secrets/web.enc.yaml`.
5. PR com `.sops.yaml` + os `.enc.yaml` recifrados.

## Rotacionar a chave do servidor (incidente / off-boarding)

1. SSH no servidor: `age-keygen -o /tmp/new-keys.txt` (com cuidado pra não sobrescrever).
2. Atualizar `.sops.yaml` com a nova pública; remover a antiga.
3. `sops updatekeys secrets/*.enc.yaml`.
4. Mover o `/tmp/new-keys.txt` pra `/root/.config/sops/age/keys.txt` (sobrescreve a antiga).
5. `chmod 600`.
6. Próximo deploy usa a chave nova.
7. Considerar que o `.env` plaintext anterior ainda existe nos backups antigos — se a rotação foi por vazamento, rotacionar também TODOS os segredos que estavam dentro dele.
