# MedicalField

## 🚀 Acesse o sistema no ar

| | Endereço |
| --- | --- |
| 🖥️ **Portal administrativo** | **<https://177-44-248-60.sslip.io/portal/>** |
| 📱 **App do profissional** (abre no navegador do computador ou do celular) | **<https://177-44-248-60.sslip.io/app/>** |

**Senha (a mesma para os três usuários): `Demo#MedicalField26`**

| Usuário | Tipo de registro | Registro | UF | Use no |
| --- | --- | --- | --- | --- |
| **Dra. Helena Prado** (ADMIN, vê tudo, inclusive a auditoria) | CRM | **`100001`** | RS | Portal |
| Enf. Caio Brandão (PROFISSIONAL) | COREN | **`200002`** | RS | App ou portal |
| Soc. Lia Moura (PROFISSIONAL) | SOCORRISTA | **`300003`** | (vazio) | App ou portal |

Na tela de login, escolha o **tipo de registro**, digite o **registro**, a **UF** e a **senha**. Os usuários e os dados são fictícios. Um roteiro de teste de 5 minutos está em [Testar agora, remotamente](#testar-agora-remotamente-para-o-professor).

---

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
| App do profissional | **LuckyPatcher** | Atendimento em campo, banco local, simulador de rede | Expo / React Native (Android, iOS e web/PWA) | [`apps/lucky-patcher`](apps/lucky-patcher) |
| Banco central | — | Quatro schemas, um papel por serviço | PostgreSQL 17 | `apps/*/migrations` |
| Banco local | — | SQLite embarcado no app | SQLite WASM em OPFS (web); `expo-sqlite` + SQLCipher (aparelho) | `apps/lucky-patcher/src/banco` |
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

## Testar agora, remotamente (para o professor)

O sistema está **no ar na VM da Univates**. Nada precisa ser instalado: basta um navegador.

| O que ver | Endereço | Observação |
| --- | --- | --- |
| **Portal administrativo** | **<https://177-44-248-60.sslip.io/portal/>** | Pacientes, prontuários, atendimentos, ficha em PDF, envio por e-mail e auditoria |
| **App do profissional** (web/PWA) | **<https://177-44-248-60.sslip.io/app/>** | Abre no navegador do computador ou do celular; tem o seletor **"Simular conectividade"** para testar o modo offline |
| **API** (gateway) | `https://177-44-248-60.sslip.io/api/v1` | Sem token responde `401`. Rotas e corpos em [`docs/api/README.md`](docs/api/README.md); a coleção Postman já funciona trocando `baseUrl` por este endereço |

**Login:** `CRM` `100001` / `RS`, senha `Demo#MedicalField26` (Dra. Helena Prado, **ADMIN**, que enxerga tudo), ou os outros usuários do [topo deste README](#-acesse-o-sistema-no-ar).

**Ver o que está rodando no servidor pelo portal (logado como ADMIN):**

| Menu do portal | O que mostra | De onde vem |
| --- | --- | --- |
| *Auditoria → Logs de acesso* | Cada requisição recebida pelos três serviços, quase em tempo real: data e hora, serviço, profissional, método, rota, status, tempo e IP | tabela `auditoria.log_acesso` |
| *Auditoria → Logs dos aparelhos* | O que o app registrou no aparelho, **inclusive offline**, depois de sincronizado | tabela `auditoria.log_cliente` |
| *Auditoria → Possíveis duplicatas* | Pessoas cadastradas em dois aparelhos que provavelmente são a mesma | `clinico.pessoa` |
| *Atendimentos → abrir um → Gerar PDF* | A ficha gerada pelo serviço Python, com código de verificação e hash | `documentos.documento` |

**Roteiro curto (5 min) para ver o Offline-First:**

1. Abra o **app**, entre como `SOCORRISTA` `300003` e cadastre um paciente fictício.
2. Em *Ajustes*, ligue **Simular conectividade → Offline** e registre sinais vitais e uma medicação. A barra mostra os itens na fila.
3. Volte para **Online**: a fila sobe sozinha, sem duplicar.
4. No **portal** (como ADMIN), o atendimento aparece em *Atendimentos*; em *Logs dos aparelhos*, os registros feitos offline aparecem com "Offline"; em *Logs de acesso*, os `POST` da sincronização.
5. Abra o atendimento, clique em **Gerar PDF** e envie a ficha por e-mail.

**O que não é público** (por segurança, só com acesso SSH à VM, que o professor não precisa ter):

| Recurso | Por quê | Alternativa remota |
| --- | --- | --- |
| Mailpit (caixa que captura os e-mails da ficha) | Mostraria e-mails a qualquer pessoa | No portal, o envio aparece como **ENVIADO**; o conteúdo pode ser visto em uma demonstração ao vivo |
| Banco PostgreSQL | Nunca exposto à internet | As telas de auditoria acima mostram as tabelas de log; as consultas SQL estão em [`docs/operacao/banco-manual.md`](docs/operacao/banco-manual.md) |
| Saúde dos serviços (`/health/*`) e logs dos contêineres | Porta de gestão interna (9090) | Os *Logs de acesso* comprovam que os três serviços estão respondendo |

Com acesso SSH (`univates@177.44.248.60`): `ssh -L 18025:127.0.0.1:18025 univates@177.44.248.60` e <http://localhost:18025> para o Mailpit; `cd /opt/medicalfield/deploy && sudo docker compose ps` e `sudo docker compose logs -f <serviço>` para os contêineres; `sudo docker compose exec postgres psql -U postgres -d medicalfield` para o banco (as tabelas ficam nos schemas `auditoria`, `clinico`, `documentos` e `identidade`, não no `public`).

## Como acessar o sistema

### Na VM da Univates (no ar, sem instalar nada)

| O quê | Endereço | Para quem |
| --- | --- | --- |
| **Portal administrativo** (BradPitt) | <https://177-44-248-60.sslip.io/portal/> | ADMIN e profissionais, no navegador do computador |
| **App do profissional** (LuckyPatcher) na web/PWA | <https://177-44-248-60.sslip.io/app/> | Profissional em campo; abre no navegador do celular ou do computador e pode ser instalado ("Adicionar à tela inicial") |
| **API** (gateway) | `https://177-44-248-60.sslip.io/api/v1` | Postman, `curl`, integrações: ver [`docs/api/README.md`](docs/api/README.md) |
| **Mailpit** (caixa que captura os e-mails da ficha) | `ssh -L 18025:127.0.0.1:18025 univates@177.44.248.60` e abra <http://localhost:18025> | Só por túnel SSH; não é exposto à internet |

O endereço raiz (`https://177-44-248-60.sslip.io/`) redireciona para o portal. HTTP redireciona para HTTPS (certificado Let's Encrypt).

### Entrar

Três profissionais **fictícios** já vêm cadastrados. A senha de demonstração (a mesma para os três) está em [`apps/mike-baguncinha/README.md`](apps/mike-baguncinha/README.md).

| Papel | Nome | Tipo de registro | Registro | UF | Onde usar |
| --- | --- | --- | --- | --- | --- |
| ADMIN | Dra. Helena Prado | CRM | `100001` | RS | Portal (vê também *Auditoria*: logs de acesso, logs dos aparelhos, duplicatas, novo profissional) |
| PROFISSIONAL | Enf. Caio Brandão | COREN | `200002` | RS | App e portal |
| PROFISSIONAL | Soc. Lia Moura | Socorrista | `300003` | (vazio) | App e portal |

Na tela de login escolha o **tipo de registro**, digite o número, a UF (não há UF para socorrista) e a senha. Cinco senhas erradas em 15 minutos bloqueiam aquele registro naquele IP por um tempo.

### No celular

| Forma | Como | Observação |
| --- | --- | --- |
| **Navegador / PWA** (mais simples) | Abra <https://177-44-248-60.sslip.io/app/> e, se quiser, "Adicionar à tela inicial" | Banco local SQLite em OPFS; funciona offline depois do primeiro acesso |
| **Expo Go** (Android e iPhone) | No computador: `npm install` e `npm run tunel -w @medicalfield/lucky-patcher`; no celular, leia o QR com o Expo Go | Já aponta para a VM. No Expo Go o banco local fica **sem cifra** (só dados fictícios). Detalhes em [`apps/lucky-patcher/docs/nativo.md`](apps/lucky-patcher/docs/nativo.md) |
| **App instalado** (APK / iOS) | `npm run android -w @medicalfield/lucky-patcher` (ou `ios`) | Banco nativo cifrado (SQLCipher); exige Android SDK ou Xcode |

O servidor do app pode ser trocado em **Ajustes**. O app registra tudo no aparelho, com ou sem rede, e sincroniza quando a conexão volta. O seletor **"Simular conectividade"** força o modo offline para demonstração; enquanto ele estiver em *Offline*, nenhuma requisição sai do aparelho.

> **Se o que você fez no app não aparece no portal nem nos logs:** nada foi enviado ainda. Confira, no app: (1) o seletor *Simular conectividade* está em *Online*; (2) não há a faixa vermelha **"Sessão expirada"** (se houver, toque em *Entrar de novo*: o que está no aparelho não se perde); (3) a aba **Pendências** mostra o que ainda está na fila e o último erro; (4) em **Ajustes**, o servidor é `https://177-44-248-60.sslip.io`. Depois que a sincronização passa, as chamadas aparecem em *Auditoria → Logs de acesso* e as ações do aparelho em *Auditoria → Logs dos aparelhos*.

### Localmente

Veja [Subir tudo do zero](#subir-tudo-do-zero): no modo Compose o portal fica em <http://127.0.0.1:8088/portal/>, o app em <http://127.0.0.1:8088/app/> e a API em `http://127.0.0.1:8088/api/v1` (no Windows prefira `127.0.0.1` a `localhost`, que pode travar tentando IPv6). O celular **não** alcança o backend local; para Expo Go use a VM.

## Onde estão os PDFs

Todos os PDFs ficam versionados no repositório, dentro de `docs/`:

| PDF | Conteúdo | Fonte |
| --- | --- | --- |
| [`docs/pdf/MedicalField-01-arquitetura.pdf`](docs/pdf/MedicalField-01-arquitetura.pdf) | Arquitetura, rede e comunicação entre as peças | [`docs/pdf/fontes/01-arquitetura.md`](docs/pdf/fontes/01-arquitetura.md) |
| [`docs/pdf/MedicalField-02-apis.pdf`](docs/pdf/MedicalField-02-apis.pdf) | Documentação das APIs (resumo; a referência completa, com todos os corpos, é [`docs/api/README.md`](docs/api/README.md)) | [`docs/pdf/fontes/02-apis.md`](docs/pdf/fontes/02-apis.md) |
| [`docs/pdf/MedicalField-03-banco.pdf`](docs/pdf/MedicalField-03-banco.pdf) | Modelagem do banco central e do banco local | [`docs/pdf/fontes/03-banco.md`](docs/pdf/fontes/03-banco.md) |
| [`docs/pdf/MedicalField-04-roteiro.pdf`](docs/pdf/MedicalField-04-roteiro.pdf) | Roteiro de testes: os 17 passos do enunciado | [`docs/pdf/fontes/04-roteiro.md`](docs/pdf/fontes/04-roteiro.md) |
| [`docs/pdf/MedicalField-05-sincronizacao.pdf`](docs/pdf/MedicalField-05-sincronizacao.pdf) | Sincronização offline/online, outbox e conflitos | [`docs/pdf/fontes/05-sincronizacao.md`](docs/pdf/fontes/05-sincronizacao.md) |
| [`docs/pdf/MedicalField-06-patterns.pdf`](docs/pdf/MedicalField-06-patterns.pdf) | Os padrões de projeto usados e onde estão no código | [`docs/pdf/fontes/06-patterns.md`](docs/pdf/fontes/06-patterns.md) |
| [`docs/apresentacao/MedicalField-guia-completo.pdf`](docs/apresentacao/MedicalField-guia-completo.pdf) | Guia visual completo da apresentação, com as telas | [`docs/apresentacao/guia-visual/guia.html`](docs/apresentacao/guia-visual/guia.html) |
| [`docs/testes/evidencias/roteiro/ficha-do-roteiro.pdf`](docs/testes/evidencias/roteiro/ficha-do-roteiro.pdf) | Exemplo real de ficha de atendimento gerada pelo Jaiminho no roteiro | gerado pelo sistema |
| [`docs/enunciado-final_project_as_2026b.pdf`](docs/enunciado-final_project_as_2026b.pdf) | Enunciado do trabalho | — |

Os diagramas usados nos PDFs estão em [`docs/pdf/fontes/diagramas/`](docs/pdf/fontes/diagramas). Para **regerar** os PDFs depois de editar uma fonte (precisa de rede para o `marked` e do Chrome do Playwright):

```bash
node scripts/gerar-pdfs-docs.mjs        # todos
node scripts/gerar-pdfs-docs.mjs 02     # só o 02-apis
```

A ficha de um atendimento qualquer sai pelo portal (*Atendimentos → abrir um → Gerar PDF*) ou pela API (`POST /api/v1/documento/ficha-atendimento` e `GET /api/v1/documento/{id}/pdf`).

## Pré-requisitos

| Ferramenta | Para quê |
| --- | --- |
| **Docker** em execução, com Compose v2 | Postgres, os três serviços, o portal, o app e o gateway rodam em contêiner |
| **Node.js 22 ou mais novo** + npm | Front-ends, pacotes, DonaCida, testes (usado: Node 24) |
| **Git Bash** (no Windows) | Os scripts são `bash` |
| **Google Chrome** | Testes de ponta a ponta (Playwright usa o Chrome instalado) |

**Go e Python não precisam estar instalados**: o serviço Go compila e testa em contêiner, e o Python depende de bibliotecas (Pango) que não rodam nativamente no Windows.

Nos comandos abaixo a senha de demonstração ([`apps/mike-baguncinha/README.md`](apps/mike-baguncinha/README.md)) entra pela variável `MF_SENHA_DEMO`; não a grave em arquivo. Os usuários estão em [Entrar](#entrar).

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

31 requisições, cobrindo 30 das 31 rotas pelo gateway. Detalhes em [`docs/api/README.md`](docs/api/README.md).

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
| Arquitetura, diagramas, tecnologias | [`docs/arquitetura/arquitetura.md`](docs/arquitetura/arquitetura.md) |
| Padrões de projeto | [`docs/arquitetura/patterns.md`](docs/arquitetura/patterns.md) |
| PDFs da documentação | [`docs/pdf/`](docs/pdf) (ver [Onde estão os PDFs](#onde-estão-os-pdfs)) |
| Sincronização Offline-First (outbox, cursor, idempotência, conflitos) | [`docs/arquitetura/sincronizacao.md`](docs/arquitetura/sincronizacao.md) |
| Segurança, auditoria e LGPD | [`docs/arquitetura/seguranca.md`](docs/arquitetura/seguranca.md) |
| **Todas as rotas, com corpos de requisição e resposta**, OpenAPI, coleção Postman | [`docs/api/README.md`](docs/api/README.md) |
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
- **App Android (versão Capacitor, anterior ao Expo):** APK de depuração validado num emulador (Pixel 6, Android 17) — registro offline, processo morto e reaberto com a fila intacta, sincronização sem duplicar, banco nativo cifrado. Evidência E-008. A versão Expo atual roda no emulador e no Expo Go, mas ainda sem roteiro automatizado no aparelho.

**Não validado ou não feito** — dito com clareza:

| Item | Situação |
| --- | --- |
| **VM da Univates** | **No ar** em 2026-11-18 (Docker Compose com `deploy/compose.vm.yaml`, imagens do GHCR). Login real, 401 sem token, 429 no login, IP real do cliente no log de acesso, backup no cron e volta sozinha após reiniciar a VM. ~640 MB de RAM em uso de 1,6 GB. Procedimento: [`docs/operacao/instalacao-vm.md`](docs/operacao/instalacao-vm.md). O roteiro automatizado de 17 passos passou contra a VM (17 de 17). |
| **Acesso público HTTPS** | **No ar:** <https://177-44-248-60.sslip.io/portal/> e `/app/`, certificado Let's Encrypt válido emitido pelo Traefik; HTTP redireciona (301) para HTTPS. |
| **Aparelho Android físico** | Não testado. O APK de depuração foi construído e o app validado num **emulador** (ver acima); falta um aparelho real, um APK assinado para publicação e TLS até o servidor. Ver [`apps/lucky-patcher/docs/nativo.md`](apps/lucky-patcher/docs/nativo.md). |
| **E-mail em caixa externa** | Não testado. O envio é validado contra o Mailpit (SMTP real, de captura); faltam credenciais de um provedor. |
| **Conflito com dois aparelhos reais** | As quatro estratégias são cobertas por testes de integração do servidor, não por dois clientes ao mesmo tempo. |
| **Isolamento de rede e backup/restauração** | Executados uma vez no k3s (NetworkPolicy, CronJob); no Compose, `backup.sh` → `restore.sh --sim` foi executado localmente (contagens iguais, API respondendo sem reiniciar); o isolamento pelas redes Docker está **a validar**. |
| **Navegadores** | Medido só no Chrome para desktop (e no WebView do Android, no emulador). |
| **iOS** | Não é entregue. |

Limites assumidos: o banco local no navegador não é cifrado; não há fusão de pessoas duplicadas (só a sinalização); o app aceita uma aba por vez.
