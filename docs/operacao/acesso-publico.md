# Acesso público

> **Situação:** em produção desde 2026-11-18: certificado Let's Encrypt emitido, HTTP redirecionando para HTTPS.

Opção escolhida: **entrada direta no gateway + Let's Encrypt**, em `https://177-44-248-60.sslip.io`.

## Por que esta opção

- A VM (`177.44.248.60`) tem IP público e todas as portas chegam até ela; quem filtra é só o `ufw` da própria VM.
- O [sslip.io](https://sslip.io) resolve `177-44-248-60.sslip.io` para `177.44.248.60` sem cadastro, o que dá um nome DNS para o certificado.
- O Traefik obtém o certificado sozinho pelo desafio HTTP-01 na porta 80. Não há túnel nem serviço de terceiros no caminho.

## Como está configurado

`deploy/compose.vm.yaml`, ativado por `COMPOSE_FILE=compose.yaml:compose.vm.yaml` em `deploy/.env` ([instalacao-vm.md](instalacao-vm.md), passo 3):

| O quê | Valor |
| --- | --- |
| Portas publicadas | 80 (`MF_PORTA_HTTP=80`, só redireciona para HTTPS e atende o desafio ACME) e 443 |
| Nome do certificado | `MF_HOST=177-44-248-60.sslip.io` |
| Conta Let's Encrypt | `MF_ACME_EMAIL` |
| Onde fica o certificado | volume `acme` (`/acme/acme.json`); sobrevive a `down`, só `down -v` o apaga |
| QR do PDF | `URL_PUBLICA_PORTAL=https://177-44-248-60.sslip.io/portal` |
| Firewall | `sudo ufw allow 443/tcp` (a 80 já está liberada) |

As rotas (`deploy/gateway/rotas.yml`) não têm regra de `Host`: o mesmo gateway atende o nome público, `localhost` e o `10.0.2.2` do emulador.

O Traefik é a borda: não confia em `X-Forwarded-For` de ninguém e grava o IP da conexão. Conferido na VM: o IP real do cliente chega aos logs através da publicação de portas do Docker (coluna `ip_cliente` de `auditoria.log_acesso`).

O Let's Encrypt limita os certificados por domínio registrado; o `sslip.io` é compartilhado por muita gente. Se a emissão falhar por limite, `docker compose logs traefik` mostra o erro.

## Depois de abrir

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://177-44-248-60.sslip.io/portal/                 # 200
curl -s -o /dev/null -w '%{http_code}\n' https://177-44-248-60.sslip.io/api/v1/medicamento      # 401 (sem token)
curl -s -o /dev/null -w '%{http_code}\n' http://177-44-248-60.sslip.io/portal/                  # redireciona para HTTPS
for i in $(seq 15); do curl -s -o /dev/null -w '%{http_code} ' -X POST https://177-44-248-60.sslip.io/api/v1/auth/login; done   # termina em 429
```

No app, o "endereço do servidor" é configurável: trocar de endereço não exige novo build.
