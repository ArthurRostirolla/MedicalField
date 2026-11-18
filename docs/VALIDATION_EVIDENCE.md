# Evidências de validação

Cada entrada: o que foi executado, o comando ou a ação, o resultado observado e a data. Só entra aqui o que foi **realmente executado** pelo agente principal ou conferido por ele.

## E-001 — Cursor de sincronização em inserção manual (base do passo 9)

- **Data:** 2026-11-17
- **Executado:** `bash scripts/dev-db.sh subir && bash scripts/dev-db.sh migrar`, depois `INSERT INTO clinico.medicamento (nome) VALUES ('TESTE CURSOR') RETURNING seq;` como administrador, sem informar `id` nem `seq`.
- **Esperado:** as três migrações aplicam; a linha recebe `id` e `seq` automaticamente.
- **Observado:** três migrações aplicadas (`identidade_e_auditoria`, `clinico`, `documentos`); `RETURNING seq` devolveu `1`; 13 tabelas criadas nos schemas `identidade`, `auditoria`, `clinico`, `documentos`.
- **Resultado:** passou. Cobre apenas o banco; a chegada ao cliente (passo 11) ainda não foi validada.

## E-002 — Três serviços integrados, com token real (BE-01, BE-03, BE-05, BE-07, BE-09, BE-10)

- **Data:** 2026-11-17
- **Executado:** `bash scripts/dev-servicos.sh subir --construir` (constrói as três imagens e sobe Mike 8081, Cida 8082, Jaiminho 8083 com raiz somente leitura), depois, por `curl`: login do Enf. Caio (COREN) no Mike; com o token, `GET /medicamento` e `GET /sync/alteracoes?desde=0` na Cida; `POST /atendimento` duas vezes com a mesma `Idempotency-Key`; `POST /documento/ficha-atendimento`, download e `POST /documento/{id}/email` no Jaiminho.
- **Observado:**
  - Os três `health/ready` responderam 200.
  - Token EdDSA emitido pelo Mike foi aceito pela Cida e pelo Jaiminho (validação pela chave pública na porta de gestão).
  - `GET /medicamento` sem token → 401; com token → 200.
  - `/sync/alteracoes?desde=0` → 12 medicamentos, 3 pessoas, 3 prontuários, 6 itens, `proximoCursor` 25, `temMais` falso.
  - `POST /atendimento` → 201 na primeira, **200 na repetição**; no banco, 1 linha em `clinico.atendimento` e 2 eventos.
  - Ficha → 201; download → 200 `application/pdf`, 29.165 bytes, começa com `%PDF-`.
  - E-mail → 202; 8 s depois `ENVIADO` com 1 tentativa; a API do Mailpit mostrou a mensagem para `familiar@exemplo.test` com 1 anexo.
  - `auditoria.log_acesso` recebeu linhas dos serviços com método, rota em formato de padrão, status, IP e profissional (nulo no 401).
- **Resultado:** passou. Ainda sem gateway e sem front-end; o e-mail foi para o Mailpit (SMTP real de captura), não para uma caixa externa.

## E-003 — Testes automatizados dos serviços (reexecutados pelo agente principal)

- **Data:** 2026-11-17
- **MikeBaguncinha (Go, em contêiner `golang:1.27`):** `go vet` limpo; `go test ./...` → `ok` em `aplicacao`, `http` (integração contra Postgres real) e `infra`.
- **Contratos / domínio / DonaCida:** 13 + 8 + 41 testes passaram (22 de integração contra Postgres real); `tsc --noEmit` sem erros.
- **Jaiminho:** 40 testes relatados pelo agente (Ruff limpo); **ainda não reexecutados pelo agente principal** — o fluxo real da E-002 é a verificação independente até aqui.

## E-004 — Backend no k3s local, pelo gateway (K8-01 parcial, K8-02 parcial, K8-03, K8-05, K8-06, K8-09 parcial, BE-03, BE-06)

- **Data:** 2026-11-17
- **Executado:** `deploy/scripts/cluster-local.sh subir`, `construir-imagens mike-baguncinha dona-cida jaiminho migracoes`, `implantar`; depois `curl` em `http://localhost:8088` (Traefik "freeway").
- **Observado:**
  - Pods `postgres-0`, `mike-baguncinha`, `dona-cida`, `jaiminho`, `mailpit` em `1/1 Running`; migrações aplicadas pelos initContainers. **`web` em `ErrImagePull`: a imagem ainda não existe (front-ends em construção).**
  - Login pelo gateway devolveu token; 8 rotas testadas (`auth/me`, `medicamento`, `prontuario`, `atendimento`, `pessoa`, `sync/alteracoes`, `auditoria/acesso`, `documento`) → **200 com token, 401 sem token**, em todas.
  - `POST /atendimento` → 201; ficha → PDF de 27.071 bytes; e-mail → 202 e depois `ENVIADO` (Mailpit do cluster).
  - `auditoria.log_acesso`: linhas dos três serviços. As chamadas externas registram `172.30.77.1` (o par real visto pelo nó, que é o gateway da rede Docker); a chamada interna Jaiminho → DonaCida registra o IP do pod (`10.42.0.23`).
  - `kubectl delete pod postgres-0` e do pod da DonaCida → voltaram sozinhos; a ficha criada antes continuou acessível (`GET /ficha/{id}` com o mesmo id e o evento).
  - `kubectl top`: Jaiminho 85 Mi, Mike 42 Mi, Mailpit 10 Mi (Cida e Postgres tinham acabado de reiniciar e ainda não apareciam).
- **Defeito encontrado e corrigido:** o cluster local não voltava depois de `parar` (o Docker trocava o IP do contêiner e o k3s falhava com "failed to find interface with specified node ip"). Corrigido com rede própria e IP fixo em `cluster-local.sh`; conferido com `parar` + `subir`.
- **Resultado:** passou para o backend. Falta a imagem `web` e o roteiro de 17 passos contra o cluster.

## E-005 — Portal BradPitt contra o backend real (passos 1–4, 16, 17; FE-02, FE-04, FE-05)

- **Data:** 2026-11-18
- **Executado pelo agente principal:** `npm run typecheck`, `npm test`, `npm run build` e `npm run e2e` do workspace `@medicalfield/brad-pitt` (Playwright no Chrome, Vite com proxy para Mike 8081, Cida 8082 e Jaiminho 8083).
- **Observado:** typecheck sem erros; 40 testes de unidade/componente passaram; build de produção gerado; **Playwright: 12 passaram em 1,4 min**, depois da correção dos dois defeitos de `packages/ui` (D-02, D-03).
  - Login de ADMIN e permanência após recarregar; login inválido recusado.
  - Listas de medicamentos, prontuários e atendimentos carregam do backend.
  - Atendimento aberto por teclado → "Gerar PDF" → arquivo baixado começa com `%PDF` → "Enviar por e-mail" → mensagem com anexo `application/pdf` confirmada na API do Mailpit.
  - Verificação de documento (destino do QR) volta à mesma URL depois do login.
  - PROFISSIONAL não vê auditoria e a API responde 403.
  - 41 capturas (1440 e 390 px, claro e escuro) sem violação de axe WCAG A/AA nem rolagem horizontal da página.
- **Inspeção visual do agente principal:** `atendimento-1440-claro.png` e `login-390-escuro.png` conferidas — passagem de caso em via rosa, linha do tempo numerada com retificação, bloco de PDF e envios, identidade coerente com o design system.
- **Impeccable:** registro real em `apps/brad-pitt/IMPECCABLE.md` (contexto, detector sem achados, uma rodada de crítica/auditoria/polimento sobre as telas renderizadas; a crítica rodou em contexto único, sem os dois subagentes isolados que a skill prevê).
- **Não coberto:** 429 no navegador (travaria os logins de demonstração por 15 min), reenvio após falha definitiva e paginação com várias páginas — os três só em teste de componente.

## E-006 — App LuckyPatcher contra o backend real (OF-01..OF-11, OF-15; FE-03, FE-04)

- **Data:** 2026-11-18
- **Executado pelo agente principal:** `npm run typecheck`, `npm test`, `npm run build` e `npm run e2e` do workspace `@medicalfield/lucky-patcher` (Playwright no Chrome, 390×844, contra Mike/Cida/Jaiminho reais, conferindo o banco central por SQL).
- **Observado:** typecheck sem erros; 25 testes do motor de sincronização passaram; build com 22 entradas no precache do PWA; **Playwright: 10 passaram em 3,1 min** (o agente relatou duas execuções anteriores, também 10/10).
  1. Login + sincronização: contagem local de medicamentos e pessoas igual à central.
  2. Online: atendimento com 4 eventos conferido no banco central.
  3. `INSERT` de medicamento por SQL → sincronizar → aparece e é usado no app.
  4. **Offline pelo seletor:** 7 comandos locais, **zero requisições `/api`** (inclusive após recarregar e 6 s de espera), nada na central; ao voltar, sobe em ordem; sincronizar mais duas vezes não duplica.
  5. **Offline real** (`context.setOffline`) sobre o build de produção: abre pela casca do PWA, registra, recarrega e sincroniza ao voltar.
  6. Subida abortada da 2ª requisição em diante: 1 confirmada, 4 pendentes; depois resposta perdida do `POST /atendimento`; o reenvio conclui com 1 linha de cada.
  7. 422 forçado: Pendências mostra o motivo, dependentes ficam retidos, independente sobe, "Tentar de novo" destrava.
  8. Logs offline chegam a `auditoria.log_cliente`; resposta perdida de `POST /log` e reenvio sem duplicar.
- **Durabilidade do banco local** (medida pelo agente, `apps/lucky-patcher/docs/durabilidade.md`): gravar 200 linhas e matar o processo do Chrome — SQLite WASM em OPFS 5/5 duráveis; `jeep-sqlite` 0/5. Por isso o plano foi ajustado: o navegador usa SQLite WASM oficial em OPFS. **Não reexecutado pelo agente principal.**
- **Inspeção visual do agente principal:** `atendimento-offline-390-claro.png` e `pendencias-390-claro.png`.
- **Impeccable:** registro real em `apps/lucky-patcher/IMPECCABLE.md` (crítica com dois subagentes isolados, 27/40 em Nielsen antes das correções; 8 correções aplicadas; sem segunda rodada de crítica).
- **Limite:** o 422 do cenário 7 é injetado por interceptação; a validação do cliente impede o envio de corpo inválido ao servidor real.

## E-007 — Roteiro acadêmico de 17 passos contra o k3s local (passos 1–17; K8-02, K8-03, K8-04, K8-09)

- **Data:** 2026-11-18
- **Executado pelo agente principal:** `deploy/scripts/cluster-local.sh construir-imagens` (as 5 imagens) e `implantar`; depois `npm run roteiro -w @medicalfield/e2e`, que abre o portal (1440 px) e o cliente (390 px) em dois contextos de navegador contra `http://localhost:8088` (gateway Traefik), executa o passo 9 por `kubectl exec postgres-0 -- psql` e confere o e-mail na API do Mailpit do cluster.
- **Observado:** os 6 pods (`postgres-0`, `mike-baguncinha`, `dona-cida`, `jaiminho`, `web`, `mailpit`) em `1/1 Running`; `/portal/` e `/app/` servidos pelo `web`; **17 de 17 passos concluídos, em duas execuções seguidas (cerca de 17 s cada)**. O observado de cada passo e as 17 capturas estão em [`testes/evidencias/roteiro/`](testes/evidencias/roteiro/resultado.md); o PDF baixado no passo 16 é `ficha-do-roteiro.pdf`.
  - Passo 9: `INSERT` direto criou o medicamento com `seq` atribuído pelo trigger; passo 11: ele chegou ao banco local do cliente; passo 12: foi usado offline.
  - Passo 12: 7 operações na fila após recarregar o app, nenhuma requisição `/api`; passo 13: 0 linhas no banco central.
  - Passo 14: após a volta da rede e mais duas sincronizações — 1 pessoa, 1 prontuário, 1 item, 1 atendimento, 4 eventos.
  - Passo 17: situação "Enviado" no portal e mensagem com anexo `application/pdf` no Mailpit.
- **Consumo (`kubectl top`):** Jaiminho 96 Mi, Mike 65 Mi, Cida 44 Mi, Postgres 29 Mi, Mailpit 16 Mi, web 13 Mi — cerca de 263 Mi de aplicação.
- **Limites:** cluster local em Docker, não a VM da Univates; e-mail no Mailpit, não em caixa externa.

## E-008 — App Android: APK construído e validado em emulador (FE-06; OF-02, OF-03, OF-05, OF-07 no nativo)

- **Data:** 2026-11-18
- **Executado pelo agente principal:** `npm run build:android` + `gradlew assembleDebug` (JDK do Android Studio); `adb install` no emulador `Pixel_6` (Android 17, WebView 145), iniciado sem janela; depois `node e2e/android/android.mjs`, que dirige o WebView do app por depuração remota e confere o banco central do cluster por `kubectl exec`. O app alcança o gateway do k3s local em `http://10.0.2.2:8088`.
- **Observado (3 execuções, 5 de 5 verificações em cada):**
  1. Login com endereço do servidor informado e descida inicial: 14 medicamentos no SQLite nativo, igual à central.
  2. Offline pelo seletor: pessoa + prontuário com alergia + atendimento + sinais vitais → 4 operações na fila, 0 linhas na central.
  3. **Processo do app morto (`am force-stop`) e reaberto:** fila intacta (4), pessoa presente, seletor continua em Offline, sessão mantida sem novo login, nada sincronizado.
  4. Volta da rede: 1 pessoa, 1 atendimento, 1 evento e 1 alergia na central; sincronizar de novo não duplicou.
  5. O banco é o arquivo nativo `databases/medicalfieldSQLite.db`, **cifrado** (sem o cabeçalho "SQLite format 3" em claro).
- **Defeitos encontrados e corrigidos:**
  - D-09: o Gradle falhava com "Unable to establish loopback connection" — o Java não abre o soquete local numa pasta temporária de caminho longo. Resolvido apontando `TEMP`/`TMP` e `-Djdk.net.unixdomain.tmpdir` para uma pasta curta (documentado em `apps/lucky-patcher/docs/nativo.md`).
  - D-10: o topo fixo do app ficava por baixo da barra de status do Android. Corrigido em `packages/ui` (`.mf-app__topo` com `padding-top: env(safe-area-inset-top)`); conferido na captura `docs/testes/evidencias/android/03-reaberto-com-pendencias.png`.
- **Evidências:** `docs/testes/evidencias/android/` (4 capturas do emulador + `resultado.md`).
- **Limites:** emulador, não aparelho físico; APK de depuração (não assinado para publicação); tráfego HTTP sem TLS até o gateway local.

## E-009 — QA independente no k3s local (OF-12..OF-14, BE-04, BE-06, BE-10, K8-05..K8-08)

- **Data:** 2026-11-18
- **Executado por:** agente de QA, sem acesso de escrita ao código. Relatório completo em [`testes/relatorio-qa.md`](testes/relatorio-qa.md), defeitos em [`testes/defeitos-qa.md`](testes/defeitos-qa.md), saídas em `testes/evidencias/qa/`, scripts reexecutáveis em `e2e/qa/`.
- **Resultado:** 41 casos executados, 34 passaram, 7 falharam (viraram 21 defeitos: 3 de severidade Alta, nenhum Crítico); 9 não executados. Nenhuma perda nem duplicação de dado clínico em nenhum teste.
- **Destaques do que passou:**
  - Dois dispositivos offline: duas alergias novas ficaram ambas na central; dois prontuários locais viraram um; mesmo CPF aceito nos dois cadastros e sinalizado em "Possíveis duplicatas"; `PATCH /pessoa` com vitória por campo, valor anterior auditado e relógio adiantado limitado.
  - 29 rotas → 401 sem token; 6 tipos de token forjado e um token realmente expirado recusados nos três serviços; PROFISSIONAL em `/auditoria/*` → 403; porta de gestão inalcançável pelo gateway; `X-Forwarded-For` forjado ignorado.
  - 1.315 linhas de log dos pods e a tabela `log_acesso` sem senha, token nem dado de paciente.
  - 36 tentativas de `UPDATE`/`DELETE`/`TRUNCATE`/`DROP` nas tabelas de trilha negadas aos papéis dos serviços.
  - Pod da DonaCida morto no meio da subida, Postgres em 0 réplicas, Jaiminho fora, `rollout restart` de tudo: recuperação sem intervenção e contagens idênticas.
  - NetworkPolicies: 20 de 20 acessos indevidos bloqueados. Backup e restauração com contagens, permissões e trigger preservados.
  - E-mail com o SMTP fora: tentativas 1 e 2 com `ultimo_erro` sem dado de paciente; `ENVIADO` sozinho na 3ª, com o anexo.

## E-010 — Regressão completa depois das correções do QA

- **Data:** 2026-11-18
- **Executado pelo agente principal**, com o cluster **destruído e recriado do zero** (`cluster-local.sh derrubar` → `subir` → `construir-imagens` → `implantar`) a partir do código corrigido:
  - Banco novo com `DADOS_DEMO=on`: `show medicalfield.dados_demo` → `on`; 3 profissionais e 12 medicamentos carregados pelas migrações condicionais.
  - **Roteiro de 17 passos: 17 de 17** (17,6 s).
  - Scripts do QA: `seguranca-1-autenticacao.sh` 76/76, `seguranca-2-entradas.sh` 98/99, `auditoria.sh` 62/62. A única falha é `?desde=1;select` lido como `desde=1` (sem efeito; aceito).
  - Conflitos com dois dispositivos (`conflitos.qa.ts`): 2 de 2.
  - Coleção Postman com Newman: 31 requisições, 57 verificações, 0 falhas.
  - **D-QA-01 retestado:** 32 logins simultâneos direto no pod → 32× 401, nenhum reinício (os 3 reinícios que todos os pods mostram vêm das três recriações do contêiner do cluster feitas durante o diagnóstico da porta).
  - **D-QA-04 retestado:** 20 logins inválidos em sequência → 5× 401 e depois só 429.
  - **D-QA-15 retestado:** Jaiminho em 0 réplicas → `503 application/json` com `{"codigo":"SERVICO_INDISPONIVEL",...}`.
  - App Android: APK de depuração reconstruído do código corrigido (o pacote instalado não tem mais `ALLOW_BACKUP`; o bundle no APK é o atual) → 5 de 5 no emulador.
  - Ambiente de desenvolvimento com as imagens corrigidas: e2e do app 14 de 14 (inclui 12 observações rápidas → 12 gravadas, e `window.__mf` ausente no build de produção); e2e do portal 12 de 12.
  - Suítes de unidade/integração: Mike `ok` nos 3 pacotes; contratos 16, domínio 9, DonaCida 47; Jaiminho 57; app 34; design system 114; portal 40.
- **Defeito de ambiente encontrado (D-12):** nesta máquina, `http://localhost:8088` deixou de responder por IPv6 (`::1`) — um repasse do WSL/Docker Desktop ficou preso na porta depois que o cluster foi recriado; `http://127.0.0.1:8088` responde normalmente. A regressão usou `MF_BASE=http://127.0.0.1:8088`. Não é defeito do sistema; ver `docs/operacao/troubleshooting.md`.
- **Ajuste de teste:** dois testes do portal dependiam de o atendimento de demonstração estar na primeira página da lista; com o banco de desenvolvimento cheio de dados de teste, falharam. Foram tornados independentes do volume.
