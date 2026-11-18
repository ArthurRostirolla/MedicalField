# APIs do MedicalField

**Entregável 2 do enunciado (parte API) — documentação das APIs e seus endpoints.** A modelagem dos bancos está em [`../dados/modelagem.md`](../dados/modelagem.md).

| Arquivo | Conteúdo |
| --- | --- |
| Este `README.md` | Todos os endpoints, convenções e como testar |
| [`openapi/mike-baguncinha.yaml`](openapi/mike-baguncinha.yaml) | OpenAPI 3.0 do serviço de identidade e auditoria (Go) |
| [`openapi/dona-cida.yaml`](openapi/dona-cida.yaml) | OpenAPI 3.1 do núcleo clínico e sincronização (NestJS) |
| [`openapi/jaiminho.yaml`](openapi/jaiminho.yaml) | OpenAPI 3.1 do serviço de documentos (FastAPI) |
| [`medicalfield.postman_collection.json`](medicalfield.postman_collection.json) | Coleção Postman v2.1 com todas as rotas |

Os três `openapi/*.yaml` são **cópias** dos arquivos que vivem com cada serviço (`services/<servico>/openapi.yaml`), reunidas aqui para a entrega. A fonte continua sendo o serviço: o da DonaCida é gerado por `npm run openapi -w @medicalfield/dona-cida`; o do Jaiminho, por `services/jaiminho/scripts/exportar_openapi.py`. O contrato em prosa, com os tipos de cada corpo, é [`../contratos.md`](../contratos.md).

## 1. Endereço e roteamento

Tudo passa pelo gateway **freeway** (Traefik). No cluster local:

```
http://localhost:8088/api/v1
```

O gateway roteia por prefixo, **sem remover o prefixo**, e não autentica — cada serviço valida o token.

| Prefixo | Serviço | Linguagem |
| --- | --- | --- |
| `/api/v1/auth`, `/api/v1/log`, `/api/v1/auditoria` | MikeBaguncinha | Go |
| `/api/v1/medicamento`, `/pessoa`, `/prontuario`, `/prontuario-item`, `/atendimento`, `/atendimento-evento`, `/ficha`, `/sync` | DonaCida | TypeScript |
| `/api/v1/documento` | Jaiminho | Python |

Em desenvolvimento, sem gateway, cada serviço atende numa porta: Mike 8081, Cida 8082, Jaiminho 8083 (o Vite dos front-ends repete o roteamento acima).

## 2. Todos os endpoints

**Legenda da coluna "Origem":** **E** = um dos 9 endpoints sugeridos no enunciado · **PDF** e **E-mail** = as rotas de documento e envio que o enunciado pede para contemplar · em branco = rota adicional, "conforme a necessidade".

"Sim" em autenticação significa `Authorization: Bearer <accessToken>`, aceito para os dois papéis.

### MikeBaguncinha — identidade e auditoria

| Método | Rota | Origem | Autenticação | Finalidade | Resposta |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | **E** `POST /auth/login` | **Não** (única) | Autentica por CRM, COREN ou ID de socorrista | 200 `Sessao` (`accessToken`, `expiraEm`, `refreshToken`, `profissional`) + cookie `mf_refresh`; 401 `CREDENCIAIS_INVALIDAS`; 429 `MUITAS_TENTATIVAS` |
| POST | `/api/v1/auth/refresh` | | *Refresh token* (corpo ou cookie) | Troca o *refresh token* por uma sessão nova (rotativo) | 200 `Sessao`; 401 |
| POST | `/api/v1/auth/logout` | | Sim | Revoga o *refresh token* | 204 |
| GET | `/api/v1/auth/me` | | Sim | Dados do profissional do token | 200 `Profissional` |
| POST | `/api/v1/log` | **E** `POST /log` | Sim | Recebe os logs gerados offline pelo app (até 500, idempotente por `id`) | 200 `{ aceitos, duplicados }` |
| GET | `/api/v1/auditoria/acesso` | | Sim, **ADMIN** | Log de acesso de todos os serviços; filtros `de`, `ate`, `profissionalId`, `servico` | 200 `{ itens: LogAcesso[], proximoCursor }`; 403 `SEM_PERMISSAO` |
| GET | `/api/v1/auditoria/cliente` | | Sim, **ADMIN** | Logs enviados pelos aparelhos; filtros `de`, `ate`, `profissionalId` | 200 `{ itens: LogCliente[], proximoCursor }`; 403 |

### DonaCida — núcleo clínico e sincronização

| Método | Rota | Origem | Autenticação | Finalidade | Resposta |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/v1/medicamento` | **E** `GET /medicamento` | Sim | Lista os medicamentos (`?incluirInativos=true`) | 200 `{ itens: Medicamento[], proximoCursor }` |
| GET | `/api/v1/prontuario` | **E** `GET /prontuario` | Sim | Prontuários de todas as pessoas, cada um com a pessoa resumida | 200 lista paginada |
| GET | `/api/v1/prontuario/{pessoaId}` | **E** `GET /prontuario/{id}` | Sim | Prontuário de uma pessoa, com os itens | 200 `Prontuario`; 404 |
| POST | `/api/v1/prontuario` | **E** `POST /prontuario` | Sim | Cadastra um prontuário (pode levar itens) | 201 `Prontuario`; 200 se a pessoa já tinha (une os itens) |
| POST | `/api/v1/pessoa` | **E** `POST /pessoa` | Sim | Cadastra nova pessoa | 201 `Pessoa`; 200 se o `id` já existia |
| GET | `/api/v1/atendimento/{pessoaId}` | **E** `GET /atendimento/{id}` | Sim | Todos os atendimentos de uma pessoa | 200 lista paginada |
| POST | `/api/v1/atendimento` | **E** `POST /atendimento` | Sim | Cadastra um atendimento (pode levar eventos iniciais) | 201 `Atendimento`; 200 na repetição |
| GET | `/api/v1/atendimento` | | Sim | Todos os atendimentos, mais recentes primeiro, com `pessoaNome` | 200 lista paginada |
| POST | `/api/v1/atendimento-evento` | | Sim | Acrescenta um evento à linha do tempo | 201 `Evento`; 200 na repetição |
| GET | `/api/v1/ficha/{atendimentoId}` | | Sim | Atendimento completo: pessoa, prontuário, eventos e resumo | 200 `Ficha`; 404 |
| GET | `/api/v1/pessoa` | | Sim | Busca por nome ou CPF (`?busca=`), `?somenteDuplicatas=true` | 200 lista paginada |
| GET | `/api/v1/pessoa/{id}` | | Sim | Uma pessoa | 200 `Pessoa`; 404 |
| PATCH | `/api/v1/pessoa/{id}` | | Sim | Altera campos da pessoa (vence a edição mais recente, por campo) | 200 `Pessoa`; 404 |
| POST | `/api/v1/prontuario-item` | | Sim | Acrescenta alergia, comorbidade ou medicação contínua | 201 `ProntuarioItem` |
| POST | `/api/v1/prontuario-item/{id}/inativacao` | | Sim | Inativa um item (não apaga) | 200 `ProntuarioItem`; 404 |
| GET | `/api/v1/sync/alteracoes` | | Sim | Descida do app: alterações desde o cursor (`?desde=0&limite=500`) | 200 `{ medicamentos, pessoas, prontuarios, prontuarioItens, proximoCursor, temMais }` |

### Jaiminho — PDF e e-mail

| Método | Rota | Origem | Autenticação | Finalidade | Resposta |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/v1/documento/ficha-atendimento` | **PDF** | Sim | Gera a ficha de atendimento em PDF e a guarda | 201 `Documento`; 200 se já existe com o mesmo conteúdo; 503 se a DonaCida estiver fora |
| GET | `/api/v1/documento/{id}/pdf` | **PDF** | Sim | Download do PDF | 200 `application/pdf`, `Content-Disposition: attachment; filename="ficha-<codigo>.pdf"` |
| GET | `/api/v1/documento` | | Sim | Documentos de um atendimento (`?atendimentoId=` obrigatório) | 200 `{ itens: Documento[], proximoCursor: null }` |
| GET | `/api/v1/documento/{id}` | | Sim | Metadados e verificação de integridade | 200 `Documento` + `integro` |
| POST | `/api/v1/documento/{id}/email` | **E-mail** | Sim | Enfileira o envio da ficha, em anexo, a paciente ou familiar | **202** `Envio` (`PENDENTE`) |
| GET | `/api/v1/documento/{id}/email` | **E-mail** | Sim | Situação dos envios de um documento | 200 `{ itens: Envio[], proximoCursor: null }` |
| POST | `/api/v1/documento/email/{envioId}/reenvio` | **E-mail** | Sim | Recoloca na fila um envio em `FALHA_DEFINITIVA` | 202 `Envio`; 422 se não estava em falha definitiva |

**Total: 30 rotas** — 7 no MikeBaguncinha, 16 na DonaCida, 7 no Jaiminho.

### Os 9 endpoints do enunciado, lado a lado

| Enunciado | Implementado | Observação |
| --- | --- | --- |
| `POST /auth/login` | `POST /api/v1/auth/login` | Única rota sem autenticação |
| `GET /medicamento` | `GET /api/v1/medicamento` | Paginado |
| `GET /prontuario` | `GET /api/v1/prontuario` | Paginado |
| `GET /prontuario/{id}` | `GET /api/v1/prontuario/{pessoaId}` | O `{id}` é o da **pessoa**, como no enunciado ("o prontuário de uma pessoa") |
| `POST /pessoa` | `POST /api/v1/pessoa` | |
| `GET /atendimento/{id}` | `GET /api/v1/atendimento/{pessoaId}` | O `{id}` é o da **pessoa** ("todos os atendimentos de uma pessoa") |
| `POST /prontuario` | `POST /api/v1/prontuario` | |
| `POST /atendimento` | `POST /api/v1/atendimento` | Referencia `pessoaId`; o servidor resolve o prontuário |
| `POST /log` | `POST /api/v1/log` | |

Todas ganharam o prefixo `/api/v1`.

### Porta de gestão (fora do gateway)

Cada serviço tem uma segunda porta (9090 no cluster), **sem autenticação e nunca roteada pelo gateway**, usada pelas *probes* do Kubernetes:

| Método | Rota | Serviço | Resposta |
| --- | --- | --- | --- |
| GET | `/health/live` | os três | 200 `{"status":"ok"}` |
| GET | `/health/ready` | os três | 200 se o banco responde; 503 caso contrário |
| GET | `/jwks.json` | só o MikeBaguncinha | A chave pública Ed25519, para os outros serviços validarem o token |

## 3. Convenções

- **JSON em `camelCase`.** Datas em ISO-8601 UTC com `Z` (`2026-11-17T21:00:00.000Z`); data pura `YYYY-MM-DD`. Ids são **UUID em minúsculas**.
- **Cabeçalhos:**

| Cabeçalho | Uso |
| --- | --- |
| `Authorization: Bearer <jwt>` | Toda rota, menos o login |
| `Idempotency-Key: <uuid>` | Escritas; repetir a mesma chave devolve a resposta original |
| `X-Dispositivo-Id: <uuid>` | Identifica o aparelho; vai para a trilha de auditoria |
| `X-Request-Id` | Gerado se ausente; devolvido na resposta e gravado no log de acesso |

- **Listas paginadas:** `?limite=50&cursor=<opaco>` → `{ "itens": [...], "proximoCursor": "..." | null }`. `limite` máximo 200 (1000 em `/sync/alteracoes`).
- **O id da entidade vem do cliente** nas escritas — é o que permite criar registros offline.

### Erro: corpo único nos três serviços

```json
{ "codigo": "VALIDACAO", "mensagem": "Dados inválidos.", "detalhes": [{ "campo": "nome", "mensagem": "obrigatório" }], "requestId": "..." }
```

| HTTP | `codigo` | Quando |
| --- | --- | --- |
| 401 | `CREDENCIAIS_INVALIDAS` | Login errado (mensagem genérica) |
| 401 | `NAO_AUTENTICADO` | Token ausente, inválido ou expirado |
| 403 | `SEM_PERMISSAO` | Papel insuficiente |
| 404 | `NAO_ENCONTRADO` | Id do caminho não existe |
| 422 | `VALIDACAO` | Corpo ou parâmetro inválido; referência do corpo inexistente (`pessoaId`, `atendimentoId`) |
| 422 | `CHAVE_IDEMPOTENCIA_CONFLITANTE` | Mesma `Idempotency-Key` com corpo diferente |
| 429 | `MUITAS_TENTATIVAS` | Limite de tentativas de login |
| 500 | `ERRO_INTERNO` | Sem detalhe interno |
| 503 | `SERVICO_INDISPONIVEL` | Dependência fora |

Regra usada pelo app: **4xx é rejeição definitiva** (não reenviar); **rede, 5xx e *timeout* são transitórios** (reenviar).

### Idempotência das escritas

| Situação | Resposta |
| --- | --- |
| Primeira vez com a chave | **201** (ou 200 nas rotas que alteram: `PATCH /pessoa/{id}`, inativação) |
| Mesma chave, mesmo corpo | **200 com a mesma resposta**, sem gravar nada |
| Mesma chave, corpo diferente | 422 `CHAVE_IDEMPOTENCIA_CONFLITANTE` |
| Sem chave, `id` já existente | 200 com o registro existente |

Detalhes em [`../arquitetura/sincronizacao.md`](../arquitetura/sincronizacao.md).

## 4. Exemplo com `curl`

A senha de demonstração está em [`services/mike-baguncinha/README.md`](../../services/mike-baguncinha/README.md).

```bash
BASE=http://localhost:8088/api/v1

# 1. Login (CRM 100001/RS é o ADMIN de demonstração)
curl -s $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"tipoRegistro":"CRM","registro":"100001","uf":"RS","senha":"<senha de demonstração>"}'

# 2. Com o accessToken devolvido
TOKEN=<accessToken>
curl -s $BASE/medicamento -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/sync/alteracoes?desde=0&limite=500" -H "Authorization: Bearer $TOKEN"

# 3. Sem token: 401
curl -i $BASE/medicamento
```

Profissionais de demonstração (fictícios):

| Papel | Nome | `tipoRegistro` | `registro` | `uf` |
| --- | --- | --- | --- | --- |
| ADMIN | Dra. Helena Prado | `CRM` | `100001` | `RS` |
| PROFISSIONAL | Enf. Caio Brandão | `COREN` | `200002` | `RS` |
| PROFISSIONAL | Soc. Lia Moura | `SOCORRISTA` | `300003` | (vazio) |

## 5. Coleção Postman

[`medicalfield.postman_collection.json`](medicalfield.postman_collection.json) — Postman v2.1, 31 requisições cobrindo as 30 rotas (mais uma chamada sem token, para mostrar o 401).

### Usar no Postman (ou Insomnia, que importa o mesmo formato)

1. **Import** → escolha o arquivo.
2. Na aba **Variables** da coleção, preencha `senha` (vem **vazia**; a senha está em `services/mike-baguncinha/README.md`). `baseUrl` já aponta para `http://localhost:8088/api/v1`.
3. Rode **Login**. O script da requisição guarda o `accessToken` na variável `token`; a coleção inteira usa `Authorization: Bearer {{token}}`.
4. Rode as pastas **na ordem** — cada requisição guarda os ids que as seguintes usam (`pessoaId`, `atendimentoId`, `documentoId`, `envioId`).

| Variável | Padrão | Preenchida por |
| --- | --- | --- |
| `baseUrl` | `http://localhost:8088/api/v1` | você, se o endereço for outro |
| `senha` | (vazia) | **você** |
| `token`, `refreshToken` | — | script do Login e do Refresh |
| `dispositivoId` | — | script da coleção (vai em `X-Dispositivo-Id`) |
| `pessoaId`, `itemId`, `atendimentoId` | — | pré-script das escritas, com `{{$guid}}` |
| `documentoId`, `envioId` | — | script das respostas |

As escritas geram o `id` da entidade e a `Idempotency-Key` com `{{$guid}}`; as datas, com `{{$isoTimestamp}}`.

A coleção **cria dados**: uma pessoa "Pessoa Postman …", um prontuário, um atendimento, um PDF e um envio de e-mail para `familiar.postman@exemplo.test` (capturado pelo Mailpit). Tudo fictício.

A requisição **"Reenviar (só após falha definitiva)"** espera **422**: o envio da coleção não falhou, então a regra de negócio recusa o reenvio. É o comportamento correto.

### Rodar pela linha de comando (Newman)

```bash
export MF_SENHA_DEMO='<senha de demonstração>'      # não grave em arquivo
npx newman run docs/api/medicalfield.postman_collection.json --env-var senha=$MF_SENHA_DEMO
```

Outro endereço: acrescente `--env-var baseUrl=http://<host>/api/v1`.

### Resultado da validação

Executado em 18/11/2026 com Newman 6.2.3 contra o gateway do cluster k3s local (`http://localhost:8088/api/v1`):

```
┌─────────────────────────┬────────────────────┬───────────────────┐
│                         │           executed │            failed │
├─────────────────────────┼────────────────────┼───────────────────┤
│              iterations │                  1 │                 0 │
├─────────────────────────┼────────────────────┼───────────────────┤
│                requests │                 31 │                 0 │
├─────────────────────────┼────────────────────┼───────────────────┤
│            test-scripts │                 31 │                 0 │
├─────────────────────────┼────────────────────┼───────────────────┤
│      prerequest-scripts │                 34 │                 0 │
├─────────────────────────┼────────────────────┼───────────────────┤
│              assertions │                 57 │                 0 │
├─────────────────────────┴────────────────────┴───────────────────┤
│ total run duration: 4s                                           │
├──────────────────────────────────────────────────────────────────┤
│ total data received: 93.71kB (approx)                            │
├──────────────────────────────────────────────────────────────────┤
│ average response time: 47ms [min: 6ms, max: 1049ms, s.d.: 183ms] │
└──────────────────────────────────────────────────────────────────┘
```

A requisição mais lenta (1049 ms) é a geração do PDF.

Cuidado ao repetir muitas vezes seguidas: a rota de login tem limite de 10 requisições por minuto por IP no gateway, e 5 senhas erradas em 15 minutos bloqueiam aquele registro naquele IP.

## 6. O que as rotas não fazem

- Não há rota de cadastro de medicamento: o enunciado prevê a inserção **pelo banco** ([`../operacao/banco-manual.md`](../operacao/banco-manual.md)).
- Não há `DELETE` em nenhuma rota. Item de prontuário é inativado; evento é retificado por um novo evento.
- Nenhuma rota devolve o nome de um profissional a partir do id — auditoria e documentos mostram só o id (limitação D-06).
