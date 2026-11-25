# APIs do MedicalField

**Entregável 2 do enunciado (parte API): documentação das APIs e seus endpoints.** A modelagem dos bancos está em [`../dados/modelagem.md`](../dados/modelagem.md).

Este documento lista **todas as 31 rotas** dos três serviços, com o corpo de cada chamada, o corpo de cada resposta e os erros possíveis. Os exemplos usam dados **fictícios**.

| Arquivo | Conteúdo |
| --- | --- |
| Este `README.md` | Todas as rotas, com corpos de entrada e saída, convenções e como testar |
| [`openapi/mike-baguncinha.yaml`](openapi/mike-baguncinha.yaml) | OpenAPI 3.0 do serviço de identidade e auditoria (Go) |
| [`openapi/dona-cida.yaml`](openapi/dona-cida.yaml) | OpenAPI 3.1 do núcleo clínico e sincronização (NestJS) |
| [`openapi/jaiminho.yaml`](openapi/jaiminho.yaml) | OpenAPI 3.1 do serviço de documentos (FastAPI) |
| [`medicalfield.postman_collection.json`](medicalfield.postman_collection.json) | Coleção Postman v2.1 |
| [`../../packages/contratos/src`](../../packages/contratos/src) | Os schemas **zod** que validam cada corpo: a fonte de verdade dos tipos abaixo |

Os três `openapi/*.yaml` são cópias dos arquivos que vivem com cada serviço (`apps/<servico>/openapi.yaml`). O da DonaCida é gerado por `npm run openapi -w @medicalfield/dona-cida`; o do Jaiminho, por `apps/jaiminho/scripts/exportar_openapi.py`.

**Sumário**

1. [Endereço e roteamento](#1-endereço-e-roteamento)
2. [Convenções](#2-convenções) (cabeçalhos, paginação, erros, idempotência)
3. [Visão geral das 31 rotas](#3-visão-geral-das-31-rotas)
4. [MikeBaguncinha: identidade e auditoria](#4-mikebaguncinha-identidade-e-auditoria)
5. [DonaCida: núcleo clínico e sincronização](#5-donacida-núcleo-clínico-e-sincronização)
6. [Jaiminho: PDF e e-mail](#6-jaiminho-pdf-e-e-mail)
7. [Tipos compartilhados](#7-tipos-compartilhados)
8. [Porta de gestão (fora do gateway)](#8-porta-de-gestão-fora-do-gateway)
9. [Exemplo com `curl`](#9-exemplo-com-curl)
10. [Coleção Postman](#10-coleção-postman)
11. [O que as rotas não fazem](#11-o-que-as-rotas-não-fazem)

---

## 1. Endereço e roteamento

Tudo passa pelo gateway **freeway** (Traefik):

| Ambiente | Endereço base |
| --- | --- |
| VM da Univates (produção da disciplina) | `https://177-44-248-60.sslip.io/api/v1` |
| Docker Compose local | `http://127.0.0.1:8088/api/v1` |
| Desenvolvimento sem gateway | Mike `:8081`, Cida `:8082`, Jaiminho `:8083` (o Vite dos front-ends repete o roteamento) |

O gateway roteia por prefixo, **sem remover o prefixo**, e **não autentica**: cada serviço valida o token por conta própria.

| Prefixo | Serviço | Linguagem |
| --- | --- | --- |
| `/api/v1/auth`, `/api/v1/log`, `/api/v1/auditoria` | MikeBaguncinha | Go |
| `/api/v1/medicamento`, `/pessoa`, `/prontuario`, `/prontuario-item`, `/atendimento`, `/atendimento-evento`, `/ficha`, `/sync` | DonaCida | TypeScript (NestJS) |
| `/api/v1/documento` | Jaiminho | Python (FastAPI) |

## 2. Convenções

### Formato

- **JSON em `camelCase`**, `Content-Type: application/json`.
- Datas e horas em **ISO-8601 UTC com `Z`** (`2026-11-17T21:00:00.000Z`); data pura em `YYYY-MM-DD`.
- Ids são **UUID em minúsculas**. Nas escritas, **o id da entidade vem do cliente**: é o que permite criar registros offline e reenviar sem duplicar.
- Campos marcados como opcionais (`?`) podem ser omitidos; campos `| null` sempre vêm na resposta, com `null` quando vazios.
- Os corpos de entrada são **estritos**: campo desconhecido é recusado com `422 VALIDACAO`.
- Textos recusam caracteres de controle (exceto `\n`, `\r`, `\t`).

### Cabeçalhos

| Cabeçalho | Direção | Uso |
| --- | --- | --- |
| `Authorization: Bearer <accessToken>` | requisição | Toda rota, menos `POST /auth/login` e `POST /auth/refresh` |
| `Idempotency-Key: <uuid>` | requisição | Escritas. Repetir a mesma chave devolve a resposta original |
| `X-Dispositivo-Id: <uuid>` | requisição | Identifica o aparelho; vai para a trilha de auditoria (`dispositivoId`) |
| `X-Request-Id` | ambas | Gerado se ausente; devolvido na resposta, gravado no log de acesso e no corpo de erro |

### Autenticação

- `accessToken`: JWT **EdDSA (Ed25519)**, validade de **15 min** (`expiraEm` em segundos). Claims: `iss`, `sub` (id do profissional), `nome`, `tipoRegistro`, `registro`, `uf`, `papel`, `iat`, `exp`, `jti`.
- `refreshToken`: opaco, validade de **30 dias**, **rotativo** (cada uso emite um novo e revoga o anterior; reapresentar um já usado revoga todas as sessões do profissional).
- Papéis: `ADMIN` (tudo) e `PROFISSIONAL` (tudo, menos auditoria e cadastro de profissional).

### Listas paginadas

Query `?limite=50&cursor=<opaco>` (`limite` de 1 a 200, padrão 50). Resposta:

```json
{ "itens": [ ... ], "proximoCursor": "eyJ0IjoiMjAyNi0xMS0xN1QyMTowMDowMFoiLCJpZCI6Ii4uLiJ9" }
```

`proximoCursor: null` indica a última página. Para a próxima página, repita a chamada com `cursor=<proximoCursor>`.

### Erro: corpo único nos três serviços

```json
{
  "codigo": "VALIDACAO",
  "mensagem": "Dados inválidos.",
  "detalhes": [{ "campo": "nome", "mensagem": "obrigatório" }],
  "requestId": "6f1c2a9e-1b7d-4c55-9a43-0e5f2d3b8a10"
}
```

`detalhes` só aparece em `VALIDACAO`.

| HTTP | `codigo` | Quando |
| --- | --- | --- |
| 401 | `CREDENCIAIS_INVALIDAS` | Login errado (mensagem genérica, não diz se foi o registro ou a senha) |
| 401 | `NAO_AUTENTICADO` | Token ausente, inválido ou expirado; refresh token inválido |
| 403 | `SEM_PERMISSAO` | Papel insuficiente (ex.: PROFISSIONAL em rota de ADMIN) |
| 404 | `NAO_ENCONTRADO` | Id do caminho não existe |
| 422 | `VALIDACAO` | Corpo ou parâmetro inválido; referência do corpo inexistente (`pessoaId`, `atendimentoId`) |
| 422 | `CHAVE_IDEMPOTENCIA_CONFLITANTE` | Mesma `Idempotency-Key` com corpo diferente |
| 429 | `MUITAS_TENTATIVAS` | Limite de tentativas de login |
| 500 | `ERRO_INTERNO` | Falha inesperada (sem detalhe interno) |
| 503 | `SERVICO_INDISPONIVEL` | Banco ou serviço dependente fora do ar |

Regra usada pelo app: **4xx é rejeição definitiva** (não reenviar); **rede, 5xx e *timeout* são transitórios** (reenviar com recuo).

### Idempotência das escritas

| Situação | Resposta |
| --- | --- |
| Primeira vez com a chave | **201** (ou 200 nas rotas que alteram: `PATCH /pessoa/{id}`, inativação) |
| Mesma chave, mesmo corpo | **200 com a mesma resposta**, sem gravar nada |
| Mesma chave, corpo diferente | 422 `CHAVE_IDEMPOTENCIA_CONFLITANTE` |
| Sem chave, `id` já existente | 200 com o registro existente |

Detalhes em [`../arquitetura/sincronizacao.md`](../arquitetura/sincronizacao.md).

## 3. Visão geral das 31 rotas

**Origem:** **E** = um dos 9 endpoints sugeridos no enunciado · **PDF** e **E-mail** = rotas de documento e envio pedidas no enunciado · em branco = rota adicional. **Auth:** 🔓 pública · 🔑 qualquer papel · 🛡️ só ADMIN.

| # | Método | Rota | Serviço | Auth | Origem | Sucesso |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | POST | [`/auth/login`](#post-authlogin) | Mike | 🔓 | **E** | 200 |
| 2 | POST | [`/auth/refresh`](#post-authrefresh) | Mike | refresh token | | 200 |
| 3 | POST | [`/auth/logout`](#post-authlogout) | Mike | 🔑 | | 204 |
| 4 | GET | [`/auth/me`](#get-authme) | Mike | 🔑 | | 200 |
| 5 | POST | [`/auth/profissional`](#post-authprofissional) | Mike | 🛡️ | | 201 |
| 6 | POST | [`/log`](#post-log) | Mike | 🔑 | **E** | 200 |
| 7 | GET | [`/auditoria/acesso`](#get-auditoriaacesso) | Mike | 🛡️ | | 200 |
| 8 | GET | [`/auditoria/cliente`](#get-auditoriacliente) | Mike | 🛡️ | | 200 |
| 9 | GET | [`/medicamento`](#get-medicamento) | Cida | 🔑 | **E** | 200 |
| 10 | GET | [`/pessoa`](#get-pessoa) | Cida | 🔑 | | 200 |
| 11 | GET | [`/pessoa/{id}`](#get-pessoaid) | Cida | 🔑 | | 200 |
| 12 | POST | [`/pessoa`](#post-pessoa) | Cida | 🔑 | **E** | 201 |
| 13 | PATCH | [`/pessoa/{id}`](#patch-pessoaid) | Cida | 🔑 | | 200 |
| 14 | GET | [`/prontuario`](#get-prontuario) | Cida | 🔑 | **E** | 200 |
| 15 | GET | [`/prontuario/{pessoaId}`](#get-prontuariopessoaid) | Cida | 🔑 | **E** | 200 |
| 16 | POST | [`/prontuario`](#post-prontuario) | Cida | 🔑 | **E** | 201 |
| 17 | POST | [`/prontuario-item`](#post-prontuario-item) | Cida | 🔑 | | 201 |
| 18 | POST | [`/prontuario-item/{id}/inativacao`](#post-prontuario-itemidinativacao) | Cida | 🔑 | | 200 |
| 19 | GET | [`/atendimento`](#get-atendimento) | Cida | 🔑 | | 200 |
| 20 | GET | [`/atendimento/{pessoaId}`](#get-atendimentopessoaid) | Cida | 🔑 | **E** | 200 |
| 21 | POST | [`/atendimento`](#post-atendimento) | Cida | 🔑 | **E** | 201 |
| 22 | POST | [`/atendimento-evento`](#post-atendimento-evento) | Cida | 🔑 | | 201 |
| 23 | GET | [`/ficha/{atendimentoId}`](#get-fichaatendimentoid) | Cida | 🔑 | | 200 |
| 24 | GET | [`/sync/alteracoes`](#get-syncalteracoes) | Cida | 🔑 | | 200 |
| 25 | POST | [`/documento/ficha-atendimento`](#post-documentoficha-atendimento) | Jaiminho | 🔑 | **PDF** | 201 |
| 26 | GET | [`/documento`](#get-documento) | Jaiminho | 🔑 | | 200 |
| 27 | GET | [`/documento/{id}`](#get-documentoid) | Jaiminho | 🔑 | | 200 |
| 28 | GET | [`/documento/{id}/pdf`](#get-documentoidpdf) | Jaiminho | 🔑 | **PDF** | 200 |
| 29 | POST | [`/documento/{id}/email`](#post-documentoidemail) | Jaiminho | 🔑 | **E-mail** | 202 |
| 30 | GET | [`/documento/{id}/email`](#get-documentoidemail) | Jaiminho | 🔑 | **E-mail** | 200 |
| 31 | POST | [`/documento/email/{envioId}/reenvio`](#post-documentoemailenvioidreenvio) | Jaiminho | 🔑 | **E-mail** | 202 |

Todas as rotas acima ficam sob `/api/v1`. **Total: 8 no MikeBaguncinha, 16 na DonaCida, 7 no Jaiminho.**

### Os 9 endpoints do enunciado, lado a lado

| Enunciado | Implementado | Observação |
| --- | --- | --- |
| `POST /auth/login` | `POST /api/v1/auth/login` | Única rota pública |
| `GET /medicamento` | `GET /api/v1/medicamento` | Paginado |
| `GET /prontuario` | `GET /api/v1/prontuario` | Paginado |
| `GET /prontuario/{id}` | `GET /api/v1/prontuario/{pessoaId}` | O `{id}` é o da **pessoa** ("o prontuário de uma pessoa") |
| `POST /pessoa` | `POST /api/v1/pessoa` | |
| `GET /atendimento/{id}` | `GET /api/v1/atendimento/{pessoaId}` | O `{id}` é o da **pessoa** ("todos os atendimentos de uma pessoa") |
| `POST /prontuario` | `POST /api/v1/prontuario` | |
| `POST /atendimento` | `POST /api/v1/atendimento` | Referencia `pessoaId`; o servidor resolve o prontuário |
| `POST /log` | `POST /api/v1/log` | |

---

## 4. MikeBaguncinha: identidade e auditoria

### POST /auth/login

Autentica por CRM, COREN ou ID de socorrista. **Única rota sem token.**

**Corpo**

| Campo | Tipo | Regra |
| --- | --- | --- |
| `tipoRegistro` | `"CRM" \| "COREN" \| "SOCORRISTA"` | obrigatório |
| `registro` | string | obrigatório, até 40 |
| `uf` | string? | sigla de 2 letras; obrigatória para CRM e COREN, ignorada para SOCORRISTA |
| `senha` | string | obrigatória, até 200 |

```json
{ "tipoRegistro": "CRM", "registro": "100001", "uf": "RS", "senha": "<senha de demonstração>" }
```

**Resposta 200** (`Sessao`) + cookie `mf_refresh` (`HttpOnly`, `Path=/api/v1/auth`), usado pelo portal:

```json
{
  "accessToken": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9...",
  "expiraEm": 900,
  "refreshToken": "q8V3cXoT2m...",
  "profissional": {
    "id": "0d5b1c1e-7a10-4c1e-9b11-000000000001",
    "nome": "Dra. Helena Prado",
    "tipoRegistro": "CRM",
    "registro": "100001",
    "uf": "RS",
    "papel": "ADMIN"
  }
}
```

**Erros:** 401 `CREDENCIAIS_INVALIDAS` · 422 `VALIDACAO` · 429 `MUITAS_TENTATIVAS` (5 falhas em 15 min para o mesmo IP + registro; o gateway também limita a 10 req/min por IP nesta rota).

### POST /auth/refresh

Troca o refresh token por uma sessão nova. O token vem no corpo **ou** no cookie `mf_refresh`.

**Corpo** (opcional quando há cookie)

```json
{ "refreshToken": "q8V3cXoT2m..." }
```

**Resposta 200:** `Sessao`, igual à do login (com refresh token **novo**; o anterior deixa de valer).

**Erros:** 401 `NAO_AUTENTICADO` (vencido, revogado ou reapresentado).

### POST /auth/logout

Revoga o refresh token da sessão. Exige `Authorization`.

**Corpo** (opcional quando há cookie)

```json
{ "refreshToken": "q8V3cXoT2m..." }
```

**Resposta 204** sem corpo; o cookie `mf_refresh` é apagado.

### GET /auth/me

Dados do profissional dono do token. Sem corpo. O app usa esta rota como *ping* autenticado.

**Resposta 200** (`Profissional`)

```json
{
  "id": "0d5b1c1e-7a10-4c1e-9b11-000000000001",
  "nome": "Dra. Helena Prado",
  "tipoRegistro": "CRM",
  "registro": "100001",
  "uf": "RS",
  "papel": "ADMIN"
}
```

### POST /auth/profissional

Cadastra um profissional (**só ADMIN**). O profissional nasce ativo.

**Corpo**

| Campo | Tipo | Regra |
| --- | --- | --- |
| `nome` | string | obrigatório, até 120 |
| `tipoRegistro` | `"CRM" \| "COREN" \| "SOCORRISTA"` | obrigatório |
| `registro` | string | obrigatório, até 40 |
| `uf` | string? | 2 letras, obrigatória para CRM e COREN; descartada para SOCORRISTA |
| `papel` | `"ADMIN" \| "PROFISSIONAL"` | obrigatório |
| `senha` | string | de 8 a 200 caracteres |

```json
{
  "nome": "Enf. Ana Teixeira",
  "tipoRegistro": "COREN",
  "registro": "200099",
  "uf": "RS",
  "papel": "PROFISSIONAL",
  "senha": "uma-senha-forte"
}
```

**Resposta 201** (`Profissional`, sem a senha)

```json
{
  "id": "5a3e8f40-2c1b-4d7e-8f90-1b2c3d4e5f60",
  "nome": "Enf. Ana Teixeira",
  "tipoRegistro": "COREN",
  "registro": "200099",
  "uf": "RS",
  "papel": "PROFISSIONAL"
}
```

**Erros:** 403 `SEM_PERMISSAO` · 422 `VALIDACAO` (inclusive registro já cadastrado, com detalhe no campo `registro`).

### POST /log

Recebe os logs que o app gerou localmente, **inclusive offline** (login, sincronizações, gravações, mudança do simulador de rede). Até **500 por chamada**, idempotente pelo `id` de cada log. O `profissionalId` vem do token e o `dispositivoId`, do cabeçalho `X-Dispositivo-Id`. Os logs nunca levam dado de paciente.

**Corpo**

| Campo de cada log | Tipo | Regra |
| --- | --- | --- |
| `id` | uuid | obrigatório (gerado no aparelho) |
| `ocorridoEm` | data-hora | hora do aparelho |
| `acao` | string | obrigatório, até 100. O app envia: `LOGIN`, `LOGOUT`, `SINCRONIZACAO`, `SIMULACAO_CONECTIVIDADE`, `PESSOA_CRIADA`, `PRONTUARIO_CRIADO`, `PRONTUARIO_ITEM_ADICIONADO`, `PRONTUARIO_ITEM_INATIVADO`, `ATENDIMENTO_INICIADO`, `EVENTO_REGISTRADO`, `PENDENCIA_CORRIGIDA`, `ERRO_GRAVACAO_LOCAL` |
| `entidade` | string? | até 100 |
| `entidadeId` | string? | até 100 |
| `resultado` | `"SUCESSO" \| "FALHA"` | obrigatório |
| `estavaOnline` | boolean | obrigatório |
| `detalhe` | objeto? | livre (jsonb) |

```json
{
  "logs": [
    {
      "id": "9f8e7d6c-5b4a-4321-9abc-def012345678",
      "ocorridoEm": "2026-11-17T21:04:10.000Z",
      "acao": "SINCRONIZACAO",
      "resultado": "SUCESSO",
      "estavaOnline": true,
      "detalhe": { "gatilho": "conexao-voltou", "confirmadas": 4, "rejeitadas": 0, "recebidas": 12 }
    }
  ]
}
```

**Resposta 200**

```json
{ "aceitos": 1, "duplicados": 0 }
```

### GET /auditoria/acesso

Log de acesso de **todos os serviços** (uma linha por requisição a `/api/v1`), mais recentes primeiro. **Só ADMIN.** No portal: *Auditoria → Logs de acesso*.

**Query:** `de`, `ate` (data-hora), `profissionalId` (uuid), `servico` (`mike-baguncinha` \| `dona-cida` \| `jaiminho`), `limite`, `cursor`.

**Resposta 200** (página de `LogAcesso`)

```json
{
  "itens": [
    {
      "id": "48211",
      "dataHora": "2026-11-17T21:04:09.812Z",
      "servico": "dona-cida",
      "ipCliente": "179.190.76.74",
      "profissionalId": "0d5b1c1e-7a10-4c1e-9b11-000000000001",
      "metodo": "POST",
      "rota": "/api/v1/atendimento",
      "statusCode": 201,
      "tempoMs": 18,
      "requestId": "6f1c2a9e-1b7d-4c55-9a43-0e5f2d3b8a10"
    }
  ],
  "proximoCursor": null
}
```

`rota` é o **molde** da rota (`/api/v1/pessoa/{id}`), nunca o id real. `profissionalId` é `null` em chamadas sem token válido.

**Erros:** 403 `SEM_PERMISSAO`.

### GET /auditoria/cliente

Logs recebidos dos aparelhos por `POST /log`. **Só ADMIN.** No portal: *Auditoria → Logs dos aparelhos*.

**Query:** `de`, `ate`, `profissionalId`, `limite`, `cursor`.

**Resposta 200** (página de `LogClienteSaida` = `LogCliente` + campos do servidor)

```json
{
  "itens": [
    {
      "id": "9f8e7d6c-5b4a-4321-9abc-def012345678",
      "ocorridoEm": "2026-11-17T21:04:10.000Z",
      "acao": "SINCRONIZACAO",
      "resultado": "SUCESSO",
      "estavaOnline": true,
      "detalhe": { "gatilho": "conexao-voltou", "confirmadas": 4, "rejeitadas": 0, "recebidas": 12 },
      "profissionalId": "0d5b1c1e-7a10-4c1e-9b11-000000000003",
      "dispositivoId": "c2d9a6b4-3e1f-4a7b-9c8d-7e6f5a4b3c2d",
      "recebidoEm": "2026-11-17T21:04:11.120Z"
    }
  ],
  "proximoCursor": null
}
```

---

## 5. DonaCida: núcleo clínico e sincronização

### GET /medicamento

Catálogo de medicamentos (cadastrado **pelo banco**, ver [`../operacao/banco-manual.md`](../operacao/banco-manual.md)).

**Query:** `incluirInativos` (`true` \| `false`, padrão `false`), `limite`, `cursor`.

**Resposta 200** (página de `Medicamento`)

```json
{
  "itens": [
    {
      "id": "7c1f0b2a-0000-4000-8000-000000000001",
      "nome": "Dipirona",
      "principioAtivo": "Dipirona monoidratada",
      "apresentacao": "Solução injetável 500 mg/mL",
      "observacao": null,
      "ativo": true
    }
  ],
  "proximoCursor": null
}
```

### GET /pessoa

Busca pessoas, mais recentes primeiro.

**Query:** `busca` (parte do nome ou CPF, até 200), `somenteDuplicatas` (`true` = só as marcadas como possível duplicata), `limite`, `cursor`.

**Resposta 200:** página de [`Pessoa`](#pessoa).

### GET /pessoa/{id}

**Resposta 200:** [`Pessoa`](#pessoa). **Erros:** 404.

### POST /pessoa

Cadastra uma pessoa. O `id` é gerado no cliente; `editadoEm` é a hora do aparelho (usada na resolução de conflito por campo).

**Corpo**

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | uuid | obrigatório |
| `nome` | string | obrigatório, até 200 |
| `editadoEm` | data-hora | obrigatório |
| `dataNascimento` | data? \| null | `YYYY-MM-DD` |
| `sexo` | `"M" \| "F" \| "I"`? \| null | |
| `cpf` | string? \| null | 11 dígitos, sem pontuação (o dígito verificador não é conferido) |
| `cns` | string? \| null | 15 dígitos |
| `telefone` | string? \| null | até 30 |
| `email` | string? \| null | e-mail do paciente, até 320; com ele, a ficha vai sozinha ao encerrar o atendimento |
| `contatoEmergenciaNome` | string? \| null | até 200 |
| `contatoEmergenciaTelefone` | string? \| null | até 30 |
| `contatoEmergenciaEmail` | string? \| null | até 320 |
| `naoIdentificada` | boolean? | `true` para paciente sem identificação |
| `descricaoIdentificacao` | string? \| null | até 1000 (ex.: características físicas) |

```json
{
  "id": "3b9d2c1a-8e7f-4a6b-9c5d-4e3f2a1b0c9d",
  "nome": "Marta Fictícia da Silva",
  "dataNascimento": "1958-03-12",
  "sexo": "F",
  "cpf": "12345678909",
  "telefone": "(51) 99999-0000",
  "email": "marta.ficticia@exemplo.test",
  "contatoEmergenciaNome": "João Fictício",
  "contatoEmergenciaTelefone": "(51) 98888-0000",
  "editadoEm": "2026-11-17T20:58:00.000Z"
}
```

**Resposta 201** (ou 200 se o `id` já existia): [`Pessoa`](#pessoa). Se o CPF ou nome + data de nascimento coincidir com outra pessoa, `possivelDuplicataDe` aponta para ela (o cadastro **nunca** é bloqueado).

### PATCH /pessoa/{id}

Altera campos da pessoa. Cada campo tem carimbo próprio: **vence a edição mais recente por campo** (`editadoEm`), mesmo que chegue depois.

**Corpo**

```json
{
  "campos": { "telefone": "(51) 97777-0000", "email": null },
  "editadoEm": "2026-11-17T21:10:00.000Z"
}
```

`campos` aceita qualquer subconjunto dos campos editáveis de `POST /pessoa` (ao menos um).

**Resposta 200:** [`Pessoa`](#pessoa) atualizada. **Erros:** 404 · 422.

### GET /prontuario

Prontuários de todas as pessoas, cada um com a pessoa resumida.

**Query:** `limite`, `cursor`.

**Resposta 200** (página de `ProntuarioComPessoa` = [`Prontuario`](#prontuario) + `pessoa`)

```json
{
  "itens": [
    {
      "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "pessoaId": "3b9d2c1a-8e7f-4a6b-9c5d-4e3f2a1b0c9d",
      "tipoSanguineo": "O+",
      "observacoes": null,
      "itens": [],
      "criadoEm": "2026-11-17T20:58:05.000Z",
      "atualizadoEm": "2026-11-17T20:58:05.000Z",
      "pessoa": {
        "id": "3b9d2c1a-8e7f-4a6b-9c5d-4e3f2a1b0c9d",
        "nome": "Marta Fictícia da Silva",
        "dataNascimento": "1958-03-12",
        "cpf": "12345678909",
        "naoIdentificada": false
      }
    }
  ],
  "proximoCursor": null
}
```

### GET /prontuario/{pessoaId}

Prontuário de **uma pessoa** (o id do caminho é o da pessoa), com os itens.

**Resposta 200:** [`Prontuario`](#prontuario). **Erros:** 404.

### POST /prontuario

Cadastra o prontuário de uma pessoa, opcionalmente já com itens.

**Corpo**

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | uuid | obrigatório |
| `pessoaId` | uuid | obrigatório, pessoa existente |
| `tipoSanguineo` | string? | até 10 |
| `observacoes` | string? | até 4000 |
| `itens` | array? | até 200 itens `{ id, tipo, descricao, registradoEm }` |

```json
{
  "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "pessoaId": "3b9d2c1a-8e7f-4a6b-9c5d-4e3f2a1b0c9d",
  "tipoSanguineo": "O+",
  "itens": [
    { "id": "e0f1a2b3-c4d5-4e6f-8a7b-9c0d1e2f3a4b", "tipo": "ALERGIA", "descricao": "Penicilina", "registradoEm": "2026-11-17T20:58:05.000Z" }
  ]
}
```

**Resposta 201:** [`Prontuario`](#prontuario). Se a pessoa **já tinha** prontuário: **200** com o existente e os itens unidos (nada se perde).

**Erros:** 422 (`pessoaId` inexistente).

### POST /prontuario-item

Acrescenta alergia, comorbidade ou medicação contínua.

**Corpo**

```json
{
  "id": "f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b",
  "pessoaId": "3b9d2c1a-8e7f-4a6b-9c5d-4e3f2a1b0c9d",
  "tipo": "MEDICACAO_CONTINUA",
  "descricao": "Losartana 50 mg, 1x ao dia",
  "registradoEm": "2026-11-17T21:00:00.000Z"
}
```

`tipo`: `ALERGIA` \| `COMORBIDADE` \| `MEDICACAO_CONTINUA`. `descricao` até 500. Se a pessoa ainda não tem prontuário, ele é criado.

**Resposta 201:** [`ProntuarioItem`](#prontuarioitem).

### POST /prontuario-item/{id}/inativacao

Inativa um item (não apaga).

**Corpo**

```json
{ "inativadoEm": "2026-11-17T21:20:00.000Z" }
```

**Resposta 200:** [`ProntuarioItem`](#prontuarioitem) com `inativadoEm` preenchido. **Erros:** 404.

### GET /atendimento

Todos os atendimentos, mais recentes primeiro, com o nome da pessoa.

**Query:** `limite`, `cursor`.

**Resposta 200** (página de `AtendimentoListado` = [`Atendimento`](#atendimento) + `pessoaNome`)

```json
{
  "itens": [
    {
      "id": "b7c8d9e0-f1a2-4b3c-8d4e-5f6a7b8c9d0e",
      "pessoaId": "3b9d2c1a-8e7f-4a6b-9c5d-4e3f2a1b0c9d",
      "prontuarioId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "profissionalId": "0d5b1c1e-7a10-4c1e-9b11-000000000003",
      "profissionalNome": "Soc. Lia Moura",
      "dispositivoId": "c2d9a6b4-3e1f-4a7b-9c8d-7e6f5a4b3c2d",
      "iniciadoEm": "2026-11-17T21:00:00.000Z",
      "recebidoEm": "2026-11-17T21:04:09.000Z",
      "localDescricao": "Rua Fictícia, 100 - Lajeado/RS",
      "latitude": -29.4669,
      "longitude": -51.9614,
      "queixaPrincipal": "Dor torácica",
      "status": "ABERTO",
      "encerradoEm": null,
      "pessoaNome": "Marta Fictícia da Silva"
    }
  ],
  "proximoCursor": null
}
```

### GET /atendimento/{pessoaId}

Todos os atendimentos de **uma pessoa** (o id do caminho é o da pessoa).

**Query:** `limite`, `cursor`. **Resposta 200:** página de `AtendimentoListado` (igual à anterior).

### POST /atendimento

Abre um atendimento. O cliente manda `pessoaId`; o servidor resolve (ou cria) o prontuário. Pode levar os **eventos iniciais** de uma vez (é como o app sobe um atendimento feito offline).

**Corpo**

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | uuid | obrigatório |
| `pessoaId` | uuid | obrigatório, pessoa existente |
| `iniciadoEm` | data-hora | obrigatório (hora do aparelho) |
| `localDescricao` | string? | até 500 |
| `latitude` / `longitude` | number? | -90..90 / -180..180 |
| `queixaPrincipal` | string? | até 2000 |
| `eventos` | array? | até 500 [eventos](#eventos-do-atendimento), **sem** `atendimentoId` |

```json
{
  "id": "b7c8d9e0-f1a2-4b3c-8d4e-5f6a7b8c9d0e",
  "pessoaId": "3b9d2c1a-8e7f-4a6b-9c5d-4e3f2a1b0c9d",
  "iniciadoEm": "2026-11-17T21:00:00.000Z",
  "localDescricao": "Rua Fictícia, 100 - Lajeado/RS",
  "queixaPrincipal": "Dor torácica",
  "eventos": [
    {
      "id": "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
      "tipo": "SINAIS_VITAIS",
      "ocorridoEm": "2026-11-17T21:01:00.000Z",
      "dados": { "pressaoSistolica": 150, "pressaoDiastolica": 95, "frequenciaCardiaca": 110, "saturacao": 94 }
    }
  ]
}
```

**Resposta 201** (200 na repetição): [`Atendimento`](#atendimento). **Erros:** 422 (`pessoaId` inexistente, evento inválido).

### POST /atendimento-evento

Acrescenta um evento à linha do tempo de um atendimento. Eventos são **imutáveis**: correção é um novo evento `RETIFICACAO`. Um `ENCERRAMENTO` passa o atendimento a `ENCERRADO` e pede ao Jaiminho a ficha em PDF (que vai por e-mail ao paciente, se ele tiver e-mail).

**Corpo:** um [evento](#eventos-do-atendimento) com `atendimentoId`.

```json
{
  "id": "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
  "atendimentoId": "b7c8d9e0-f1a2-4b3c-8d4e-5f6a7b8c9d0e",
  "tipo": "MEDICACAO",
  "ocorridoEm": "2026-11-17T21:05:00.000Z",
  "dados": {
    "medicamentoId": "7c1f0b2a-0000-4000-8000-000000000001",
    "nome": "Dipirona",
    "dose": "1",
    "unidade": "g",
    "via": "EV"
  }
}
```

**Resposta 201** (200 na repetição): [`Evento`](#evento). Evento em atendimento já encerrado é aceito (o registro de campo pode chegar atrasado).

**Erros:** 422 (`atendimentoId` inexistente, `dados` inválidos para o `tipo`).

### GET /ficha/{atendimentoId}

Atendimento completo, como vai para o PDF: atendimento, pessoa, prontuário, eventos (ordenados por `ocorridoEm`) e o resumo de passagem de caso.

**Resposta 200** (`Ficha`)

```json
{
  "atendimento": { "...": "Atendimento" },
  "pessoa": { "...": "Pessoa" },
  "prontuario": { "...": "Prontuario" },
  "eventos": [ { "...": "Evento" } ],
  "resumo": {
    "ultimosSinaisVitais": { "ocorridoEm": "2026-11-17T21:01:00.000Z", "dados": { "pressaoSistolica": 150, "frequenciaCardiaca": 110 } },
    "glasgowMaisRecente": { "ocorridoEm": "2026-11-17T21:02:00.000Z", "dados": { "ocular": 4, "verbal": 5, "motora": 6, "total": 15 } },
    "triagem": { "ocorridoEm": "2026-11-17T21:02:30.000Z", "dados": { "protocolo": "MANCHESTER", "classificacao": "LARANJA" } },
    "medicacoes": [ { "ocorridoEm": "2026-11-17T21:05:00.000Z", "nome": "Dipirona", "dose": "1", "unidade": "g", "via": "EV" } ],
    "procedimentos": [ { "ocorridoEm": "2026-11-17T21:06:00.000Z", "descricao": "Acesso venoso periférico" } ],
    "alergias": ["Penicilina"],
    "comorbidades": [],
    "medicacoesContinuas": ["Losartana 50 mg, 1x ao dia"],
    "encerramento": { "ocorridoEm": "2026-11-17T21:30:00.000Z", "desfecho": "Removida ao hospital", "destino": "Hospital Fictício" }
  }
}
```

O resumo já aplica as retificações. **Erros:** 404.

### GET /sync/alteracoes

**Descida** da sincronização do app: tudo que mudou no servidor desde o cursor. Na primeira vez, `desde=0`.

**Query:** `desde` (cursor numérico, padrão `0`), `limite` (1 a 1000, padrão 500).

**Resposta 200** (`Alteracoes`)

```json
{
  "medicamentos": [ { "...": "Medicamento" } ],
  "pessoas": [ { "...": "Pessoa" } ],
  "prontuarios": [ { "...": "Prontuario sem o campo itens" } ],
  "prontuarioItens": [ { "...": "ProntuarioItem" } ],
  "proximoCursor": "18342",
  "temMais": false
}
```

Enquanto `temMais` for `true`, o app repete a chamada com `desde=<proximoCursor>`. Atendimentos e eventos **não descem** (ficam no aparelho que os criou e no servidor).

---

## 6. Jaiminho: PDF e e-mail

### POST /documento/ficha-atendimento

Gera a ficha de atendimento em PDF (busca a ficha na DonaCida com o token de quem chamou) e a guarda com hash SHA-256 e código de verificação. Se o atendimento está `ENCERRADO` e o paciente tem e-mail, a ficha nova entra sozinha na fila de envio para ele (uma vez por documento).

**Corpo**

```json
{ "atendimentoId": "b7c8d9e0-f1a2-4b3c-8d4e-5f6a7b8c9d0e" }
```

**Resposta 201** (`Documento`; **200** se já existia documento com o mesmo conteúdo)

```json
{
  "id": "1f2e3d4c-5b6a-4798-8a6b-5c4d3e2f1a0b",
  "atendimentoId": "b7c8d9e0-f1a2-4b3c-8d4e-5f6a7b8c9d0e",
  "codigoVerificacao": "MF-7K3Q-9XPA",
  "hashConteudo": "9b74c9897bac770ffc029102a200c5de...",
  "geradoPor": "0d5b1c1e-7a10-4c1e-9b11-000000000001",
  "geradoEm": "2026-11-17T21:31:00.000Z",
  "tamanhoBytes": 48213
}
```

**Erros:** 404/422 (atendimento inexistente) · 503 `SERVICO_INDISPONIVEL` (DonaCida fora).

### GET /documento

Documentos de um atendimento.

**Query:** `atendimentoId` (uuid, **obrigatório**).

**Resposta 200**

```json
{ "itens": [ { "...": "Documento" } ], "proximoCursor": null }
```

Sem paginação (poucos documentos por atendimento): `proximoCursor` é sempre `null`.

### GET /documento/{id}

Metadados e **verificação de integridade**: o servidor recalcula o SHA-256 do PDF guardado.

**Resposta 200** (`DocumentoComIntegridade` = `Documento` + `integro`)

```json
{
  "id": "1f2e3d4c-5b6a-4798-8a6b-5c4d3e2f1a0b",
  "atendimentoId": "b7c8d9e0-f1a2-4b3c-8d4e-5f6a7b8c9d0e",
  "codigoVerificacao": "MF-7K3Q-9XPA",
  "hashConteudo": "9b74c9897bac770ffc029102a200c5de...",
  "geradoPor": "0d5b1c1e-7a10-4c1e-9b11-000000000001",
  "geradoEm": "2026-11-17T21:31:00.000Z",
  "tamanhoBytes": 48213,
  "integro": true
}
```

**Erros:** 404.

### GET /documento/{id}/pdf

Download do PDF.

**Resposta 200:** binário `application/pdf`, com `Content-Disposition: attachment; filename="ficha-<codigoVerificacao>.pdf"` e `Cache-Control: no-store`. **Erros:** 404.

### POST /documento/{id}/email

Enfileira o envio da ficha, **em anexo**, a paciente ou familiar. O envio é assíncrono: um *worker* tenta com recuo (60 s, 5 min, 15 min, 1 h) até `ENVIADO` ou `FALHA_DEFINITIVA`. Aceita `Idempotency-Key`.

**Corpo**

| Campo | Tipo | Regra |
| --- | --- | --- |
| `destinatarioNome` | string | obrigatório, até 200 |
| `destinatarioEmail` | string | e-mail válido, até 320 |
| `vinculo` | `"PACIENTE" \| "FAMILIAR"` | obrigatório |

```json
{ "destinatarioNome": "João Fictício", "destinatarioEmail": "joao.ficticio@exemplo.test", "vinculo": "FAMILIAR" }
```

**Resposta 202** (`Envio`)

```json
{
  "id": "8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d",
  "documentoId": "1f2e3d4c-5b6a-4798-8a6b-5c4d3e2f1a0b",
  "destinatarioNome": "João Fictício",
  "destinatarioEmail": "joao.ficticio@exemplo.test",
  "vinculo": "FAMILIAR",
  "status": "PENDENTE",
  "tentativas": 0,
  "proximaTentativaEm": null,
  "ultimoErro": null,
  "solicitadoPor": "0d5b1c1e-7a10-4c1e-9b11-000000000001",
  "criadoEm": "2026-11-17T21:32:00.000Z",
  "enviadoEm": null
}
```

**Erros:** 404 (documento inexistente) · 422.

### GET /documento/{id}/email

Situação dos envios de um documento.

**Resposta 200**

```json
{ "itens": [ { "...": "Envio", "status": "ENVIADO", "tentativas": 1, "enviadoEm": "2026-11-17T21:32:04.000Z" } ], "proximoCursor": null }
```

`status`: `PENDENTE` → `ENVIANDO` → `ENVIADO` ou `FALHA_DEFINITIVA`.

### POST /documento/email/{envioId}/reenvio

Recoloca na fila um envio em `FALHA_DEFINITIVA`. Sem corpo.

**Resposta 202:** `Envio` de volta a `PENDENTE`. **Erros:** 404 · 422 (o envio não estava em `FALHA_DEFINITIVA`).

---

## 7. Tipos compartilhados

Definidos em [`packages/contratos/src`](../../packages/contratos/src) e usados pelo portal, pelo app e pela DonaCida (o Go e o Python seguem os mesmos nomes).

### Pessoa

```json
{
  "id": "3b9d2c1a-8e7f-4a6b-9c5d-4e3f2a1b0c9d",
  "nome": "Marta Fictícia da Silva",
  "dataNascimento": "1958-03-12",
  "sexo": "F",
  "cpf": "12345678909",
  "cns": null,
  "telefone": "(51) 99999-0000",
  "email": "marta.ficticia@exemplo.test",
  "contatoEmergenciaNome": "João Fictício",
  "contatoEmergenciaTelefone": "(51) 98888-0000",
  "contatoEmergenciaEmail": null,
  "naoIdentificada": false,
  "descricaoIdentificacao": null,
  "possivelDuplicataDe": null,
  "criadoEm": "2026-11-17T20:58:00.000Z",
  "atualizadoEm": "2026-11-17T20:58:00.000Z"
}
```

### Prontuario

```json
{
  "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "pessoaId": "3b9d2c1a-8e7f-4a6b-9c5d-4e3f2a1b0c9d",
  "tipoSanguineo": "O+",
  "observacoes": null,
  "itens": [ { "...": "ProntuarioItem" } ],
  "criadoEm": "2026-11-17T20:58:05.000Z",
  "atualizadoEm": "2026-11-17T21:00:00.000Z"
}
```

### ProntuarioItem

```json
{
  "id": "e0f1a2b3-c4d5-4e6f-8a7b-9c0d1e2f3a4b",
  "prontuarioId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "pessoaId": "3b9d2c1a-8e7f-4a6b-9c5d-4e3f2a1b0c9d",
  "tipo": "ALERGIA",
  "descricao": "Penicilina",
  "registradoPor": "0d5b1c1e-7a10-4c1e-9b11-000000000003",
  "registradoEm": "2026-11-17T20:58:05.000Z",
  "inativadoEm": null
}
```

### Atendimento

```json
{
  "id": "b7c8d9e0-f1a2-4b3c-8d4e-5f6a7b8c9d0e",
  "pessoaId": "3b9d2c1a-8e7f-4a6b-9c5d-4e3f2a1b0c9d",
  "prontuarioId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "profissionalId": "0d5b1c1e-7a10-4c1e-9b11-000000000003",
  "profissionalNome": "Soc. Lia Moura",
  "dispositivoId": "c2d9a6b4-3e1f-4a7b-9c8d-7e6f5a4b3c2d",
  "iniciadoEm": "2026-11-17T21:00:00.000Z",
  "recebidoEm": "2026-11-17T21:04:09.000Z",
  "localDescricao": "Rua Fictícia, 100 - Lajeado/RS",
  "latitude": null,
  "longitude": null,
  "queixaPrincipal": "Dor torácica",
  "status": "ABERTO",
  "encerradoEm": null
}
```

`profissionalId`, `dispositivoId` e `recebidoEm` vêm do servidor (token, cabeçalho e relógio), nunca do corpo.

### Evento

Evento de entrada + campos do servidor:

```json
{
  "id": "e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b",
  "atendimentoId": "b7c8d9e0-f1a2-4b3c-8d4e-5f6a7b8c9d0e",
  "tipo": "GLASGOW",
  "ocorridoEm": "2026-11-17T21:02:00.000Z",
  "dados": { "ocular": 4, "verbal": 5, "motora": 6, "total": 15 },
  "profissionalId": "0d5b1c1e-7a10-4c1e-9b11-000000000003",
  "profissionalNome": "Soc. Lia Moura",
  "dispositivoId": "c2d9a6b4-3e1f-4a7b-9c8d-7e6f5a4b3c2d",
  "recebidoEm": "2026-11-17T21:04:09.000Z"
}
```

### Eventos do atendimento

Todo evento tem `id` (uuid), `tipo`, `ocorridoEm` (data-hora) e `dados`, **estrito para cada tipo**. As faixas numéricas só barram digitação implausível: o sistema **não interpreta** valor clínico.

| `tipo` | `dados` | Regras |
| --- | --- | --- |
| `SINAIS_VITAIS` | `{ pressaoSistolica?, pressaoDiastolica?, frequenciaCardiaca?, frequenciaRespiratoria?, saturacao?, temperatura?, glicemia? }` | ao menos um; inteiros (PAS 0–300, PAD 0–200, FC 0–300, FR 0–100, SpO₂ 0–100, glicemia 0–1000); temperatura 20–45 |
| `GLASGOW` | `{ ocular, verbal, motora, total }` | 1–4, 1–5, 1–6; `total` = soma (3–15) |
| `TRIAGEM` | `{ protocolo, classificacao }` | `MANCHESTER`: `VERMELHO`, `LARANJA`, `AMARELO`, `VERDE`, `AZUL` · `START`: `VERMELHO`, `AMARELO`, `VERDE`, `PRETO` |
| `MEDICACAO` | `{ medicamentoId, nome, dose, unidade, via }` | `medicamentoId` uuid ou `null` (fora do catálogo); textos até 200/50/50/50 |
| `PROCEDIMENTO` | `{ descricao }` | até 2000 |
| `OBSERVACAO` | `{ texto }` | até 4000 |
| `RETIFICACAO` | `{ motivo, dadosCorrigidos? }` | exige `retificaEventoId` (uuid) no evento; `dadosCorrigidos` com até 20 campos simples |
| `ENCERRAMENTO` | `{ desfecho, destino? }` | até 1000 / 500; encerra o atendimento |

Exemplo de retificação:

```json
{
  "id": "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  "atendimentoId": "b7c8d9e0-f1a2-4b3c-8d4e-5f6a7b8c9d0e",
  "tipo": "RETIFICACAO",
  "retificaEventoId": "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
  "ocorridoEm": "2026-11-17T21:08:00.000Z",
  "dados": { "motivo": "PAS digitada errada", "dadosCorrigidos": { "pressaoSistolica": 130 } }
}
```

---

## 8. Porta de gestão (fora do gateway)

Cada serviço tem uma segunda porta (9090 no Compose), **sem autenticação e nunca roteada pelo gateway**, alcançável só dentro das redes Docker. Usada para diagnóstico, pelos testes de resiliência e, o JWKS, pelos outros serviços.

| Método | Rota | Serviço | Resposta |
| --- | --- | --- | --- |
| GET | `/health/live` | os três | 200 `{"status":"ok"}` |
| GET | `/health/ready` | os três | 200 se o banco responde; 503 caso contrário |
| GET | `/jwks.json` | só o MikeBaguncinha | `{ "keys": [ { "kty": "OKP", "crv": "Ed25519", "x": "...", "kid": "..." } ] }` |

## 9. Exemplo com `curl`

A senha de demonstração está em [`apps/mike-baguncinha/README.md`](../../apps/mike-baguncinha/README.md).

```bash
BASE=https://177-44-248-60.sslip.io/api/v1     # local: http://127.0.0.1:8088/api/v1

# 1. Login (CRM 100001/RS é a ADMIN de demonstração)
TOKEN=$(curl -s $BASE/auth/login -H 'Content-Type: application/json' \
  -d '{"tipoRegistro":"CRM","registro":"100001","uf":"RS","senha":"'"$MF_SENHA_DEMO"'"}' | jq -r .accessToken)

# 2. Leituras
curl -s $BASE/medicamento -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/sync/alteracoes?desde=0&limite=500" -H "Authorization: Bearer $TOKEN"

# 3. Escrita idempotente (repetir o comando devolve 200 com o mesmo corpo)
ID=$(uuidgen | tr A-Z a-z)
curl -s $BASE/pessoa -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $ID" \
  -d '{"id":"'$ID'","nome":"Pessoa Curl Fictícia","editadoEm":"2026-11-17T21:00:00.000Z"}'

# 4. Sem token: 401
curl -i $BASE/medicamento
```

Profissionais de demonstração (fictícios):

| Papel | Nome | `tipoRegistro` | `registro` | `uf` |
| --- | --- | --- | --- | --- |
| ADMIN | Dra. Helena Prado | `CRM` | `100001` | `RS` |
| PROFISSIONAL | Enf. Caio Brandão | `COREN` | `200002` | `RS` |
| PROFISSIONAL | Soc. Lia Moura | `SOCORRISTA` | `300003` | (vazio) |

## 10. Coleção Postman

[`medicalfield.postman_collection.json`](medicalfield.postman_collection.json): Postman v2.1, 31 requisições cobrindo 30 rotas (todas menos `POST /auth/profissional`, que criaria um profissional novo a cada execução) e uma chamada sem token para mostrar o 401.

### Usar no Postman (ou Insomnia, que importa o mesmo formato)

1. **Import** → escolha o arquivo.
2. Na aba **Variables** da coleção, preencha `senha` (vem **vazia**). Para a VM, troque `baseUrl` por `https://177-44-248-60.sslip.io/api/v1`.
3. Rode **Login**. O script guarda o `accessToken` em `token`; a coleção inteira usa `Authorization: Bearer {{token}}`.
4. Rode as pastas **na ordem**: cada requisição guarda os ids que as seguintes usam (`pessoaId`, `atendimentoId`, `documentoId`, `envioId`).

| Variável | Padrão | Preenchida por |
| --- | --- | --- |
| `baseUrl` | `http://localhost:8088/api/v1` | você, se o endereço for outro |
| `senha` | (vazia) | **você** |
| `token`, `refreshToken` | — | script do Login e do Refresh |
| `dispositivoId` | — | script da coleção (vai em `X-Dispositivo-Id`) |
| `pessoaId`, `itemId`, `atendimentoId` | — | pré-script das escritas, com `{{$guid}}` |
| `documentoId`, `envioId` | — | script das respostas |

A coleção **cria dados fictícios**: uma pessoa "Pessoa Postman …", um prontuário, um atendimento, um PDF e um envio de e-mail para `familiar.postman@exemplo.test` (capturado pelo Mailpit). A requisição **"Reenviar (só após falha definitiva)"** espera **422**: o envio não falhou, então a regra de negócio recusa o reenvio.

### Rodar pela linha de comando (Newman)

```bash
export MF_SENHA_DEMO='<senha de demonstração>'      # não grave em arquivo
npx newman run docs/api/medicalfield.postman_collection.json --env-var senha=$MF_SENHA_DEMO
```

Outro endereço: acrescente `--env-var baseUrl=https://<host>/api/v1`. Última validação (18/11/2026, Newman 6.2.3): 31 requisições, 57 asserções, 0 falhas.

Cuidado ao repetir muitas vezes seguidas: a rota de login tem limite de 10 requisições por minuto por IP no gateway, e 5 senhas erradas em 15 minutos bloqueiam aquele registro naquele IP.

## 11. O que as rotas não fazem

- Não há rota de cadastro de medicamento: o enunciado prevê a inserção **pelo banco** ([`../operacao/banco-manual.md`](../operacao/banco-manual.md)).
- Não há `DELETE` em nenhuma rota. Item de prontuário é inativado; evento é retificado por um novo evento.
- Nenhuma rota devolve o nome de um profissional a partir do id: auditoria e documentos mostram só o id (limitação D-06). Atendimentos e eventos trazem `profissionalNome` gravado no momento do registro.
