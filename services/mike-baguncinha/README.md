# MikeBaguncinha

Serviço de **identidade e auditoria** do MedicalField (Go, `net/http`, `pgx`). Autentica o profissional, emite e renova tokens (JWT EdDSA), publica a chave pública (JWKS) e guarda o log de acesso de todos os serviços e os logs gerados offline pelo app.

Contrato: [`docs/contratos.md`](../../docs/contratos.md) (seções 2 a 5) · rotas: [`openapi.yaml`](openapi.yaml).

## Credenciais de demonstração

Profissionais **fictícios**, criados pela migração `20261117000150_profissionais_demo.sql` **somente em banco de demonstração**. Como a senha abaixo é pública, a migração só insere quando o banco declara, **antes de migrar**:

```sql
ALTER DATABASE <banco> SET medicalfield.dados_demo = 'on';
```

(`scripts/dev-db.sh` já faz isso nos bancos que cria.) Sem o parâmetro, a migração não insere nada. Em `AMBIENTE=producao`, o serviço confere na partida e grava um log de nível `error` ("ATENÇÃO: AMBIENTE=producao COM PROFISSIONAIS DE DEMONSTRAÇÃO ATIVOS…") se encontrar algum deles ativo; nesse caso, desative-os ou troque as senhas:

```sql
UPDATE identidade.profissional SET ativo = false WHERE id::text LIKE '0d5b1c1e-7a10-4c1e-9b11-00000000000_';
```

A senha é a mesma para os três:

**`Demo#MedicalField26`**

| Papel | Nome | tipoRegistro | registro | uf |
| --- | --- | --- | --- | --- |
| ADMIN | Dra. Helena Prado | CRM | 100001 | RS |
| PROFISSIONAL | Enf. Caio Brandão | COREN | 200002 | RS |
| PROFISSIONAL | Soc. Lia Moura | SOCORRISTA | 300003 | (vazio) |

Para cadastrar outro profissional, gere o hash Argon2id com o próprio binário e insira em `identidade.profissional`:

```bash
printf '%s' 'a-senha' | docker run --rm -i medicalfield/mike-baguncinha:dev hash
```

A senha vai pela entrada padrão, não por argumento (que apareceria na lista de processos).

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

`GOMEMLIMIT` (variável do runtime do Go) é respeitada; sem ela, o serviço usa um teto flexível de 64 MiB — veja "Memória e login" abaixo.

## Memória e login

Cada verificação de senha (Argon2id, `m=19456`) aloca 19 MiB. O serviço roda **no máximo 2 verificações ao mesmo tempo** (`verificacoesSimultaneas` em `main.go`), inclusive para registro inexistente (hash falso); quem não consegue vaga em 3 s recebe `503 SERVICO_INDISPONIVEL` (transitório: o cliente repete). O pico fica em torno de 2 × 19 MiB + o resto do processo, então o contêiner precisa de **128 Mi de limite de memória** (medido: 32 logins simultâneos repetidos com `--memory=128m`, sem `OOMKilled`). Aumentar o teto de verificações exige aumentar o limite na mesma proporção.

Proteções do login, todas em memória (zeram quando o processo reinicia):

| Limite | Valor | Resposta |
| --- | --- | --- |
| Falhas por IP + conta | 5 em 15 min | 429 |
| Falhas por conta, somando todos os IPs | 20 em 15 min | 429 (até com a senha certa, enquanto durar) |
| Verificações de senha simultâneas | 2; espera de até 3 s | 503 |
| Chaves guardadas por limitador | 50 000 | as vencidas saem primeiro; depois, uma qualquer |

Refresh token: reapresentar um refresh **já revogado** (rotacionado ou encerrado) é tratado como roubo e revoga todas as sessões ativas do profissional. Sessões vencidas são apagadas na partida e de hora em hora.

## Testes

```bash
bash scripts/dev-db.sh criar-banco mf_teste_mike && bash scripts/dev-db.sh migrar mf_teste_mike
MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$(cygpath -w "$PWD/services/mike-baguncinha"):/src" -w /src -v mf-go-cache:/go \
  --network container:medicalfield-dev-pg \
  -e DATABASE_URL_TESTE='postgres://mf_mike:dev_mike@localhost:5432/mf_teste_mike?sslmode=disable' \
  golang:1.27 sh -c 'go vet ./... && go test ./...'
```

Para conferir que a carga de demonstração **não** entra sem o parâmetro, rode a mesma suíte contra um banco sem ele (trocando o nome em `DATABASE_URL_TESTE`):

```bash
bash scripts/dev-db.sh criar-banco mf_teste_mike_sem_demo
docker exec medicalfield-dev-pg psql -U postgres -c "ALTER DATABASE mf_teste_mike_sem_demo RESET medicalfield.dados_demo"
bash scripts/dev-db.sh migrar mf_teste_mike_sem_demo
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

- Os limites de login ficam em memória, por processo: zeram ao reiniciar e, com mais de uma réplica, cada uma conta separado.
- O limite por conta permite que terceiros tranquem uma conta por 15 min errando a senha 20 vezes (é o preço de barrar força bruta distribuída).
- Duas renovações simultâneas do **mesmo** refresh token são indistinguíveis de roubo: a segunda derruba a sessão e o profissional entra de novo.
- O access token não é revogável: depois do logout ele ainda vale até expirar (15 min), porque cada serviço valida o token sozinho.
- A `Sessao` devolve o refresh token também no corpo (o contrato exige; o app precisa), embora o portal use só o cookie.
- Corpo acima do limite (64 KiB em `/auth/*`, 4 MiB em `/log`) responde 422 `VALIDACAO`, não 413: o contrato não tem código para 413.
- `GET /auth/me` responde com os dados do token (até 15 min de defasagem em relação ao banco).
