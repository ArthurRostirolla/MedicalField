# Patterns do MedicalField

Guia rápido: **9 patterns** — 6 de projeto (GoF) + 3 arquiteturais. Detalhes em [`arquitetura.md` §7](arquitetura.md#7-padrões-de-projeto).

## Padrões de projeto

### 1. Repository (enunciado)
Esconde de onde vem o dado (SQLite local, API ou Postgres) atrás de uma classe/interface.
A tela só chama o repositório; nenhuma tela usa `fetch`.
**11 repositórios no total:**

| App | Repositório (contrato) | Implementação |
|---|---|---|
| App (TS) | `RepositorioPessoas` | [`dados/pessoas.ts:132`](../../apps/lucky-patcher/src/dados/pessoas.ts#L132) |
| App (TS) | `RepositorioProntuarios` | [`dados/pessoas.ts:275`](../../apps/lucky-patcher/src/dados/pessoas.ts#L275) |
| App (TS) | `RepositorioMedicamentos` | [`dados/pessoas.ts:390`](../../apps/lucky-patcher/src/dados/pessoas.ts#L390) |
| App (TS) | `RepositorioAtendimentos` | [`dados/atendimentos.ts:51`](../../apps/lucky-patcher/src/dados/atendimentos.ts#L51) |
| App (TS) | `RepositorioPendencias` | [`dados/pendencias.ts:25`](../../apps/lucky-patcher/src/dados/pendencias.ts#L25) |
| DonaCida (TS) | `RepositorioClinico` — [`dominio/repositorios.ts:58`](../../apps/dona-cida/src/dominio/repositorios.ts#L58) | `RepositorioClinicoSql` — [`infra/repositorio-clinico.ts:213`](../../apps/dona-cida/src/infra/repositorio-clinico.ts#L213) |
| Mike (Go) | `ProfissionalRepository` — [`dominio/identidade.go:83`](../../apps/mike-baguncinha/internal/dominio/identidade.go#L83) | `Postgres` — [`infra/postgres.go`](../../apps/mike-baguncinha/internal/infra/postgres.go) |
| Mike (Go) | `SessaoRepository` — [`dominio/identidade.go:92`](../../apps/mike-baguncinha/internal/dominio/identidade.go#L92) | `Postgres` — [`infra/postgres.go`](../../apps/mike-baguncinha/internal/infra/postgres.go) |
| Mike (Go) | `AuditoriaRepository` — [`dominio/auditoria.go:60`](../../apps/mike-baguncinha/internal/dominio/auditoria.go#L60) | `Postgres` — [`infra/postgres.go`](../../apps/mike-baguncinha/internal/infra/postgres.go) |
| Jaiminho (Python) | `DocumentoRepository` — [`dominio/portas.py:10`](../../apps/jaiminho/src/jaiminho/dominio/portas.py#L10) | `DocumentoRepositorySql` — [`infra/banco.py:74`](../../apps/jaiminho/src/jaiminho/infra/banco.py#L74) |
| Jaiminho (Python) | `EnvioRepository` — [`dominio/portas.py:26`](../../apps/jaiminho/src/jaiminho/dominio/portas.py#L26) | `EnvioRepositorySql` — [`infra/banco.py:135`](../../apps/jaiminho/src/jaiminho/infra/banco.py#L135) |

No App, o acesso remoto fica em [`sync/http.ts:49`](../../apps/lucky-patcher/src/sync/http.ts#L49) (`ClienteHttp`).

### 2. Strategy (enunciado)
Cada tipo de dado tem sua regra de conflito de sincronização; o registro escolhe a estratégia pelo tipo.
Eventos/itens → `UniaoImutavel`; pessoa → `CampoMaisRecente`; medicamento → `ServidorVence`; duplicata → `RevisaoManual`.
- Interface [`conflito/estrategia.ts:6`](../../apps/dona-cida/src/dominio/conflito/estrategia.ts#L6), seletor [`conflito/registro.ts:20`](../../apps/dona-cida/src/dominio/conflito/registro.ts#L20)
- Implementações: [`uniao-imutavel.ts:10`](../../apps/dona-cida/src/dominio/conflito/uniao-imutavel.ts#L10), [`campo-mais-recente.ts:25`](../../apps/dona-cida/src/dominio/conflito/campo-mais-recente.ts#L25), [`servidor-vence.ts:7`](../../apps/dona-cida/src/dominio/conflito/servidor-vence.ts#L7), [`revisao-manual.ts:10`](../../apps/dona-cida/src/dominio/conflito/revisao-manual.ts#L10)

### 3. Observer (enunciado)
`MonitorConectividade` publica mudanças de rede; quem assina reage sem ficar consultando.
O motor sincroniza sozinho quando volta a ficar online; a UI se atualiza pelo mesmo `assinar`.
- Sujeito [`sync/conectividade.ts:30`](../../apps/lucky-patcher/src/sync/conectividade.ts#L30)
- Assinantes: [`sync/motor.ts:113`](../../apps/lucky-patcher/src/sync/motor.ts#L113), [`ui/contexto.tsx:65`](../../apps/lucky-patcher/src/ui/contexto.tsx#L65) (`useConectividade`)

No Portal, o sujeito é o próprio módulo do modo offline: `publicar()` grava a fila no `localStorage` e avisa quem assinou `assinarOffline`.
Aqui não há assinante disparando sync (quem chama `sincronizar()` são os eventos `online`/`offline` do navegador e o intervalo de 15 s); o Observer só mantém a UI em dia.
- Sujeito [`api/offline.ts:55`](../../apps/brad-pitt/src/api/offline.ts#L55) (`assinarOffline`, `lerOffline`)
- Assinantes (via `useSyncExternalStore`): [`casca/Casca.tsx:36`](../../apps/brad-pitt/src/casca/Casca.tsx#L36), [`atendimentos/DetalheAtendimento.tsx:60`](../../apps/brad-pitt/src/atendimentos/DetalheAtendimento.tsx#L60), [`atendimentos/FichaPdfEnvios.tsx:60`](../../apps/brad-pitt/src/atendimentos/FichaPdfEnvios.tsx#L60)

### 4. Command
Cada escrita vira um objeto serializável (método, rota, corpo, `op_id`) guardado na tabela `outbox`.
Pode ser reenviado depois, quantas vezes for preciso; o servidor é o receptor que executa.

Os 6 comandos (todos `POST`; `dependeDe` = o que precisa ser confirmado antes):

| Ação no app | Rota | Depende de | Origem |
|---|---|---|---|
| Cadastrar paciente | `/api/v1/pessoa` | — | [`pessoas.ts:198`](../../apps/lucky-patcher/src/dados/pessoas.ts#L198) |
| Abrir prontuário | `/api/v1/prontuario` | pessoa | [`pessoas.ts:209`](../../apps/lucky-patcher/src/dados/pessoas.ts#L209), [`:315`](../../apps/lucky-patcher/src/dados/pessoas.ts#L315) |
| Adicionar item ao prontuário | `/api/v1/prontuario-item` | pessoa | [`pessoas.ts:340`](../../apps/lucky-patcher/src/dados/pessoas.ts#L340) |
| Inativar item | `/api/v1/prontuario-item/{id}/inativacao` | pessoa | [`pessoas.ts:365`](../../apps/lucky-patcher/src/dados/pessoas.ts#L365) |
| Iniciar atendimento | `/api/v1/atendimento` | pessoa | [`atendimentos.ts:125`](../../apps/lucky-patcher/src/dados/atendimentos.ts#L125) |
| Registrar evento | `/api/v1/atendimento-evento` | atendimento | [`atendimentos.ts:180`](../../apps/lucky-patcher/src/dados/atendimentos.ts#L180) |

Eventos: `SINAIS_VITAIS`, `GLASGOW`, `TRIAGEM`, `MEDICACAO`, `PROCEDIMENTO`, `OBSERVACAO`, `RETIFICACAO`, `ENCERRAMENTO`.

Ciclo: `PENDENTE → ENVIANDO → CONFIRMADA` (2xx). Rede/5xx volta a `PENDENTE` com recuo; 4xx vira `REJEITADA` (tela Pendências) e retém os dependentes. A fila sai na ordem de criação.
- App: [`dados/outbox.ts:9`](../../apps/lucky-patcher/src/dados/outbox.ts#L9) (`Comando`, `sqlNovoComando`), envio em [`sync/motor.ts:234`](../../apps/lucky-patcher/src/sync/motor.ts#L234)
- Receptor: [`aplicacao/comando.ts:35`](../../apps/dona-cida/src/aplicacao/comando.ts#L35) (`ExecutorComandos`)

### 5. Adapter
Uma porta única com implementações por plataforma/mecanismo; a lógica de cima não muda.
Banco local: web (SQLite WASM/OPFS), nativo (SQLCipher) e memória (testes). E-mail: SMTP real ou falso.
- Porta [`banco/executor.ts:10`](../../apps/lucky-patcher/src/banco/executor.ts#L10) → [`executorWeb.ts:5`](../../apps/lucky-patcher/src/banco/executorWeb.ts#L5), [`executorExpo.ts:38`](../../apps/lucky-patcher/src/banco/executorExpo.ts#L38), [`executorOo1.ts:10`](../../apps/lucky-patcher/src/banco/executorOo1.ts#L10)
- E-mail: [`dominio/portas.py:66`](../../apps/jaiminho/src/jaiminho/dominio/portas.py#L66) → [`infra/email.py:23`](../../apps/jaiminho/src/jaiminho/infra/email.py#L23) (`Smtp`) / [`:49`](../../apps/jaiminho/src/jaiminho/infra/email.py#L49) (`Falso`)

### 6. Chain of Responsibility (middleware)
Toda requisição passa por `request-id → log de acesso → autenticação → handler`, igual nos três serviços.
Cada elo trata uma preocupação e passa adiante; o handler fica limpo.
- Go: [`http/servidor.go:44`](../../apps/mike-baguncinha/internal/http/servidor.go#L44)
- Nest: [`http/cadeia.ts:19`](../../apps/dona-cida/src/http/cadeia.ts#L19) + [`app.module.ts:62`](../../apps/dona-cida/src/app.module.ts#L62)
- FastAPI: [`http/middlewares.py:64`](../../apps/jaiminho/src/jaiminho/http/middlewares.py#L64) + [`http/app.py:43`](../../apps/jaiminho/src/jaiminho/http/app.py#L43)

## Padrões arquiteturais

### 7. Transactional Outbox
Dado + comando no outbox + log são gravados na **mesma transação** local; a rede é resolvida depois.
No Jaiminho, o envio de e-mail vira linha numa fila no Postgres, processada por um worker com backoff.
- App: [`dados/pessoas.ts:161`](../../apps/lucky-patcher/src/dados/pessoas.ts#L161), motor [`sync/motor.ts`](../../apps/lucky-patcher/src/sync/motor.ts)
- Jaiminho: [`aplicacao/envios.py:22`](../../apps/jaiminho/src/jaiminho/aplicacao/envios.py#L22) (`WorkerEnvios`), backoff em [`dominio/regras.py:41`](../../apps/jaiminho/src/jaiminho/dominio/regras.py#L41)

### 8. Idempotent Receiver
O servidor guarda a `Idempotency-Key`/`op_id`: repetir o mesmo comando devolve a mesma resposta, sem duplicar.
Dado + `operacao_sync` + auditoria numa transação; chave reaproveitada com outro corpo → 422.
- [`aplicacao/comando.ts:30`](../../apps/dona-cida/src/aplicacao/comando.ts#L30)

### 9. API Gateway ("freeway")
Traefik na frente de tudo: roteia por prefixo para cada serviço e aplica limite de login, CORS e cabeçalhos.
Só ele pode mandar `X-Forwarded-For` aos serviços.
- [`deploy/gateway/rotas.yml`](../../deploy/gateway/rotas.yml), serviço em [`deploy/compose.yaml:164`](../../deploy/compose.yaml#L164)
