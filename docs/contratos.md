# Contratos do MedicalField

**Fonte única de verdade para todas as interfaces entre peças.** Ninguém inventa rota, campo, código de erro ou variável de ambiente fora daqui. Precisa mudar algo? Avise o agente principal; a mudança entra **neste arquivo** antes do código.

Arquitetura completa: [`arquitetura/plano-arquitetural.md`](arquitetura/plano-arquitetural.md). O banco está definido nas migrações (`apps/*/migrations/*.sql`) — elas **são** o contrato de dados; não as altere, crie uma nova se precisar.

## 1. Peças e portas

| Peça | Pasta | Linguagem | Porta dev (API / gestão) | No cluster |
| --- | --- | --- | --- | --- |
| MikeBaguncinha (identidade + auditoria) | `apps/mike-baguncinha` | Go | 8081 / 9091 | `mike-baguncinha:8080` / `9090` |
| DonaCida (núcleo clínico + sync) | `apps/dona-cida` | TypeScript (NestJS) | 8082 / 9092 | `dona-cida:8080` / `9090` |
| Jaiminho (PDF + e-mail) | `apps/jaiminho` | Python (FastAPI) | 8083 / 9093 | `jaiminho:8080` / `9090` |
| BradPitt (portal) | `apps/brad-pitt` | React + Vite | 5181, base `/portal/` | pod `web` |
| LuckyPatcher (app) | `apps/lucky-patcher` | React + Vite + Capacitor | 5182, base `/app/` | pod `web` + APK |
| freeway (gateway) | `deploy/` | Traefik | — | Ingress |
| Postgres dev | `scripts/dev-db.sh` | — | 5544 | `postgres:5432` |
| Mailpit dev | — | — | SMTP 1025 / UI 8025 | `mailpit:1025` |

Roteamento do gateway (e do proxy do Vite em dev) — **o prefixo não é removido**; cada serviço atende em `/api/v1/...`:

| Prefixo | Destino |
| --- | --- |
| `/api/v1/auth`, `/api/v1/log`, `/api/v1/auditoria` | MikeBaguncinha |
| `/api/v1/documento` | Jaiminho |
| `/api/v1/medicamento`, `/pessoa`, `/prontuario`, `/prontuario-item`, `/atendimento`, `/atendimento-evento`, `/ficha`, `/sync` | DonaCida |
| `/portal`, `/app` | `web` |

Banco em dev: `postgres://<papel>:<senha>@localhost:5544/medicalfield` — papéis `mf_mike`/`dev_mike`, `mf_cida`/`dev_cida`, `mf_jaiminho`/`dev_jaiminho`; admin `postgres`/`dev_admin`. Banco isolado para testes: `scripts/dev-db.sh criar-banco <nome>` + `scripts/dev-db.sh migrar <nome>`.

## 2. Convenções HTTP

- JSON em `camelCase`. Datas ISO-8601 UTC com `Z` (`2026-11-17T21:00:00.000Z`); data pura `YYYY-MM-DD`. Ids são UUID minúsculos.
- **Cabeçalhos:** `Authorization: Bearer <jwt>`; `X-Request-Id` (gerado se ausente, devolvido na resposta); `X-Dispositivo-Id` (UUID do dispositivo; o app sempre envia); `Idempotency-Key` (UUID; o app sempre envia em escritas).
- **Listas paginadas:** `?limite=50&cursor=<opaco>` → `{ "itens": [...], "proximoCursor": "..." | null }`. `limite` máx. 200.
- **Erro — corpo único nos três serviços:**

```json
{ "codigo": "VALIDACAO", "mensagem": "Texto em português", "detalhes": [{ "campo": "nome", "mensagem": "obrigatório" }], "requestId": "..." }
```

| HTTP | `codigo` | Quando |
| --- | --- | --- |
| 401 | `CREDENCIAIS_INVALIDAS` | Login errado (mensagem genérica) |
| 401 | `NAO_AUTENTICADO` | Token ausente, inválido ou expirado |
| 403 | `SEM_PERMISSAO` | Papel insuficiente |
| 404 | `NAO_ENCONTRADO` | — |
| 422 | `VALIDACAO` | Corpo/parâmetro inválido (`detalhes` = lista de campos) |
| 422 | `CHAVE_IDEMPOTENCIA_CONFLITANTE` | Mesma `Idempotency-Key` com corpo diferente |
| 429 | `MUITAS_TENTATIVAS` | Limite de tentativas de login |
| 500 | `ERRO_INTERNO` | Nunca vaza detalhe interno |
| 503 | `SERVICO_INDISPONIVEL` | Dependência fora (banco, DonaCida, etc.) |

Regra para o outbox do app: **4xx = rejeição definitiva (não reenviar); rede/5xx/timeout = transitório (reenviar)**. 401 é tratado à parte (renova o token e repete).

## 3. Autenticação

- JWT assinado com **EdDSA (Ed25519)** pelo MikeBaguncinha; cabeçalho com `kid`. Validade do access token: 15 min. Refresh token opaco, rotativo, 30 dias.
- Claims: `iss` = `medicalfield`, `sub` = id do profissional, `nome`, `tipoRegistro`, `registro`, `uf`, `papel` (`ADMIN` | `PROFISSIONAL`), `iat`, `exp`, `jti`.
- Chave pública: `GET http://mike-baguncinha:9090/jwks.json` (porta de **gestão**, nunca pelo gateway) → `{ "keys": [{ "kty": "OKP", "crv": "Ed25519", "kid": "...", "x": "...", "use": "sig", "alg": "EdDSA" }] }`. Os outros serviços guardam em cache por 5 min e buscam de novo ao ver um `kid` desconhecido.
- **Cada serviço valida o token sozinho** (assinatura, `iss`, `exp`). O gateway não autentica.
- Toda rota sob `/api/v1` exige token, **exceto** `POST /api/v1/auth/login`. `POST /auth/refresh` exige refresh token válido. Papéis: rotas `/auditoria/*` são só `ADMIN`; todas as demais aceitam os dois papéis.
- Profissionais de demonstração (fictícios; senha de todos em `apps/mike-baguncinha/README.md`):

| Papel | Nome | tipoRegistro | registro | uf |
| --- | --- | --- | --- | --- |
| ADMIN | Dra. Helena Prado | CRM | 100001 | RS |
| PROFISSIONAL | Enf. Caio Brandão | COREN | 200002 | RS |
| PROFISSIONAL | Soc. Lia Moura | SOCORRISTA | 300003 | (vazio) |

## 4. Obrigatório em todo serviço backend

**Cadeia de middleware, nesta ordem:** `request-id → log de acesso → autenticação → handler`. O log de acesso envolve a autenticação (um 401 também é registrado, com `profissional_id` nulo).

**Log de acesso** — uma linha por requisição em `/api/v1/*`:
- stdout, JSON em uma linha: `{"nivel":"info","tipo":"acesso","dataHora","servico","ipCliente","profissionalId","metodo","rota","statusCode","tempoMs","requestId"}`;
- e `INSERT` em `auditoria.log_acesso`, **assíncrono** (buffer em memória, descarga a cada 1 s ou 100 linhas, e no encerramento do processo). Falha ao gravar o log nunca derruba a requisição.
- `rota` = o padrão da rota (`/api/v1/prontuario/{pessoaId}`), não o caminho com ids; sem query string. `servico` = `mike-baguncinha` | `dona-cida` | `jaiminho`.
- Nenhum log (de acesso ou de aplicação) contém corpo de requisição, senha, token ou dado de paciente.

**IP do cliente:** se o par direto da conexão estiver em `PROXIES_CONFIAVEIS`, usar o IP mais à direita de `X-Forwarded-For` que **não** esteja nessa lista; caso contrário, usar o par direto e ignorar o cabeçalho.

**Porta de gestão** (separada, sem autenticação, nunca roteada pelo gateway): `GET /health/live` → 200 `{"status":"ok"}`; `GET /health/ready` → 200 se o banco responde, senão 503.

**Variáveis de ambiente comuns** (validadas na partida; faltou obrigatória, o processo não sobe):

| Variável | Padrão | Uso |
| --- | --- | --- |
| `PORTA` | 8080 | API |
| `PORTA_GESTAO` | 9090 | health (e JWKS no Mike) |
| `DATABASE_URL` | — (obrigatória) | papel restrito do serviço |
| `JWKS_URL` | — (obrigatória na Cida e no Jaiminho) | chave pública |
| `PROXIES_CONFIAVEIS` | `127.0.0.1/32,::1/128,10.42.0.0/16` | CIDRs separados por vírgula |
| `AMBIENTE` | `desenvolvimento` | ou `producao` |
| `NIVEL_LOG` | `info` | — |

Encerramento gracioso em `SIGTERM`. Contêiner roda como usuário não-root, com sistema de arquivos somente leitura (use `/tmp` se precisar escrever).

**Camadas (iguais nas três linguagens):** `http` (rotas, DTOs, middlewares) → `aplicacao` (casos de uso) → `dominio` (entidades, regras, interfaces) ← `infra` (SQL, HTTP, SMTP, config). Domínio em português (`Pessoa`, `Atendimento`); termos técnicos em inglês (`Repository`, `UseCase`). Comentários em português.

## 5. MikeBaguncinha — rotas

| Método | Rota | Auth |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | não |
| POST | `/api/v1/auth/refresh` | refresh token |
| POST | `/api/v1/auth/logout` | sim |
| GET | `/api/v1/auth/me` | sim |
| POST | `/api/v1/log` | sim |
| GET | `/api/v1/auditoria/acesso` | ADMIN |
| GET | `/api/v1/auditoria/cliente` | ADMIN |

```ts
// POST /auth/login
type LoginEntrada = { tipoRegistro: 'CRM' | 'COREN' | 'SOCORRISTA'; registro: string; uf?: string; senha: string };
type Profissional = { id: string; nome: string; tipoRegistro: string; registro: string; uf: string; papel: 'ADMIN' | 'PROFISSIONAL' };
type Sessao = { accessToken: string; expiraEm: number /* segundos */; refreshToken: string; profissional: Profissional };
// 200 Sessao. Também define o cookie `mf_refresh` (HttpOnly, SameSite=Strict, Path=/api/v1/auth; Secure em produção).
// 5 falhas em 15 min para o mesmo IP+registro → 429.

// POST /auth/refresh — corpo { refreshToken?: string } (ou cookie mf_refresh) → 200 Sessao (refresh rotacionado)
// POST /auth/logout  — corpo { refreshToken?: string } (ou cookie) → 204
// GET  /auth/me      → 200 Profissional

// POST /log — logs gerados offline pelo app (máx. 500 por chamada); idempotente por id
type LogCliente = { id: string; ocorridoEm: string; acao: string; entidade?: string; entidadeId?: string;
                    resultado: 'SUCESSO' | 'FALHA'; estavaOnline: boolean; detalhe?: Record<string, unknown> };
// corpo { logs: LogCliente[] } → 200 { aceitos: number; duplicados: number }
// profissional vem do token; dispositivo, de X-Dispositivo-Id.

// GET /auditoria/acesso?de=&ate=&profissionalId=&servico=&limite=&cursor=   (mais recentes primeiro)
type LogAcesso = { id: string; dataHora: string; servico: string; ipCliente: string; profissionalId: string | null;
                   metodo: string; rota: string; statusCode: number; tempoMs: number; requestId: string };
// GET /auditoria/cliente?de=&ate=&profissionalId=&limite=&cursor=
type LogClienteSaida = LogCliente & { profissionalId: string; dispositivoId: string | null; recebidoEm: string };
```

Variáveis próprias: `JWT_CHAVE_PRIVADA_PEM` (PKCS#8; obrigatória em `producao`; em `desenvolvimento`, se ausente, gera uma chave efêmera e avisa no log).

## 6. DonaCida — rotas

| Método | Rota | Nota |
| --- | --- | --- |
| GET | `/api/v1/medicamento` | **Enunciado.** Paginado; `?incluirInativos=true` |
| GET | `/api/v1/prontuario` | **Enunciado.** Todos, paginado; cada item traz `pessoa` resumida |
| GET | `/api/v1/prontuario/{pessoaId}` | **Enunciado.** Prontuário de uma pessoa, com itens |
| POST | `/api/v1/prontuario` | **Enunciado.** |
| POST | `/api/v1/prontuario-item` | Acrescenta alergia/comorbidade/medicação contínua |
| POST | `/api/v1/prontuario-item/{id}/inativacao` | Inativa um item |
| POST | `/api/v1/pessoa` | **Enunciado.** |
| GET | `/api/v1/pessoa` | `?busca=` (nome ou CPF), paginado; `?somenteDuplicatas=true` |
| GET | `/api/v1/pessoa/{id}` | — |
| PATCH | `/api/v1/pessoa/{id}` | — |
| GET | `/api/v1/atendimento/{pessoaId}` | **Enunciado.** Atendimentos de uma pessoa |
| GET | `/api/v1/atendimento` | Todos, paginado, mais recentes primeiro; cada item traz `pessoaNome` |
| POST | `/api/v1/atendimento` | **Enunciado.** |
| POST | `/api/v1/atendimento-evento` | Acrescenta evento à linha do tempo |
| GET | `/api/v1/ficha/{atendimentoId}` | Atendimento completo + resumo |
| GET | `/api/v1/sync/alteracoes` | Descida por cursor |

```ts
type Medicamento = { id: string; nome: string; principioAtivo: string | null; apresentacao: string | null;
                     observacao: string | null; ativo: boolean };

type Pessoa = { id: string; nome: string; dataNascimento: string | null; sexo: 'M' | 'F' | 'I' | null;
                cpf: string | null; cns: string | null; telefone: string | null;
                contatoEmergenciaNome: string | null; contatoEmergenciaTelefone: string | null; contatoEmergenciaEmail: string | null;
                naoIdentificada: boolean; descricaoIdentificacao: string | null;
                possivelDuplicataDe: string | null; criadoEm: string; atualizadoEm: string };
// POST /pessoa — campos editáveis de Pessoa + id (gerado no cliente) + editadoEm (hora do dispositivo)
type PessoaEntrada = { id: string; nome: string; editadoEm: string } & Partial<CamposEditaveisPessoa>;
// PATCH /pessoa/{id}
type PessoaAlteracao = { campos: Partial<CamposEditaveisPessoa>; editadoEm: string };

type TipoItem = 'ALERGIA' | 'COMORBIDADE' | 'MEDICACAO_CONTINUA';
type ProntuarioItem = { id: string; prontuarioId: string; pessoaId: string; tipo: TipoItem; descricao: string;
                        registradoPor: string | null; registradoEm: string; inativadoEm: string | null };
type Prontuario = { id: string; pessoaId: string; tipoSanguineo: string | null; observacoes: string | null;
                    itens: ProntuarioItem[]; criadoEm: string; atualizadoEm: string };
type ProntuarioEntrada = { id: string; pessoaId: string; tipoSanguineo?: string; observacoes?: string;
                           itens?: { id: string; tipo: TipoItem; descricao: string; registradoEm: string }[] };
type ProntuarioItemEntrada = { id: string; pessoaId: string; tipo: TipoItem; descricao: string; registradoEm: string };
// POST /prontuario-item/{id}/inativacao — corpo { inativadoEm: string }

type TipoEvento = 'SINAIS_VITAIS' | 'GLASGOW' | 'TRIAGEM' | 'MEDICACAO' | 'PROCEDIMENTO' | 'OBSERVACAO' | 'RETIFICACAO' | 'ENCERRAMENTO';
type EventoEntrada = { id: string; atendimentoId: string; tipo: TipoEvento; ocorridoEm: string; dados: object; retificaEventoId?: string };
type Evento = EventoEntrada & { profissionalId: string; profissionalNome: string; dispositivoId: string | null; recebidoEm: string };

type Atendimento = { id: string; pessoaId: string; prontuarioId: string; profissionalId: string; profissionalNome: string;
                     dispositivoId: string | null; iniciadoEm: string; recebidoEm: string; localDescricao: string | null;
                     latitude: number | null; longitude: number | null; queixaPrincipal: string | null;
                     status: 'ABERTO' | 'ENCERRADO'; encerradoEm: string | null };
type AtendimentoEntrada = { id: string; pessoaId: string; iniciadoEm: string; localDescricao?: string; latitude?: number;
                            longitude?: number; queixaPrincipal?: string; eventos?: Omit<EventoEntrada, 'atendimentoId'>[] };

type Resumo = {
  ultimosSinaisVitais: { ocorridoEm: string; dados: object } | null;
  glasgowMaisRecente: { ocorridoEm: string; dados: object } | null;
  triagem: { ocorridoEm: string; dados: object } | null;
  medicacoes: { ocorridoEm: string; nome: string; dose: string; unidade: string; via: string }[];
  procedimentos: { ocorridoEm: string; descricao: string }[];
  alergias: string[]; comorbidades: string[]; medicacoesContinuas: string[];
  encerramento: { ocorridoEm: string; desfecho: string; destino: string | null } | null;
};
type Ficha = { atendimento: Atendimento; pessoa: Pessoa; prontuario: Prontuario; eventos: Evento[] /* por ocorridoEm */; resumo: Resumo };

// GET /sync/alteracoes?desde=<cursor>&limite=500   (desde=0 na primeira vez)
type Alteracoes = { medicamentos: Medicamento[]; pessoas: Pessoa[];
                    prontuarios: Omit<Prontuario, 'itens'>[]; prontuarioItens: ProntuarioItem[];
                    proximoCursor: string; temMais: boolean };
```

**`dados` por tipo de evento** (validação estrita; campo desconhecido é rejeitado):

| Tipo | `dados` |
| --- | --- |
| `SINAIS_VITAIS` | ao menos um de: `pressaoSistolica` (int 0–300), `pressaoDiastolica` (int 0–200), `frequenciaCardiaca` (int 0–300), `frequenciaRespiratoria` (int 0–100), `saturacao` (int 0–100), `temperatura` (número 20–45), `glicemia` (int 0–1000) |
| `GLASGOW` | `ocular` (1–4), `verbal` (1–5), `motora` (1–6), `total` (= soma; conferido) |
| `TRIAGEM` | `protocolo` `MANCHESTER` com `classificacao` em `VERMELHO, LARANJA, AMARELO, VERDE, AZUL`; ou `START` com `VERMELHO, AMARELO, VERDE, PRETO` |
| `MEDICACAO` | `medicamentoId` (uuid ou `null` = fora do catálogo), `nome`, `dose`, `unidade`, `via` (textos livres, obrigatórios) |
| `PROCEDIMENTO` | `descricao` |
| `OBSERVACAO` | `texto` |
| `RETIFICACAO` | `motivo` (obrigatório), `dadosCorrigidos?` (objeto livre); exige `retificaEventoId` |
| `ENCERRAMENTO` | `desfecho` (obrigatório), `destino?`; passa o atendimento a `ENCERRADO` |

As faixas são apenas limites de digitação plausível — **o sistema não interpreta valor clínico nenhum**.

**Regras de escrita (todas as rotas POST/PATCH da DonaCida)**

1. **Idempotência.** O `id` da entidade vem do cliente. Com `Idempotency-Key`: primeira vez → 201 e grava `clinico.operacao_sync` (hash do corpo, status e resposta); repetição com o mesmo corpo → **200 com a mesma resposta**; mesma chave com corpo diferente → 422 `CHAVE_IDEMPOTENCIA_CONFLITANTE`. Sem chave: se o `id` já existe → 200 com o registro existente. Dado, `operacao_sync` e `auditoria_clinica` são gravados na **mesma transação**.
2. **Prontuário por pessoa.** O atendimento referencia `pessoaId`; o servidor resolve o prontuário (e cria um vazio se não existir). `POST /prontuario` para pessoa que já tem prontuário → 200 com o existente, unindo os itens novos (nunca rejeita).
3. **Estratégias de conflito** (`dominio/conflito`, padrão Strategy): eventos e itens de prontuário → `UniaoImutavel`; pessoa → `CampoMaisRecente` (por campo, comparando `editadoEm` com `carimbos_campos`; valor anterior vai para `auditoria_clinica`); medicamento → `ServidorVence`; duplicata provável (mesmo CPF, ou mesmo nome sem diferença de caixa + mesma data de nascimento) → `RevisaoManual`: aceita e preenche `possivelDuplicataDe`.
4. **Relógio.** `ocorridoEm`/`editadoEm`/`iniciadoEm` mais de 5 min à frente do servidor é limitado ao horário do servidor e registrado em `auditoria_clinica.observacao`.
5. **Nunca rejeitar dado clínico por conflito cadastral.** Rejeição (422) só por corpo inválido ou referência inexistente (`pessoaId`/`atendimentoId` desconhecido → 422 `VALIDACAO`, não 404, para o outbox reter os dependentes).
6. **Chave de idempotência é por profissional e por comando.** A mesma `Idempotency-Key` vinda de outro profissional, de outra rota ou com outro corpo → 422 `CHAVE_IDEMPOTENCIA_CONFLITANTE`, sem devolver a resposta guardada.
7. **Texto sem caracteres de controle.** Todo campo de texto recusa caracteres de controle (exceto `
`, ``, `	`) → 422 `VALIDACAO`. Cursor de paginação malformado → 422 com `campo: "cursor"`. Nenhum erro de dado vira 500.
8. **`dadosCorrigidos` da retificação é plano:** até 20 campos, chave de até 50 caracteres, valor simples (texto, número, booleano ou nulo). Esses valores são aplicados sobre o evento original na passagem de caso.

O resumo (`Resumo`) é calculado por função pura em `packages/dominio`, usada pela DonaCida, pelo portal e pelo app.

## 7. Jaiminho — rotas

| Método | Rota | Nota |
| --- | --- | --- |
| POST | `/api/v1/documento/ficha-atendimento` | Gera o PDF |
| GET | `/api/v1/documento` | `?atendimentoId=` obrigatório |
| GET | `/api/v1/documento/{id}` | Metadados + integridade |
| GET | `/api/v1/documento/{id}/pdf` | Download |
| POST | `/api/v1/documento/{id}/email` | Enfileira o envio |
| GET | `/api/v1/documento/{id}/email` | Situação dos envios |
| POST | `/api/v1/documento/email/{envioId}/reenvio` | Recoloca na fila |

```ts
// POST /documento/ficha-atendimento — corpo { atendimentoId: string }
type Documento = { id: string; atendimentoId: string; codigoVerificacao: string; hashConteudo: string;
                   geradoPor: string; geradoEm: string; tamanhoBytes: number };
// 201 Documento; 200 Documento se já existe um com o mesmo conteúdo. DonaCida fora → 503.
// GET /documento/{id} → Documento & { integro: boolean }   (sha256 do PDF guardado confere com hash_pdf)
// GET /documento/{id}/pdf → application/pdf, Content-Disposition: attachment; filename="ficha-<codigo>.pdf"

// POST /documento/{id}/email — aceita Idempotency-Key
type EnvioEntrada = { destinatarioNome: string; destinatarioEmail: string; vinculo: 'PACIENTE' | 'FAMILIAR' };
type Envio = { id: string; documentoId: string; destinatarioNome: string; destinatarioEmail: string; vinculo: string;
               status: 'PENDENTE' | 'ENVIANDO' | 'ENVIADO' | 'FALHA_DEFINITIVA'; tentativas: number;
               proximaTentativaEm: string | null; ultimoErro: string | null; solicitadoPor: string;
               criadoEm: string; enviadoEm: string | null };
// 202 Envio.   GET /documento/{id}/email → { itens: Envio[], proximoCursor: null }
// POST /documento/email/{envioId}/reenvio → 202 Envio (só a partir de FALHA_DEFINITIVA; senão 422)
```

- Gera a ficha chamando `GET {CLINICO_URL}/api/v1/ficha/{id}` **repassando o `Authorization` do usuário**.
- PDF: cabeçalho, dados da pessoa, **passagem de caso** (o `resumo`), linha do tempo completa, código de verificação, QR para `{URL_PUBLICA_PORTAL}/documentos/{id}`, e a faixa "DADOS DEMONSTRATIVOS — SEM VALIDADE CLÍNICA".
- Fila: *worker* consulta a cada 5 s com `FOR UPDATE SKIP LOCKED`; retentativas em 1, 5, 15 e 60 min; após 5 tentativas → `FALHA_DEFINITIVA`. `ENVIANDO` há mais de 5 min volta a `PENDENTE`. Entrega **ao menos uma vez**.
- Variáveis próprias: `CLINICO_URL`, `URL_PUBLICA_PORTAL`, `SMTP_HOST`, `SMTP_PORTA`, `SMTP_USUARIO?`, `SMTP_SENHA?`, `SMTP_SEGURANCA` (`nenhuma` | `starttls` | `tls`), `EMAIL_REMETENTE`, `EMAIL_BACKOFF_SEGUNDOS` (padrão `60,300,900,3600`; os testes encurtam).

## 8. Front-ends

- Monorepo npm *workspaces* (`apps/*`, `packages/*`, `apps/dona-cida`). `packages/contratos` (zod + tipos deste arquivo), `packages/dominio` (funções puras), `packages/ui` (tokens e componentes do design system).
- Os apps chamam **sempre caminhos relativos** `/api/v1/...` no navegador; o app Android usa o "endereço do servidor" configurável.
- Portal: access token em memória; refresh pelo cookie. App: sessão persistida localmente (precisa abrir sem rede).
- Tela e PDF exibem "DADOS DEMONSTRATIVOS — SEM VALIDADE CLÍNICA". Nenhum alerta, sugestão de dose ou interpretação clínica.
