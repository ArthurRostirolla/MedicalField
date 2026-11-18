# Defeitos encontrados pelo QA independente

Data: 2026-11-18 · Alvo: sistema implantado no k3s local (`http://localhost:8088`), `AMBIENTE=producao` · Relatório dos testes: [relatorio-qa.md](relatorio-qa.md) · Scripts: [`e2e/qa/`](../../e2e/qa/README.md)

Severidade: `Crítica` (perde dado ou impede o roteiro) · `Alta` (requisito de segurança/disponibilidade falha) · `Média` · `Baixa`.

Nenhum defeito **Crítico**: em nenhum teste houve perda ou duplicação de dado clínico, e o roteiro de 17 passos passou no fim.

| ID | Sev. | Componente | Resumo | Como foi encontrado |
| --- | --- | --- | --- | --- |
| D-QA-01 | Alta | MikeBaguncinha | 8 logins simultâneos, sem autenticação, matam o pod por falta de memória (`OOMKilled`) | Executado |
| D-QA-02 | Alta | LuckyPatcher | `window.__mf` vai no build de produção: SQL arbitrário (leitura **e escrita**) no banco local, que guarda access e refresh token | Executado |
| D-QA-03 | Alta | Migrações do Mike | Conta `ADMIN` de demonstração com senha publicada no README é criada em qualquer ambiente, inclusive `producao` | Executado (login) + leitura |
| D-QA-04 | Média | Gateway (Traefik) | Limite de taxa do login no gateway funciona ou não conforme a ordem em que o Traefik monta as rotas | Executado |
| D-QA-05 | Média | Sync / restauração | Depois de `restore.sh`, o cursor reutiliza números: dispositivo já sincronizado não recebe o que for criado depois | Executado |
| D-QA-06 | Média | DonaCida | Cursor de paginação forjado → HTTP 500 em 4 rotas, com o valor enviado indo para o log | Executado |
| D-QA-07 | Média | DonaCida + contratos | Texto com `\u0000` → HTTP 500 em vez de 422; no app, viraria operação reenviada para sempre | Executado |
| D-QA-08 | Média | Jaiminho | Sem limite de tamanho de corpo: 20 MB são lidos inteiros antes de responder | Executado |
| D-QA-09 | Média | MikeBaguncinha | Reuso de refresh token já rotacionado não revoga a sessão nova (sem detecção de roubo) | Executado |
| D-QA-10 | Média | Gateway / deploy | Manifestos sem TLS nem redirecionamento para HTTPS | Leitura |
| D-QA-11 | Média | LuckyPatcher (Android) | `allowBackup="true"` e tráfego em claro liberados no manifesto | Leitura |
| D-QA-12 | Média | MikeBaguncinha | Limitador de login: chave sem teto de tamanho e sem limite por conta | Leitura |
| D-QA-13 | Média | Jaiminho | Dependências Python sem versão travada nem hash | Leitura |
| D-QA-14 | Baixa | MikeBaguncinha | `POST /auth/login` com corpo grande e `Expect: 100-continue` fica sem resposta até o cliente desistir | Executado |
| D-QA-15 | Baixa | Gateway | Serviço sem pod → `503 no available server` em texto puro, fora do corpo de erro do contrato | Executado |
| D-QA-16 | Baixa | LuckyPatcher | Texto digitado enquanto o registro anterior está sendo gravado é apagado | Executado |
| D-QA-17 | Baixa | DonaCida | `Idempotency-Key` de um profissional repetida por outro devolve a resposta do primeiro | Executado |
| D-QA-18 | Baixa | Três serviços | Rota desconhecida aparece no log de acesso com quatro nomes diferentes | Executado |
| D-QA-19 | Baixa | e2e | Saída do Playwright versionada e com rastro ligado: uma falha grava a senha digitada num `.zip` dentro do repositório | Executado |
| D-QA-20 | Baixa | e2e | `npm run roteiro` executa qualquer `*.spec.ts` criado sob `e2e/` | Executado |
| D-QA-21 | Baixa | Vários | Itens menores da revisão de código (lista no fim) | Leitura |

---

## D-QA-01 — Logins simultâneos derrubam o MikeBaguncinha (Alta)

- **Componente:** `services/mike-baguncinha/internal/infra/senha.go:15` (Argon2id com 19 MiB por verificação), `internal/aplicacao/autenticacao.go:64` (sem limite de concorrência), `deploy/base/mike-baguncinha/deployment.yaml:110` (`memory: 96Mi`).
- **Reproduzir** (não precisa de credencial; derruba a autenticação do cluster por cerca de 30 s):

```bash
for i in $(seq 1 8); do
  curl -s -o /dev/null -w '%{http_code} ' -X POST http://localhost:8088/api/v1/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"tipoRegistro\":\"CRM\",\"registro\":\"X$i-$RANDOM\",\"uf\":\"RS\",\"senha\":\"x\"}" &
done; wait
kubectl -n medicalfield get pod -l app.kubernetes.io/name=mike-baguncinha \
  -o jsonpath='{.items[0].status.containerStatuses[0].lastState.terminated.reason}'
```

- **Esperado:** oito respostas 401 (ou parte 429); o pod continua de pé.
- **Observado** (`evidencias/qa/seguranca-4-login-concorrente.txt`): com 4 em paralelo, 4× 401. Com 8, **8× 502** e `reinicios=1 ultimoTermino=OOMKilled`. Com 16 logo depois, 502 e 429; com 32, **32× 503** e pod `pronto=false` (chegou a `CrashLoopBackOff`). Dois `OOMKilled` em menos de um minuto.
- **Consequências:** ninguém entra nem renova token enquanto o pod reinicia (o app segue registrando offline, o portal para); o contador de tentativas de login fica em memória e **zera a cada queda**, então o ataque também anula o bloqueio do T-02.
- **Correção sugerida:** semáforo em torno de `Senhas.Verificar` (2 verificações simultâneas; as demais esperam ou recebem 429) e limite de memória com folga para esse teto (por exemplo 128 Mi).

## D-QA-02 — `window.__mf` no build de produção (Alta)

- **Componente:** `apps/lucky-patcher/src/main.tsx:45-46` (definido sem condição); `apps/lucky-patcher/src/banco/executorOo1.ts:11-16` (`consultar` chama `exec`, que aceita qualquer comando).
- **Reproduzir:** abrir `http://localhost:8088/app/`, entrar e, no console do navegador:

```js
await __mf.consultar("SELECT valor FROM sync_estado WHERE chave='sessao'", [])   // access + refresh token
await __mf.consultar("CREATE TABLE x(a); INSERT INTO x VALUES (42)", [])          // escreve
```

  Ou `cd e2e && npx playwright test -c qa/playwright.config.ts seguranca-app` (o teste QA-16 falha de propósito enquanto o defeito existir).
- **Esperado:** `window.__mf` indefinido fora de desenvolvimento/teste; se existir, somente leitura (é o que o comentário do código afirma).
- **Observado** (`evidencias/qa/seguranca-app.txt`): `tipo=object chaves=consultar`; a consulta devolveu a sessão com os campos `profissional, accessToken, expiraEmMs, refreshToken, precisaLogin` (JWT e refresh token presentes); `CREATE TABLE + INSERT` devolveu `ok: true` e o `SELECT` seguinte leu `[{"x":42}]`.
- **Impacto:** qualquer script que rode na origem (extensão do navegador, XSS futuro) lê tokens e dados de pacientes com uma linha, e pode alterar o outbox. A CSP atual (`script-src 'self'`) reduz a chance de XSS, mas não cobre extensões nem o console de um aparelho compartilhado.
- **Correção sugerida:** `if (import.meta.env.DEV || import.meta.env.MODE === 'e2e')` em volta da atribuição, e os testes de ponta a ponta rodando com esse modo; abrir a conexão do gancho como somente leitura.

## D-QA-03 — Conta ADMIN de demonstração em produção (Alta)

- **Componente:** `services/mike-baguncinha/migrations/20261117000150_profissionais_demo.sql:7-14`; senha em texto no `services/mike-baguncinha/README.md:11`; a migração roda no initContainer de todo ambiente (`deploy/base/mike-baguncinha/deployment.yaml:35-44`), inclusive o overlay `univates`.
- **Reproduzir:** no cluster (`"producao":true` no log de partida do Mike), `POST /api/v1/auth/login` com CRM 100001/RS e a senha do README → 200, papel `ADMIN`, acesso a `/auditoria/*` e a todos os prontuários.
- **Esperado:** em `producao`, nenhuma credencial conhecida publicamente.
- **Observado:** todos os testes deste relatório usaram essa conta contra o cluster em modo `producao`.
- **Nota:** aceitável enquanto todos os dados forem fictícios (é o caso declarado); passa a ser grave no momento em que o sistema ficar acessível pela internet (seção L do plano) com qualquer dado real.
- **Correção sugerida:** tirar a carga de demonstração das migrações (um `seed` aplicado só pelo overlay `local`), ou gerar a senha na instalação a partir do Secret.

## D-QA-04 — Limite de taxa do login no gateway não é determinístico (Média)

- **Componente:** `deploy/base/gateway/ingress.yaml:38-52` (Ingress `freeway-login`) e `:20`.
- **Causa provável:** o Traefik ordena as rotas pelo tamanho da regra. ``Path(`/api/v1/auth/login`)`` e ``PathPrefix(`/api/v1/auth`)`` têm os mesmos 26 caracteres, logo a mesma prioridade; o comentário do manifesto ("caminho exato tem prioridade") não vale. Quem vence o empate muda quando o Traefik reconstrói a configuração. Não consegui ler a tabela de rotas (a API do Traefik responde 404), por isso "provável".
- **Reproduzir:** `for i in $(seq 1 20); do curl -s -o /dev/null -w '%{http_code} ' -X POST http://localhost:8088/api/v1/auth/login -H 'Content-Type: application/json' -d '{"a":'; done`
- **Esperado:** a partir da 11ª, `429` do Traefik.
- **Observado** (`evidencias/qa/seguranca-3-expiracao-limite-logs.txt` e `seguranca-5-limite-gateway.txt`): às 03:17Z, 23 logins em poucos segundos e depois 16 → **nenhum 429** do gateway. Às 03:21Z, depois que o pod do Mike reiniciou (D-QA-01), a mesma sequência → 10× 422 e depois só `429 Too Many Requests`.
- **Impacto:** a segunda barreira contra força bruta (e contra o D-QA-01) pode estar desligada sem ninguém perceber.
- **Correção sugerida:** anotação `traefik.ingress.kubernetes.io/router.priority: "100"` no Ingress `freeway-login`.

## D-QA-05 — Cursor de sincronização regride depois de uma restauração (Média)

- **Componente:** trigger/sequence de `seq` (migração `clinico`), `GET /api/v1/sync/alteracoes`, `deploy/scripts/restore.sh`, `docs/operacao/backup-e-recuperacao.md`.
- **Reproduzir** (`evidencias/qa/infra-cursor-pos-restauracao.txt`): `backup.sh` → um dispositivo sincroniza (cursor 107) → `INSERT` de um medicamento M1 (seq 108) → o dispositivo sincroniza (cursor 108) → `restore.sh --sim` → `INSERT` de M2.
- **Esperado:** o dispositivo recebe M2 na próxima sincronização.
- **Observado:** M2 recebeu **seq 108** (número reutilizado); `GET /sync/alteracoes?desde=108` devolveu lista vazia. Só `desde=0` traz M2. O dispositivo também fica com M1, que não existe mais na central.
- **Impacto:** depois de uma recuperação, aparelhos em campo deixam de receber cadastros (medicamentos, pessoas, alergias de outros dispositivos) até serem reinstalados — e nada avisa.
- **Correção sugerida:** ao fim do `restore.sh`, avançar a sequence do cursor com folga (`setval` para `max(seq) + 1_000_000`) **ou** devolver em `/sync/alteracoes` um identificador de "época" do banco que, ao mudar, faz o app zerar o cursor. Registrar o passo em `backup-e-recuperacao.md`.

## D-QA-06 — Cursor de paginação forjado causa 500 (Média)

- **Componente:** `services/dona-cida/src/infra/repositorio-clinico.ts:142-152` e `:174` (`decodificarCursor` só confere "base64 de `[string, string]`"); `services/dona-cida/src/http/filtro-erros.ts:64-67` (loga a mensagem do Postgres).
- **Reproduzir:** `curl -H "Authorization: Bearer $T" "http://localhost:8088/api/v1/pessoa?cursor=WyJ4IiwieSJd"` (`["x","y"]` em base64). Igual em `/atendimento`, `/prontuario` e `/medicamento`.
- **Esperado:** 422 `VALIDACAO`.
- **Observado** (`evidencias/qa/seguranca-2-entradas.txt`): **500** nas quatro rotas; no log do pod: `ERRO_INTERNO: error: invalid input syntax for type uuid: "y"` e `…timestamp with time zone: "x"` — o texto enviado pelo cliente vai para o log. (`cursor=abc` devolve 422 corretamente; o Mike valida o cursor e devolve 422.)
- **Correção sugerida:** validar em `decodificarCursor` o `id` como UUID e a chave conforme o tipo da ordenação; no filtro de erros, logar só o SQLSTATE.

## D-QA-07 — Caractere nulo em texto causa 500 (Média)

- **Componente:** `packages/contratos/src/comum.ts:16` (`texto()` não recusa `\u0000`); `services/dona-cida/src/http/filtro-erros.ts:46`.
- **Reproduzir:** `POST /api/v1/pessoa` com `{"id":"<uuid>","nome":"QA\u0000nul","editadoEm":"<agora>"}`.
- **Esperado:** 422. **Observado:** **500**; log: `invalid byte sequence for encoding "UTF8": 0x00`. (O Mike devolve 422 para o mesmo caso em `/log`.)
- **Por que Média e não Baixa:** o app valida com o mesmo esquema, então o texto passaria para o outbox; como 5xx é "transitório", a operação seria **reenviada para sempre** e seguraria os dependentes, em vez de ir para "Pendências" como rejeitada.
- **Correção sugerida:** `.regex(/^[^\u0000]*$/)` em `texto()` (vale para servidor e app).

## D-QA-08 — Jaiminho lê corpos de qualquer tamanho (Média)

- **Componente:** `services/jaiminho/src/jaiminho/http/rotas.py:141-143, 184-189`; `__main__.py:35-45`; o gateway não tem `buffering.maxRequestBodyBytes`.
- **Reproduzir:** `POST /api/v1/documento/ficha-atendimento` com um JSON de 20 MB e token válido.
- **Esperado:** 413 (ou 422) sem ler o corpo inteiro, como fazem o Mike (64 KiB / 4 MiB) e a DonaCida (1 MB).
- **Observado:** os 20 MB foram enviados por inteiro e a resposta foi 422; a memória do pod subiu de 96 Mi para 116 Mi e não voltou. Sem token, 5 MB também foram enviados por inteiro antes do 401; com 20 MB sem token a conexão caiu sem resposta uma vez.
- **Correção sugerida:** middleware ASGI que recusa `Content-Length` acima de 16 KiB, ou o middleware `buffering` do Traefik nas rotas `/api/v1/documento`.

## D-QA-09 — Reuso de refresh token não é tratado como roubo (Média)

- **Componente:** `services/mike-baguncinha/internal/infra/postgres.go:60-77`.
- **Reproduzir:** login → `R1`; `POST /auth/refresh` com `R1` → `R2`; de novo com `R1` → 401 (correto); com `R2` → ?
- **Esperado (boa prática de rotação):** ao ver um refresh já usado, revogar toda a família; `R2` → 401.
- **Observado** (`seguranca-2-entradas.txt`, QA-07): `R2` → **200**. Quem roubou `R1` e o usou primeiro continua com sessão válida por 30 dias; a vítima só recebe um 401.
- **O que está correto:** rotação a cada uso, reuso do antigo → 401, refresh após logout → 401, só o hash é guardado.
- **Correção sugerida:** ao receber hash com `revogada_em IS NOT NULL`, revogar todas as sessões daquele profissional/dispositivo.

## D-QA-10 a D-QA-13 — Achados de leitura de código (Média)

Não executados; conferidos no código.

- **D-QA-10 — sem TLS nos manifestos.** `deploy/base/gateway/ingress.yaml:12-35, 47-52` não tem bloco `tls` nem redirecionamento; o HSTS (`middlewares.yaml:24`) só sai em HTTPS (confirmado: ausente nas respostas do cluster local) e o cookie `Secure` só funciona em HTTP porque o navegador trata `localhost` como seguro. Em qualquer outro nome de host sem TLS, o portal não manteria a sessão e tokens trafegariam em claro. Correção: `tls` + redirect no overlay `univates`.
- **D-QA-11 — Android.** `apps/lucky-patcher/android/app/src/main/AndroidManifest.xml:5` (`allowBackup="true"`) e `:10` (`usesCleartextTraffic="true"`); `capacitor.config.ts:8`. O banco com tokens e pacientes pode ir para o backup do aparelho. Correção: `allowBackup="false"`; tráfego em claro só no build de demonstração.
- **D-QA-12 — limitador de login.** `internal/aplicacao/limitador.go:35-40` + `autenticacao.go:50`: a chave `IP|tipo|registro` aceita registro de até 64 KiB (`handlers.go:111-122` não aplica o máximo de 40 do contrato) e não há contador por conta: força bruta distribuída por vários IPs contra um registro não tem teto. Correção: validar comprimentos no login e um segundo contador por `tipo|registro`.
- **D-QA-13 — dependências do Jaiminho.** `services/jaiminho/pyproject.toml:6-17` usa `>=` sem lock; o `Dockerfile:26` instala o que existir no dia. Correção: lock com hashes.

## D-QA-14 — Login com corpo grande e `Expect: 100-continue` fica sem resposta (Baixa)

- **Componente:** `services/mike-baguncinha/internal/http/handlers.go:21, 91` (`MaxBytesReader` de 64 KiB).
- **Reproduzir:** `curl --max-time 40 -X POST http://localhost:8088/api/v1/auth/login -H 'Content-Type: application/json' --data-binary @arquivo-de-5MB.json` (o curl manda `Expect: 100-continue` sozinho).
- **Esperado:** 413 ou 422 imediato. **Observado:** `http=100 … Operation timed out after 40011 milliseconds with 0 bytes received` (também com 20 MB e 90 s). Com `-H 'Expect:'` a resposta é 422 em 4 ms. `/log` com 5 MB responde 422 normalmente.
- **Correção sugerida:** responder 413 e fechar a conexão (`Connection: close`) quando o limite estoura.

## D-QA-15 — 503 do gateway fora do formato do contrato (Baixa)

- **Reproduzir:** `kubectl -n medicalfield scale deploy/jaiminho --replicas=0` e `POST /api/v1/documento/ficha-atendimento`.
- **Esperado (contrato §2):** `{"codigo":"SERVICO_INDISPONIVEL",…}`. **Observado** (`resiliencia.txt`): `503 no available server` em `text/plain`.
- **Impacto:** nenhum nas telas (o app trata como transitório; o portal mostra "Serviço fora do ar … Tente de novo em instantes"). Só quebra clientes que esperem JSON.
- **Correção sugerida:** middleware `errors` do Traefik servindo um JSON estático para 502/503/504.

## D-QA-16 — Texto digitado durante a gravação anterior é apagado (Baixa)

- **Componente:** `apps/lucky-patcher/src/telas/PaineisRegistro.tsx:311-314` — `if (await registrar(...)) setTexto('')` limpa o campo **depois** da gravação assíncrona, e o campo não fica bloqueado enquanto `gravando`.
- **Reproduzir:** registrar uma observação e começar a digitar a próxima antes de a anterior terminar de gravar. No primeiro ensaio do T-20, 12 observações preenchidas em sequência por automação resultaram em **7 gravadas**; as outras 5 foram apagadas pelo `setTexto('')` da anterior e o envio seguinte saiu vazio.
- **Impacto:** a janela é de dezenas de milissegundos (uma pessoa dificilmente cai nela), mas o efeito é perder anotação clínica sem aviso. Vale o mesmo para "Procedimento".
- **Correção sugerida:** limpar o campo só se o texto ainda for o que foi enviado, ou desabilitar o campo enquanto `gravando`.

## D-QA-17 — Chave de idempotência compartilhada entre profissionais (Baixa)

- **Componente:** `services/dona-cida/src/aplicacao/comando.ts:48-57`.
- **Reproduzir:** profissional A faz `POST /pessoa` com `Idempotency-Key: K`; o ADMIN repete o mesmo corpo com a mesma `K`.
- **Observado:** **200** com a resposta de A, sem nova linha de auditoria para o segundo autor. **Esperado:** a chave valer por profissional (ou 422).
- **Correção sugerida:** incluir `profissional_id` e `rota` na busca da operação.

## D-QA-18 — Rota desconhecida com quatro nomes no log de acesso (Baixa)

- Amplia o D-04 de `KNOWN_ISSUES.md`. `SELECT DISTINCT rota FROM auditoria.log_acesso` mostrou `(rota desconhecida)`, `rota-desconhecida`, `*path` e `/api/v1/` para caminhos que nenhum serviço conhece (`evidencias/qa/seguranca-3-expiracao-limite-logs.txt`).
- **Correção sugerida:** um único valor nos três serviços (e no contrato).

## D-QA-19 — Rastro do Playwright pode gravar a senha dentro do repositório (Baixa)

- **Componente:** `e2e/playwright.config.ts` (`trace: 'retain-on-failure'`, `outputDir: './resultados'`); `e2e/resultados/.last-run.json` está versionado e `.gitignore` só ignora `test-results/` e `playwright-report/`.
- **Observado:** uma falha do roteiro cria `e2e/resultados/<teste>/trace.zip`, que registra cada `fill` — inclusive o da senha de demonstração e as respostas com tokens. `git status` mostrou `e2e/resultados/.playwright-artifacts-0/` como não rastreado, pronto para um `git add .`.
- **Correção sugerida:** ignorar `resultados/` no Git (e remover o `.last-run.json` do índice) ou `trace: 'off'`. As specs de QA já rodam com o rastro desligado.

## D-QA-20 — `npm run roteiro` executa qualquer spec sob `e2e/` (Baixa)

- **Componente:** `e2e/playwright.config.ts` (`testDir: '.'`, sem `testMatch`).
- **Observado:** com as specs de QA nomeadas `*.spec.ts` em `e2e/qa/`, `npm run roteiro` rodou as quatro; o roteiro, executado logo depois da de resiliência (que derruba pods), parou no passo 16 (15 de 17). A causa dessa falha não foi determinada e **não se repetiu** em três execuções isoladas (17 de 17), duas delas logo após reiniciar DonaCida e Jaiminho. As specs de QA foram renomeadas para `*.qa.ts`.
- **Correção sugerida:** `testMatch: 'roteiro.spec.ts'` no config do roteiro.

## D-QA-21 — Itens menores da revisão de código (Baixa)

Conferidos por leitura; arquivo e linha para quem for corrigir.

| Item | Onde |
| --- | --- |
| Login não aplica os comprimentos máximos do contrato; JSON aceita campos desconhecidos | `services/mike-baguncinha/internal/http/handlers.go:91, 111-122` |
| `POST /log` sem limite por campo (`acao`, `entidade`, `detalhe`) | `handlers.go:240-259` |
| `dadosCorrigidos` da retificação é objeto livre (vai ao banco e ao PDF) | `packages/contratos/src/cida.ts:228` |
| E-mail aceita caracteres de controle que não são espaço (CR/LF são barrados) | `services/jaiminho/src/jaiminho/http/rotas.py:19, 65-71` |
| Jaiminho lê só o primeiro `X-Forwarded-For` quando chegam vários | `services/jaiminho/src/jaiminho/http/middlewares.py:140` |
| Confiança no CIDR inteiro de pods como proxy (mitigado pelas NetworkPolicies, conferidas no T-24) | `deploy/base/kustomization.yaml:27` |
| Estado do limitador de login em memória: zera ao reiniciar (ver D-QA-01) | `internal/aplicacao/limitador.go:8-10` |
| Refresh token devolvido também no corpo para o portal, que usa cookie | `handlers.go:190-192` |
| Access token não é revogável: segue valendo após o logout até expirar (observado: `/auth/me` → 200) | `internal/infra/token.go:78-88` |
| Jaiminho sem cache de JWKS e com o Mike fora: uma busca por requisição | `services/jaiminho/src/jaiminho/infra/jwks.py:68-71, 89` |
| `hash <senha>` recebe a senha por argumento de linha de comando | `services/mike-baguncinha/cmd/mike-baguncinha/main.go:27-28` |
| Sem expurgo de sessões expiradas | migração `20261117000100_identidade_e_auditoria.sql:18-26` |
| Imagens por tag, sem digest; contêineres sem `limits.cpu`; namespace sem Pod Security Admission | `deploy/base/**`, Dockerfiles |
| Mailpit é o SMTP padrão também no overlay `univates`; tela sem autenticação | `deploy/base/mailpit/deployment.yaml:46-49` |
| `SMTP_SEGURANCA` padrão `nenhuma` mesmo com usuário e senha | `services/jaiminho/src/jaiminho/infra/config.py:95` |
| `pg_dump "$DATABASE_URL"`: senha do admin visível nos argumentos do processo | `deploy/base/backup/cronjob.yaml:43` |
| `style-src 'unsafe-inline'` na CSP | `deploy/web/nginx.conf:30` |
| Actions do CI fixadas por tag, não por commit | `.github/workflows/ci.yml` |
| `scripts/dev-db.sh` interpola o nome do banco em SQL (operador local, não usuário) | `scripts/dev-db.sh:36` |
| `?desde=1;select` é lido como `desde=1` (o `;` separa parâmetros); sem efeito prático | `GET /sync/alteracoes` |

## Observações que não viraram defeito

- **Janela de 15 s após reinício.** Uma vez, logo depois de DonaCida e Jaiminho voltarem de zero réplicas, o Jaiminho respondeu 503 (`DonaCida inacessível … ConnectError`) por cerca de 15 s com a DonaCida já `Ready`. Repeti o cenário medindo (`evidencias/qa/infra-janela-apos-reinicio.txt`): 200 no primeiro segundo. Parece atraso da aplicação das NetworkPolicies ao pod novo; o portal mostra o erro e o botão "Tentar de novo".
- **Bloqueio de login por IP+registro com IP único.** No cluster local todo cliente chega com o IP `172.30.77.1` (NAT do Docker), então cinco senhas erradas de qualquer pessoa bloqueiam aquele registro para todos por 15 min. Na VM, depende de `externalTrafficPolicy: Local` e de `trustedIPs` estarem certos (`docs/operacao/acesso-publico.md`).
- **Pods `backup-manual-*` em `Completed`.** Sobram do `backup.sh` (dois, deste ensaio). Não consegui apagá-los (ação negada nesta sessão); `kubectl -n medicalfield delete job backup-manual-20261118033822 backup-manual-20261118033851` limpa.
