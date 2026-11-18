# MikeBaguncinha

Serviço de **identidade e auditoria** do MedicalField (Go, `net/http`, `pgx`). Autentica o profissional, emite e renova tokens (JWT EdDSA), publica a chave pública (JWKS) e guarda o log de acesso de todos os serviços e os logs gerados offline pelo app.

Contrato: [`docs/contratos.md`](../../docs/contratos.md) (seções 2 a 5) · rotas: [`openapi.yaml`](openapi.yaml).

## Credenciais de demonstração

Profissionais **fictícios**, criados pela migração `20261117000150_profissionais_demo.sql`. A senha é a mesma para os três:

**`Demo#MedicalField26`**

| Papel | Nome | tipoRegistro | registro | uf |
| --- | --- | --- | --- | --- |
| ADMIN | Dra. Helena Prado | CRM | 100001 | RS |
| PROFISSIONAL | Enf. Caio Brandão | COREN | 200002 | RS |
| PROFISSIONAL | Soc. Lia Moura | SOCORRISTA | 300003 | (vazio) |

Para cadastrar outro profissional, gere o hash Argon2id com o próprio binário e insira em `identidade.profissional`:

```bash
docker run --rm medicalfield/mike-baguncinha:dev hash 'a-senha'
```

## Rodar em desenvolvimento

Go não precisa estar instalado: tudo roda em contêiner. No Git Bash, a partir da raiz do repositório:

```bash
bash scripts/dev-db.sh subir && bash scripts/dev-db.sh migrar        # banco (porta 5544)
docker build -t medicalfield/mike-baguncinha:dev services/mike-baguncinha
docker run --rm --name mike-baguncinha --read-only -p 8081:8080 -p 9091:9090 \
  -e DATABASE_URL='postgres://mf_mike:dev_mike@host.docker.internal:5544/medicalfield?sslmode=disable' \
  medicalfield/mike-baguncinha:dev
```

```bash
curl -s localhost:9091/health/ready
curl -s localhost:8081/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"tipoRegistro":"CRM","registro":"100001","uf":"RS","senha":"<senha de demonstração>"}'
curl -s localhost:8081/api/v1/auth/me -H "Authorization: Bearer <accessToken>"
```

## Variáveis de ambiente

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORTA` | 8080 | API (`/api/v1/...`) |
| `PORTA_GESTAO` | 9090 | `/health/live`, `/health/ready`, `/jwks.json` |
| `DATABASE_URL` | — (obrigatória) | papel `mf_mike` |
| `PROXIES_CONFIAVEIS` | `127.0.0.1/32,::1/128,10.42.0.0/16` | CIDRs dos quais se aceita `X-Forwarded-For` |
| `AMBIENTE` | `desenvolvimento` | ou `producao` (cookie `Secure`, chave obrigatória) |
| `NIVEL_LOG` | `info` | `debug`, `info`, `warn`, `error` |
| `JWT_CHAVE_PRIVADA_PEM` | — | Ed25519 em PKCS#8 (aceita `\n` escapado). Obrigatória em `producao`; em `desenvolvimento`, se ausente, o serviço gera uma chave efêmera e avisa no log |

Gerar uma chave: `openssl genpkey -algorithm ed25519`.

## Testes

```bash
bash scripts/dev-db.sh criar-banco mf_teste_mike && bash scripts/dev-db.sh migrar mf_teste_mike
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(cygpath -w "$PWD/services/mike-baguncinha"):/src" -w /src -v mf-go-cache:/go \
  --network container:medicalfield-dev-pg \
  -e DATABASE_URL_TESTE='postgres://mf_mike:dev_mike@localhost:5432/mf_teste_mike?sslmode=disable' \
  golang:1.27 sh -c 'go vet ./... && go test ./...'
```

Sem `DATABASE_URL_TESTE`, os testes de integração são pulados e rodam só os unitários. Os de integração criam profissionais próprios (registro aleatório) e não apagam nada: a auditoria é somente-inserção.

## Estrutura

```
cmd/mike-baguncinha/main.go   montagem manual das dependências
internal/http                 rotas, DTOs, middlewares (request-id → log de acesso → autenticação → handler)
internal/aplicacao            casos de uso (autenticação, auditoria, limite de tentativas)
internal/dominio              entidades, erros e interfaces dos repositórios
internal/infra                Postgres (SQL explícito), Argon2id, JWT/JWKS, gravador assíncrono do log de acesso, config
migrations/                   dbmate
```

## Limites conhecidos

- O limite de tentativas de login fica em memória, por processo: com mais de uma réplica, cada uma conta separado.
- Reutilizar um refresh token já rotacionado é apenas recusado (401); as demais sessões do profissional não são revogadas.
- `GET /auth/me` responde com os dados do token (até 15 min de defasagem em relação ao banco).
