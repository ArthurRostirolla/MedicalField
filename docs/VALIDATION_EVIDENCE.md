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
