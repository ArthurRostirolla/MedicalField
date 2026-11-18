# MedicalField

Prontuário médico de emergência **Offline-First** — trabalho final da disciplina 4815206 Arquiteturas de Software (Univates, 2026/B).

O profissional de saúde em campo registra o atendimento pré-hospitalar (sinais vitais, Escala de Glasgow, triagem Manchester/START, medicações) num **banco local**, com ou sem rede. Quando a conexão volta, o app sincroniza com o servidor central, com idempotência, trilha de auditoria e tratamento de conflitos. Um portal administrativo consulta os registros, gera a ficha de atendimento em PDF e a envia por e-mail.

> **Todos os dados são fictícios.** Pacientes, profissionais, registros de conselho e o catálogo de medicamentos são inventados e não têm validade clínica. O sistema apenas registra o que o profissional informa: não interpreta valores, não alerta e não sugere conduta.

## As peças

| Peça | Codinome | O que faz | Tecnologia | Pasta |
| --- | --- | --- | --- | --- |
| Serviço de identidade e auditoria | **MikeBaguncinha** | Login (CRM, COREN, socorrista), tokens, log de acesso | **Go** | [`apps/mike-baguncinha`](apps/mike-baguncinha) |
| Núcleo clínico e sincronização | **DonaCida** | Pessoas, prontuários, atendimentos, idempotência, conflitos | **TypeScript** (NestJS) | [`apps/dona-cida`](apps/dona-cida) |
| Serviço de documentos | **Jaiminho** | Ficha em PDF, fila e envio de e-mail | **Python** (FastAPI) | [`apps/jaiminho`](apps/jaiminho) |
| Gateway | **freeway** | Roteamento, limite de taxa no login | Traefik | [`deploy/gateway`](deploy/gateway) |
| Portal administrativo | **BradPitt** | Consulta, PDF, e-mail, auditoria | React + Vite | [`apps/brad-pitt`](apps/brad-pitt) |
| App do profissional | **LuckyPatcher** | Atendimento em campo, banco local, simulador de rede | React + Vite (PWA) + Capacitor | [`apps/lucky-patcher`](apps/lucky-patcher) |
| Banco central | — | Quatro schemas, um papel por serviço | PostgreSQL 17 | `apps/*/migrations` |
| Banco local | — | SQLite embarcado no app | SQLite WASM em OPFS | `apps/lucky-patcher/src/banco` |
| Pacotes compartilhados | — | Contratos (zod), funções de domínio, design system | TypeScript | [`packages/`](packages) |
| Implantação | — | Docker Compose, imagens no GHCR | — | [`deploy/`](deploy) |

Três serviços em três linguagens, uma interface administrativa e uma aplicação cliente com interface gráfica e simulador de conectividade — os requisitos do [enunciado](docs/enunciado-final_project_as_2026b.pdf).

## Entregáveis do enunciado

| # | Entregável | Documento |
| --- | --- | --- |
| 1 | Modelo de arquitetura: desenho + tecnologias utilizadas | [`docs/arquitetura/arquitetura.md`](docs/arquitetura/arquitetura.md) |
| 2 | Documentação das APIs e seus endpoints | [`docs/api/README.md`](docs/api/README.md) · [OpenAPI](docs/api/openapi) · [coleção Postman](docs/api/medicalfield.postman_collection.json) |
| 2 | Modelagem dos bancos de dados | [`docs/dados/modelagem.md`](docs/dados/modelagem.md) |
| 3 | Roteiro de testes | [`docs/testes/roteiro-de-testes.md`](docs/testes/roteiro-de-testes.md) |

## Pré-requisitos

| Ferramenta | Para quê |
| --- | --- |
| **Docker** em execução, com Compose v2 | Postgres, os três serviços, o portal, o app e o gateway rodam em contêiner |
| **Node.js 22 ou mais novo** + npm | Front-ends, pacotes, DonaCida, testes (usado: Node 24) |
| **Git Bash** (no Windows) | Os scripts são `bash` |
| **Google Chrome** | Testes de ponta a ponta (Playwright usa o Chrome instalado) |

**Go e Python não precisam estar instalados**: o serviço Go compila e testa em contêiner, e o Python depende de bibliotecas (Pango) que não rodam nativamente no Windows.

A **senha de demonstração** dos três profissionais fictícios está em [`apps/mike-baguncinha/README.md`](apps/mike-baguncinha/README.md). Nos comandos abaixo ela entra pela variável `MF_SENHA_DEMO`; não a grave em arquivo.

| Papel | Nome | Registro |
| --- | --- | --- |
| ADMIN (portal) | Dra. Helena Prado | CRM `100001` / RS |
| PROFISSIONAL (app) | Enf. Caio Brandão | COREN `200002` / RS |
| PROFISSIONAL (app) | Soc. Lia Moura | Socorrista `300003` |

## Subir tudo do zero

Há dois modos. Os comandos são executados no Git Bash, na raiz do repositório.

### Modo Compose — o sistema implantado

É o modo indicado para a apresentação e o mesmo da VM: tudo em Docker Compose (`deploy/compose.yaml`) — Postgres, migrações, os três serviços, a imagem `web` (portal e app), o Mailpit e o gateway.

```bash
bash deploy/scripts/segredos.sh                # cria deploy/.env (fora do Git) com senhas e chave do JWT
cd deploy && docker compose up -d --build      # constrói as 5 imagens e sobe tudo
docker compose ps                              # estado de cada contêiner
```

| O quê | Endereço |
| --- | --- |
| Portal | <http://localhost:8088/portal/> |
| App | <http://localhost:8088/app/> |
| API (gateway) | `http://localhost:8088/api/v1` |
| Mailpit (caixa de e-mail de demonstração) | <http://localhost:18025> — só em `127.0.0.1`, fora do gateway |

Outros comandos, sempre em `deploy/`: `docker compose logs -f <serviço>`, `docker compose down` (mantém os dados; `up -d` retoma) e `docker compose down -v` (apaga **também os dados**). As senhas e a chave de assinatura ficam em `deploy/.env`, gerado pelo `segredos.sh`.

### Modo desenvolvimento — serviços em contêiner, front-ends no Vite

```bash
# 1. Banco central (Postgres em localhost:5544) e migrações
bash scripts/dev-db.sh subir
bash scripts/dev-db.sh migrar

# 2. Os três serviços + Mailpit (constrói as imagens na primeira vez)
bash scripts/dev-servicos.sh subir --construir
bash scripts/dev-servicos.sh status

# 3. Dependências dos front-ends
npm install

# 4. Em dois terminais
npm run dev -w @medicalfield/brad-pitt        # portal: http://localhost:5181/portal/
npm run dev -w @medicalfield/lucky-patcher    # app:    http://localhost:5182/app/
```

| O quê | Endereço |
| --- | --- |
| MikeBaguncinha | API `localhost:8081` · gestão `localhost:9091` |
| DonaCida | API `localhost:8082` · gestão `localhost:9092` |
| Jaiminho | API `localhost:8083` · gestão `localhost:9093` |
| Mailpit | <http://localhost:8025> |
| Postgres | `localhost:5544`, banco `medicalfield` (`bash scripts/dev-db.sh psql`) |

O Vite repete o roteamento do gateway (`/api/v1/auth` → 8081, `/api/v1/documento` → 8083, o resto → 8082). Parar: `bash scripts/dev-servicos.sh parar`; apagar o banco de desenvolvimento: `bash scripts/dev-db.sh derrubar`.

Os dois modos usam portas diferentes e podem ficar no ar ao mesmo tempo.

## Testes

### Roteiro acadêmico de 17 passos (automatizado)

Contra o modo Compose no ar:

```bash
export MF_SENHA_DEMO='<senha de demonstração>'
npm run roteiro -w @medicalfield/e2e
```

Executa os 17 passos do enunciado no Chrome, com o portal e o app em dois contextos separados, e regrava [`docs/testes/evidencias/roteiro/`](docs/testes/evidencias/roteiro/resultado.md) (o observado em cada passo, 17 capturas e o PDF baixado). O mesmo roteiro, para executar à mão: [`docs/testes/roteiro-de-testes.md`](docs/testes/roteiro-de-testes.md).

### Rotas (Postman / Newman)

```bash
npx newman run docs/api/medicalfield.postman_collection.json --env-var senha=$MF_SENHA_DEMO
```

31 requisições, cobrindo as 30 rotas pelo gateway. Detalhes em [`docs/api/README.md`](docs/api/README.md).

### App Android (emulador)

Com o modo Compose no ar, um emulador (ou aparelho) visível em `adb devices` e o APK de depuração instalado — como gerar e instalar: [`apps/lucky-patcher/docs/nativo.md`](apps/lucky-patcher/docs/nativo.md):

```bash
export MF_SENHA_DEMO='<senha de demonstração>'
node e2e/android/android.mjs
```

> **Pendente:** este roteiro dirige o WebView do app Capacitor e não funciona com o app Expo (React Native não tem WebView). Ele precisa ser refeito, por exemplo com um fluxo Maestro. Até lá, o roteiro no aparelho (Android e iOS) é manual ([`apps/lucky-patcher/docs/nativo.md`](apps/lucky-patcher/docs/nativo.md)).

Dirigia o WebView do app por depuração remota, confere o banco central pelo `psql` do contêiner do Postgres e regrava [`docs/testes/evidencias/android/`](docs/testes/evidencias/android/resultado.md). No emulador o servidor é `http://10.0.2.2:8088`; num aparelho físico, defina `MF_SERVIDOR_ANDROID`.

### Por peça

| Peça | Comando | Precisa de |
| --- | --- | --- |
| `packages/contratos` | `npm test -w @medicalfield/contratos` | — |
| `packages/dominio` | `npm test -w @medicalfield/dominio` | — |
| `packages/ui` | `npm test -w @medicalfield/ui` | — |
| DonaCida | `bash scripts/dev-db.sh criar-banco mf_teste_cida && bash scripts/dev-db.sh migrar mf_teste_cida`, depois `npm test -w @medicalfield/dona-cida` | Postgres de desenvolvimento |
| Portal | `npm test -w @medicalfield/brad-pitt` (unidade) · `npm run e2e -w @medicalfield/brad-pitt` (Playwright) | o E2E precisa do modo desenvolvimento no ar e de `MF_SENHA_DEMO` |
| App | `npm test -w @medicalfield/lucky-patcher` (motor de sincronização) · `npm run e2e -w @medicalfield/lucky-patcher` (Playwright) | idem |
| MikeBaguncinha | `go vet` e `go test` em contêiner `golang:1.27` — comando em [`apps/mike-baguncinha/README.md`](apps/mike-baguncinha/README.md) | Postgres de desenvolvimento |
| Jaiminho | `ruff` e `pytest` na imagem de desenvolvimento — comando em [`apps/jaiminho/README.md`](apps/jaiminho/README.md) | Postgres de desenvolvimento |

Checagem de tipos: `npm run typecheck -w <workspace>` em qualquer pacote TypeScript. A integração contínua (`.github/workflows/ci.yml`) roda os testes dos três serviços e dos pacotes npm.

## Documentação

| Assunto | Documento |
| --- | --- |
| Arquitetura, diagramas, tecnologias, padrões de projeto | [`docs/arquitetura/arquitetura.md`](docs/arquitetura/arquitetura.md) |
| Sincronização Offline-First (outbox, cursor, idempotência, conflitos) | [`docs/arquitetura/sincronizacao.md`](docs/arquitetura/sincronizacao.md) |
| Segurança, auditoria e LGPD | [`docs/arquitetura/seguranca.md`](docs/arquitetura/seguranca.md) |
| Endpoints, OpenAPI, coleção Postman | [`docs/api/`](docs/api/README.md) |
| Modelagem dos bancos (central e local) | [`docs/dados/modelagem.md`](docs/dados/modelagem.md) |
| Roteiro de testes | [`docs/testes/roteiro-de-testes.md`](docs/testes/roteiro-de-testes.md) |
| Guia da apresentação | [`docs/apresentacao/guia-da-apresentacao.md`](docs/apresentacao/guia-da-apresentacao.md) |
| Contrato entre as peças (rotas, erros, variáveis) | [`docs/contratos.md`](docs/contratos.md) |
| Plano arquitetural aprovado (anterior à implementação) | [`docs/arquitetura/plano-arquitetural.md`](docs/arquitetura/plano-arquitetural.md) |
| Operação: VM, implantação, acesso público, backup, banco manual, problemas | [`docs/operacao/`](docs/operacao) |
| O que foi validado, com evidências | [`docs/VALIDATION_MATRIX.md`](docs/VALIDATION_MATRIX.md) · [`docs/VALIDATION_EVIDENCE.md`](docs/VALIDATION_EVIDENCE.md) |
| Problemas conhecidos | [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md) |
| Design system e produto | [`DESIGN.md`](DESIGN.md) · [`PRODUCT.md`](PRODUCT.md) |
| Banco local: durabilidade e Android | [`apps/lucky-patcher/docs/`](apps/lucky-patcher/docs) |

Cada serviço e o portal têm um `README.md` próprio, com variáveis de ambiente, estrutura e decisões.

## Estado atual

**Validado** — executado no sistema integrado, com evidência registrada:

- Os três serviços, o gateway, o portal e o app rodando juntos — no **Docker Compose local** (o roteiro de 17 passos passou de novo após a troca do k3s pelo Compose).
- O roteiro acadêmico de 17 passos, de ponta a ponta, automatizado.
- Offline-First no navegador: registrar sem rede, fechar e reabrir, voltar a rede, não duplicar; queda no meio da subida; resposta perdida; operação rejeitada.
- Todas as rotas pelo gateway, com a coleção Postman (Newman: 31 requisições, 57 verificações, nenhuma falha).
- Log de acesso com os sete campos do enunciado nos três serviços; 401 sem token em todas as rotas.
- PDF gerado e íntegro; e-mail com anexo entregue ao servidor SMTP de demonstração.
- **App Android:** APK de depuração construído e validado num emulador (Pixel 6, Android 17) — login informando o endereço do servidor, registro offline, processo morto e reaberto com a fila intacta, sincronização sem duplicar, banco nativo cifrado (SQLCipher). Evidência E-008.

**Não validado ou não feito** — dito com clareza:

| Item | Situação |
| --- | --- |
| **VM da Univates** | **No ar** em 2026-11-18 (Docker Compose com `deploy/compose.vm.yaml`, imagens do GHCR). Login real, 401 sem token, 429 no login, IP real do cliente no log de acesso, backup no cron e volta sozinha após reiniciar a VM. ~640 MB de RAM em uso de 1,6 GB. Procedimento: [`docs/operacao/instalacao-vm.md`](docs/operacao/instalacao-vm.md). O roteiro de 17 passos ainda não foi repetido contra a VM. |
| **Acesso público HTTPS** | **No ar:** <https://177-44-248-60.sslip.io/portal/> e `/app/`, certificado Let's Encrypt válido emitido pelo Traefik; HTTP redireciona (301) para HTTPS. |
| **Aparelho Android físico** | Não testado. O APK de depuração foi construído e o app validado num **emulador** (ver acima); falta um aparelho real, um APK assinado para publicação e TLS até o servidor. Ver [`apps/lucky-patcher/docs/nativo.md`](apps/lucky-patcher/docs/nativo.md). |
| **E-mail em caixa externa** | Não testado. O envio é validado contra o Mailpit (SMTP real, de captura); faltam credenciais de um provedor. |
| **Conflito com dois aparelhos reais** | As quatro estratégias são cobertas por testes de integração do servidor, não por dois clientes ao mesmo tempo. |
| **Isolamento de rede e backup/restauração** | Executados uma vez no k3s (NetworkPolicy, CronJob); no Compose, `backup.sh` → `restore.sh --sim` foi executado localmente (contagens iguais, API respondendo sem reiniciar); o isolamento pelas redes Docker está **a validar**. |
| **Navegadores** | Medido só no Chrome para desktop (e no WebView do Android, no emulador). |
| **iOS** | Não é entregue. |

Limites assumidos: o banco local no navegador não é cifrado; não há fusão de pessoas duplicadas (só a sinalização); o app aceita uma aba por vez.
