# Troubleshooting

Primeiro olhar, sempre (em `deploy/`):

```bash
docker compose ps -a
docker compose logs --tail 50 <serviço>
docker stats --no-stream
```

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| `pull` falha / `manifest unknown` / `denied` | Tag ainda não publicada; pacote do GHCR privado | Conferir o CI e a visibilidade do pacote, ou `docker login ghcr.io` ([instalacao-vm.md](instalacao-vm.md), passo 3). |
| `required variable ... rode deploy/scripts/segredos.sh` | `deploy/.env` ausente ou sem segredo | `deploy/scripts/segredos.sh` |
| `migra-*` termina com código ≠ 0 e o serviço não sobe | Migração falhou ou o banco não respondeu em 120 s | `docker compose logs migra-cida`. Corrija com uma migração **nova**; não edite uma já aplicada. |
| Serviço sobe mas `/health/ready` dá 503 | Não alcança o banco: senha em `deploy/.env` diferente da que o Postgres tem | Ver "Trocar a senha de um papel do banco" abaixo. |
| Contêiner reinicia; `docker inspect` mostra `OOMKilled: true` | Limite de memória baixo | `docker stats`; aumente o `mem_limit` do serviço em `deploy/compose.yaml`. |
| `postgres` reinicia logo na primeira partida | Script de init falhou e deixou o volume pela metade | **Só em instalação nova, sem dados:** `docker compose down -v`, corrija `deploy/.env` e `docker compose up -d`. |
| Gateway responde 404 | Caminho sem rota | Rotas em `deploy/gateway/rotas.yml`. |
| Gateway responde 502/503/504 (JSON de indisponível) | Serviço de destino parado ou reiniciando | `docker compose ps -a`; `docker compose logs <serviço>`. |
| HTTPS sem certificado válido na VM | Desafio HTTP-01 falhou (porta 80 fechada, limite do Let's Encrypt) | `docker compose logs traefik`; [acesso-publico.md](acesso-publico.md). |
| Login responde 429 | Limite de taxa (gateway: 10/min por IP; Mike: 5 falhas em 15 min por IP+registro) | Esperar. Se todos os usuários caem juntos, o gateway está vendo um IP só ([acesso-publico.md](acesso-publico.md)). |
| DonaCida/Jaiminho respondem 401 para token válido | Não buscam o JWKS (`mike-baguncinha:9090`) ou a chave do JWT foi trocada | `docker compose logs dona-cida`; após trocar a chave, `docker compose restart mike-baguncinha dona-cida jaiminho`. |
| E-mail não chega | SMTP externo recusando, ou saída 587/465 bloqueada na VM | Situação em `GET /api/v1/documento/{id}/email` (`ultimoErro`). Contingência: esvaziar `SMTP_HOST` em `deploy/.env` (volta ao Mailpit) e `docker compose up -d`. |
| Ver os e-mails capturados | — | Local: `http://localhost:18025`. VM: `ssh -L 18025:127.0.0.1:18025 univates@177.44.248.60` e o mesmo endereço. |
| Falta memória na VM | — | `docker stats`; `free -h`. O Postgres tem o maior limite (512 MB). |

## Trocar a senha de um papel do banco

As senhas dos papéis são definidas **só na primeira partida** do Postgres. Mudar o `deploy/.env` depois não muda o banco. Para trocar (ex.: `mf_cida`):

```bash
cd deploy
# 1. novo valor em deploy/.env (SENHA_MF_CIDA=..., só letras, números, _ e -)
# 2. aplicar no banco (a senha é digitada no prompt do psql, não fica no histórico)
docker compose exec postgres psql -U postgres -d medicalfield -c '\password mf_cida'
# 3. recriar quem usa
docker compose up -d dona-cida
```

Para a senha do administrador (`SENHA_POSTGRES_ADMIN`) é igual, com `\password postgres`; ela é usada pelas migrações e pelo backup.

## `http://localhost:8088` não responde, mas os contêineres estão no ar (Windows)

Sintoma: `curl http://localhost:8088/portal/` fica pendurado; `curl http://127.0.0.1:8088/portal/` devolve 200. Causa: o repasse de `localhost` do WSL/Docker Desktop pode ficar preso no endereço IPv6 (`::1`) da porta. Confirme com `netstat -ano | findstr :8088` (aparece um `[::1]:8088` do `wslrelay.exe`). Observado com o k3s local; no Compose, a confirmar.

- Contorno imediato: use `http://127.0.0.1:8088` no navegador e `MF_BASE=http://127.0.0.1:8088` nos testes (`npm run roteiro`, `e2e/qa`). O emulador Android não é afetado (`10.0.2.2` é IPv4).
- Para limpar de vez: reiniciar o Docker Desktop (ou `wsl --shutdown`) — isso derruba todos os contêineres da máquina, então faça fora de uma demonstração. Alternativa sem reiniciar: outra porta, `MF_PORTA_HTTP=8090` em `deploy/.env` e `docker compose up -d`.
