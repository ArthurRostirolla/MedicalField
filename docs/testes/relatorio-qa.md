# Relatório de QA independente — segurança, conflitos, auditoria e resiliência

- **Data:** 2026-11-18 (horas em UTC nas evidências)
- **Alvo:** sistema completo no k3s local, pelo gateway `http://localhost:8088`, serviços em `AMBIENTE=producao`. Nada foi testado contra mocks.
- **Como reexecutar:** [`e2e/qa/README.md`](../../e2e/qa/README.md)
- **Defeitos:** [defeitos-qa.md](defeitos-qa.md) · **Evidências:** [`evidencias/qa/`](evidencias/qa/)

## Resultado

| | Casos de teste | Verificações automáticas |
| --- | --- | --- |
| Executados | 41 | 327 |
| Passaram | 34 | 314 |
| Falharam | 7 | 13 |
| Não executados | 9 (lista no fim) | — |

O roteiro acadêmico, rodado **depois** de todos os testes destrutivos, passou **17 de 17** (três execuções isoladas seguidas).

O que os testes mostram:

- **Conflitos com dois dispositivos reais:** nenhuma alergia some, nenhum atendimento é rejeitado, um só prontuário por pessoa, CPF repetido é aceito e sinalizado no portal. O ponto mais fraco da validação anterior (OF-12, OF-13, OF-14) agora tem evidência no sistema integrado.
- **Autenticação e auditoria:** as 29 rotas do contrato recusam requisição sem token; nenhuma das 6 formas de token forjado passou em nenhum dos três serviços; o token expirado de verdade é recusado nos três; as tabelas de trilha são somente-inserção para os papéis dos serviços.
- **Resiliência:** matar o pod da DonaCida no meio da subida, zerar o Postgres, derrubar o Jaiminho, reiniciar tudo e restaurar um backup não perderam nem duplicaram dado.
- **O que falhou** são 7 casos, todos de robustez e segurança, nenhum de perda de dado: três de severidade Alta (D-QA-01, D-QA-02 e D-QA-03).

## Executado e passou

### Conflitos com dois clientes reais — `conflitos.qa.ts`

Dois contextos de navegador (dois dispositivos, Enf. Caio nos dois) contra o cluster. Evidência: `evidencias/qa/conflitos.txt`, `conflitos-portal-duplicatas.png`.

| ID | O que deve funcionar | Como foi executado | Esperado | Observado | Resultado |
| --- | --- | --- | --- | --- | --- |
| 1a / T-12 | Alergias acrescentadas offline em dois dispositivos à mesma pessoa ficam as duas | A e B sincronizam, ligam o seletor offline; A acrescenta "Alergia A", B acrescenta "Alergia B" à pessoa que já tinha "Alergia base"; A volta, depois B | 3 itens ativos na central | `Alergia A … \| Alergia B … \| Alergia base …`; 0 operações rejeitadas em A e B; após ressincronizar, **os dois aparelhos** mostram as três | Passou |
| 1b | Dois dispositivos offline criam prontuário e atendimento para a MESMA pessoa (que não tinha prontuário) | Cada um acrescenta uma alergia e inicia um atendimento com sinais vitais | 1 prontuário na central; os 2 atendimentos aceitos | Prontuários locais com ids diferentes (`fb26a503…` em A, `3afac9bc…` em B) → **1 prontuário** na central; 4 atendimentos (2 por pessoa) com `eventos=1` cada e o mesmo `prontuario_id`; os dois aparelhos convergiram para o id da central | Passou |
| 1c / T-13 | Mesmo CPF cadastrado offline nos dois | A cria "QA Duplicata A", B cria "QA Duplicata B", CPF igual | Ambas aceitas; a segunda com `possivel_duplicata_de`; aparece no portal | 2 linhas; `B … duplicataDe=<id de A>`, `A … duplicataDe=null`; os 2 atendimentos gravados; "QA Duplicata B" visível em **Possíveis duplicatas** no portal (captura) | Passou |
| 1d / T-11 | Conflito cadastral por campo | `PATCH /pessoa/{id}` pela API: B edita o telefone com `editadoEm` −10 min; A edita telefone e contato com −20 min e chega depois | Telefone de B (mais recente) e contato de A | `5122222222 \| Contato de A`; auditoria: `ALTERACAO antes={"telefone":"5100000000"} depois={"telefone":"5122222222"}` e `obs=campos mantidos por terem edição mais recente: telefone` | Passou |
| 1d | `editadoEm` mais antigo não sobrescreve | `PATCH` do nome com −2 h | Nome inalterado | HTTP 200, nome igual; `obs=campos mantidos por terem edição mais recente: nome` | Passou |
| 1d | Relógio adiantado é limitado e registrado | `PATCH` com `editadoEm` +24 h | Carimbo ≤ hora do servidor; observação na auditoria | `editadoEm adiantado (2026-11-19T03:16:47Z) limitado ao horário do servidor (2026-11-18T03:16:47Z)`; uma edição legítima 1,5 s depois venceu | Passou |
| — | Ressincronizar não duplica | Três sincronizações extras | Contagens iguais | Itens, atendimentos, eventos e pessoas idênticos | Passou |

### Segurança e autenticação pelo gateway

| ID | O que deve funcionar | Como foi executado | Esperado | Observado | Resultado | Evidência |
| --- | --- | --- | --- | --- | --- | --- |
| QA-01 | Toda rota do contrato exige token | `seguranca-1-autenticacao.sh`: as 29 rotas das seções 5, 6 e 7 (GET, POST e PATCH), sem cabeçalho; mais `Basic`, `Bearer` vazio e token na query | 401 | 401 nas 29 + 3 variações | Passou | `seguranca-1-autenticacao.txt` |
| QA-02 | Token forjado é recusado | `forjar-token.mjs`: assinatura adulterada; payload com `papel: ADMIN` e assinatura original; mesma `kid` assinada por outra chave Ed25519; `alg: none`; `exp` vencido com chave própria; HS256. Cada um em Mike (2 rotas), DonaCida e Jaiminho | 401 | 24 de 24 → 401; controle com token válido → 200 | Passou | idem |
| T-03 | Token **realmente** expirado → 401 nos três | Token emitido pelo Mike às 02:59:23Z, guardado e usado às 03:17:25Z (182 s depois do `exp`) | 401 | Mike, DonaCida e Jaiminho → 401 `NAO_AUTENTICADO` | Passou | `seguranca-3-…txt` |
| T-04 | PROFISSIONAL em `/auditoria/*` → 403 | Token do Enf. Caio em `/auditoria/acesso` e `/cliente`; controle com ADMIN | 403 / 200 | 403 `SEM_PERMISSAO` / 200 | Passou | `seguranca-1-…txt` |
| QA-03 | Porta de gestão fora do gateway | 15 caminhos: `/health/live`, `/health/ready`, `/jwks.json`, variações com `..`, `%2f`, `/metrics`, `/docs`, `/openapi.json` | 404 ou 401 | Nenhum devolveu 200 | Passou | idem |
| QA-04 | `X-Forwarded-For` forjado não altera `ip_cliente` | Requisição a cada serviço com `X-Forwarded-For`, `X-Real-Ip` e `Forwarded` = `6.6.6.6` e `X-Request-Id` próprio; `SELECT ip_cliente … WHERE request_id=` | IP real | `172.30.77.1` nos três; 0 linhas com `6.6.6.6` | Passou | `seguranca-2-entradas.txt` |
| T-02 | Limite de tentativas de login | 7 logins com registro **inexistente** e senha errada | 5× 401 genérico, depois 429 | 5× `401 CREDENCIAIS_INVALIDAS \| Registro ou senha inválidos.`; 6ª e 7ª `429 MUITAS_TENTATIVAS`; espaços e outra UF não contornam (429); outro registro → 401; linhas em `log_acesso` com `profissional_id` nulo | Passou | `seguranca-3-…txt` |
| QA-05 | Cabeçalhos de segurança e CSP | `curl -D -` em `/portal/`, `/app/` e na API | CSP, nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, COOP; sem `Server`/`X-Powered-By` | Todos presentes; CSP `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; … object-src 'none'; frame-ancestors 'none'`; API com `Cache-Control: no-store`. HSTS ausente: o cluster local não tem TLS (ver D-QA-10) | Passou | `seguranca-2-entradas.txt` |
| QA-06 | Cookie de refresh protegido | `Set-Cookie` do login | `HttpOnly`, `SameSite=Strict`, `Secure`, `Path=/api/v1/auth` | `mf_refresh=…; Path=/api/v1/auth; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict` | Passou | idem |
| QA-07 | Refresh rotacionado não pode ser reutilizado | login → refresh (R1→R2) → R1 de novo; refresh lixo; sem refresh; após logout | 401 | R1 reutilizado → 401; lixo → 401; vazio → 401; após logout → 401. **Ressalva:** R2 continuou válido (D-QA-09) | Passou | idem |
| QA-08 | Injeção de SQL na busca e em texto | 6 cargas em `?busca=` (`' OR '1'='1`, `'; DROP TABLE…`, `%%`, `___`, `UNION SELECT`, `pg_sleep(5)`); pessoa com nome `Robert'); DROP TABLE … <script>…` | Tratadas como texto; tabela intacta | 200 com 0 itens em 6 a 8 ms cada (o `pg_sleep` não executou); `count(*)` igual; nome gravado literalmente | Passou | idem |
| QA-10 / T-05 / T-06 | `Idempotency-Key` malformada e conflitante | Chave `abc`, chave com SQL, chave de 10 mil caracteres; mesma chave 2× com o mesmo corpo; mesma chave com corpo diferente | 422; 201 e depois 200; 422 | 422 nas três e nenhuma pessoa gravada; 201 → 200; `422 CHAVE_IDEMPOTENCIA_CONFLITANTE`; Jaiminho com chave `abc` → 422 | Passou | idem |
| QA-09 (parte) | Corpos inválidos não viram 500 | JSON quebrado nos três serviços e no login; array no lugar de objeto; campo desconhecido (`papel`); `text/plain`; nome de 100 mil caracteres; `dados` com campo a mais; `pessoaId` inexistente; CRLF no nome e LF no e-mail do destinatário | 4xx | 422 em todos | Passou | idem |
| QA-11 | CORS e métodos | `Origin: https://evil.example`; preflight; origem do app; `TRACE`/`DELETE`/`PUT` | Sem `Allow-Origin` para origem estranha; sem credenciais; 404 | Conforme | Passou | idem |
| QA-13 | Logs sem senha, token, corpo ou dado de paciente | `kubectl logs` dos 4 workloads + Traefik (1.315 linhas) e `auditoria.log_acesso`; busca pela senha de demonstração, por JWT, `Bearer`, `refreshToken`, `"senha"` e por 53 padrões tirados do banco (nomes, CPFs, itens de prontuário, e-mails de destinatário) | 0 ocorrências | 0 em todas; `rota` sem query string e sem ids | Passou | `seguranca-3-…txt` |
| QA-17 | Portal guarda o token só em memória | `seguranca-app.qa.ts`: `localStorage`, `sessionStorage`, `document.cookie` e cookies do contexto depois do login | Nenhum JWT acessível a script | `localStorage={"mf-portal-sessao":"1"}`; `document.cookie=""`; `mf_refresh httpOnly=true secure=true sameSite=Strict`; nenhum `alert()` com o nome malicioso | Passou | `seguranca-app.txt` |

### Auditoria — `auditoria.sh`

| ID | O que deve funcionar | Como foi executado | Esperado | Observado | Resultado |
| --- | --- | --- | --- | --- | --- |
| T-16 | Linha em `log_acesso` com os 7 campos, por serviço | Uma requisição a cada serviço com `X-Request-Id` próprio e leitura da linha | data/hora, IP, profissional, método, rota-padrão, status, tempo | Mike: `…03:22:44\|172.30.77.1\|0d5b…0002\|GET\|/api/v1/auth/me\|200\|0`; DonaCida: `…\|GET\|/api/v1/prontuario/{pessoaId}\|404\|5`; Jaiminho: `…\|GET\|/api/v1/documento/{id}\|404\|6`; 401 sem token gravado com profissional nulo | Passou |
| QA-15 | Tabelas de trilha são somente-inserção para os serviços | `psql` autenticado como `mf_mike`, `mf_cida` e `mf_jaiminho` (senhas dos Secrets): `UPDATE`, `DELETE`, `TRUNCATE` em `auditoria.log_acesso`, `log_cliente`, `clinico.atendimento_evento`, `operacao_sync`, `auditoria_clinica`; `DROP`, `ALTER … DISABLE TRIGGER`, `CREATE TABLE`; leitura do schema alheio | Negado | 36 tentativas, 36 negadas (`permission denied for table …`, `must be owner …`, `permission denied for schema …`); privilégios: `mf_cida: INSERT,SELECT` nas três do clínico, `INSERT` em `log_acesso`; contagens inalteradas. `mf_cida` também não apaga `atendimento`, `pessoa` nem `prontuario_item` e não lê `identidade.profissional` | Passou |

Evidência: `evidencias/qa/auditoria.txt` (62 verificações).

### Resiliência no Kubernetes — `resiliencia.qa.ts`, `infra.sh`

App aberto no Chrome (390×844) com operações pendentes. Evidência: `resiliencia.txt`, `resiliencia-t20-no-meio.png`, `resiliencia-t14-banco-fora.png`, `resiliencia-t23-portal-pdf-falhou.png`, `infra-*.txt`.

| ID | O que deve funcionar | Como foi executado | Esperado | Observado | Resultado |
| --- | --- | --- | --- | --- | --- |
| T-20 | Pod da DonaCida morre no meio da sincronização | Offline: paciente, alergia, atendimento, sinais e 12 observações (16 operações). Online com 600 ms de atraso por evento; após o 3º evento confirmado, `kubectl delete pod … --grace-period=0 --force` | Pendências preservadas; conclui quando o pod volta; nada duplica | 4 s depois da queda: **9 pendentes** no aparelho, central com `1 atendimento, 4 eventos`, gateway `503`; 0 rejeitadas. Pod novo pronto → `0 pendentes; 1 pessoa, 1 prontuario, 1 atendimento, 13 eventos`; nova sincronização não mudou nada; nenhuma `op_id` repetida | Passou |
| T-14 | Postgres em 0 réplicas | `kubectl scale statefulset/postgres --replicas=0`; registrar no app em modo online; esperar 75 s; voltar para 1 | Serviços `NotReady` sem reinício em laço; o app acumula; sincroniza na volta | Mike, DonaCida e Jaiminho `0/1 Running`; reinícios `2/0/0` antes e depois dos 75 s (os 2 do Mike são do D-QA-01); `/portal/` 200, API 503; app com **5 pendentes, 0 rejeitadas**; depois: `1 pessoa, 1 prontuario, 1 atendimento, 2 eventos`; contagens de pessoa/atendimento/evento/documento `38/34/66/7 → 39/35/68/7` (só o que o teste criou) | Passou |
| T-23 | Jaiminho fora | `scale deploy/jaiminho --replicas=0`; registrar e sincronizar no app; pedir a ficha pela API e pelo portal | Registro e sync funcionam; PDF falha com erro claro | App: "Tudo enviado", `1 atendimento, 1 eventos` na central. API: 503. Portal: **"Serviço fora do ar — O serviço que entrega as fichas em PDF não respondeu. Tente de novo em instantes."** com botão "Tentar de novo" | Passou (formato do 503: D-QA-15) |
| T-18 | DonaCida fora ao gerar a ficha | `scale deploy/dona-cida --replicas=0`; `POST /documento/ficha-atendimento` | 503 claro; nenhum documento órfão | `503 {"codigo":"SERVICO_INDISPONIVEL","mensagem":"Serviço clínico indisponível; tente novamente"}`; documentos 5 → 5; com tudo de volta → 201 | Passou |
| T-21 | Reiniciar tudo não perde dado | `infra.sh reinicio`: `rollout restart` dos 5 Deployments + `delete pod postgres-0` | Contagens e volumes iguais | 12 tabelas idênticas (`atendimento=26 atendimento_evento=48 auditoria_clinica=155 … pessoa=30 …`); md5 dos ids de evento igual; PVC→PV iguais; token emitido **antes** do reinício continuou válido (chave vem do Secret) | Passou |
| T-24 | NetworkPolicies bloqueiam acesso indevido | `infra.sh rede`: `nc` de dentro do pod `web`, de um pod temporário sem rótulo e do Jaiminho | Bloqueado, salvo os caminhos previstos | `web` → Postgres (por nome e por IP), DonaCida 8080/9090, Mike 8080/9090, Jaiminho, Mailpit, internet: **11 de 11 bloqueados**. Pod sem rótulo: **9 de 9 bloqueados**. Controles: pod com rótulo `backup` → Postgres aberto; Jaiminho → Postgres, DonaCida e Mailpit 1025 abertos; Jaiminho → Mailpit 8025, Mike 8080 e internet 443 bloqueados | Passou |
| T-22 | Backup e restauração | `infra.sh backup`: `backup.sh` → estrago (linha a mais, linha adulterada, envio apagado) → `restore.sh --sim` → contagens; depois `exportar` + restauração do arquivo local | Dados idênticos aos do backup | `medicalfield-20261118T033823Z.dump` (406 K); após o estrago `envio_email=4 medicamento=15`; após restaurar, as 12 contagens e o md5 iguais aos do backup; linha extra sumiu; adulteração desfeita; permissões de `mf_cida` e trigger do cursor preservados; API lê (200) e grava (201) sem reiniciar serviços; restauração por arquivo local idem | Passou (ressalva: D-QA-05) |

### E-mail com falha — `email-falha.sh` (T-19 no cluster)

| O que deve funcionar | Como foi executado | Esperado | Observado | Resultado |
| --- | --- | --- | --- | --- |
| SMTP fora → tentativas crescentes → recuperação sozinha | Mailpit em 0 réplicas; `POST /documento/{id}/email`; acompanhar por `GET …/email` e pelo banco; devolver o Mailpit e **não** pedir reenvio | 202; `tentativas` 1, 2; `ultimo_erro` sem dado de paciente; `ENVIADO` na tentativa seguinte | 202. `+0 s: PENDENTE\|1\|SMTPConnectError\|próxima 03:27:36Z`; `+65 s: PENDENTE\|2\|SMTPConnectError\|próxima 03:32:36Z` (60 s e 300 s de espera, como no contrato); `ultimo_erro=[SMTPConnectError]`; 0 linhas do log do Jaiminho com paciente, destinatário ou conteúdo clínico; `+368 s: ENVIADO\|3`; 1 mensagem no Mailpit com 1 anexo | Passou |

Evidência: `evidencias/qa/email-falha.txt` (11 verificações).

### Roteiro acadêmico

`npm run roteiro -w @medicalfield/e2e`, depois de todos os testes acima: **17 de 17** em 17,4 s (`evidencias/roteiro/resultado.md`, data `2026-11-18T03:44:46Z`). Repetido duas vezes logo após reiniciar DonaCida e Jaiminho: 17 de 17. Uma execução anterior, disparada por engano junto com as specs de QA, parou no passo 16 — ver D-QA-20.

## Executado e falhou

| ID | O que deveria acontecer | Como foi executado | Observado | Defeito |
| --- | --- | --- | --- | --- |
| QA-14 | Logins simultâneos não derrubam o serviço | 4, 8, 16 e 32 `POST /auth/login` em paralelo com registros inexistentes | 8 em paralelo → 8× 502 e `OOMKilled`; 32 → 32× 503 (`seguranca-4-login-concorrente.txt`) | D-QA-01 (Alta) |
| QA-16 | `window.__mf` não existe em produção | `seguranca-app.qa.ts` contra `/app/` do cluster | Existe; leu access e refresh token; `CREATE TABLE + INSERT` funcionou (`seguranca-app.txt`) | D-QA-02 (Alta) |
| QA-12 | Gateway limita o login a 10/min por IP | 14 e 16 logins em sequência | Nenhum 429 antes de o pod do Mike reiniciar; depois, 429 a partir do 11º (`seguranca-5-limite-gateway.txt`) | D-QA-04 (Média) |
| QA-18 | Dispositivo recebe o que for criado depois de uma restauração | backup → sync → `INSERT` → sync → restore → `INSERT` → sync | `seq` 108 reutilizado; `?desde=108` devolve vazio (`infra-cursor-pos-restauracao.txt`) | D-QA-05 (Média) |
| QA-08 (cursor) | Cursor inválido → 422 | `?cursor=` com base64 de `["x","y"]` em `/pessoa`, `/atendimento`, `/prontuario`, `/medicamento` | 500 nas quatro; valor no log | D-QA-06 (Média) |
| QA-09 (NUL) | `\u0000` em texto → 422 | `POST /pessoa` com `"nome":"QA\u0000nul"` | 500 | D-QA-07 (Média) |
| QA-09 (corpo gigante) | Corpo de 20 MB → 413/422 rápido, nos três | 20 MB em `/pessoa`, `/log`, `/documento/ficha-atendimento`, `/auth/login` | DonaCida 422. Jaiminho leu os 20 MB (D-QA-08). Mike: `/log` e `/auth/login` ficaram sem resposta por 90 s com `Expect: 100-continue` (D-QA-14). Nenhum pod reiniciou | D-QA-08 (Média), D-QA-14 (Baixa) |

## Não executado

| Item | Motivo |
| --- | --- |
| Conflito com dois **profissionais diferentes** nos dois dispositivos | O auxiliar `entrar()` só cobre login por COREN; usei o mesmo profissional em dois dispositivos (dois `X-Dispositivo-Id`), que exercita o mesmo caminho do servidor |
| `FALHA_DEFINITIVA` após 5 tentativas e reenvio manual, no cluster | Com o backoff padrão (1, 5, 15, 60 min) leva mais de 80 min; mudar `EMAIL_BACKOFF_SEGUNDOS` exigiria editar o ConfigMap, fora da minha área. Segue só com os testes do Jaiminho |
| 429 do login visto no navegador | Bloquearia um profissional de demonstração por 15 min; o 429 foi conferido pela API com registro inexistente |
| HSTS, cookie `Secure` e redirecionamento em HTTPS de verdade | O cluster local não tem TLS (D-QA-10) |
| T-25 — coleção Postman/Newman | `newman` não está instalado e a coleção não fazia parte do pedido |
| T-15 — falha de escrita no banco local | Teste unitário do app; fora do escopo deste QA |
| App Android (APK, adaptador nativo, SQLCipher, Keystore) | Sem APK construído (FE-06) |
| VM da Univates, acesso público, SMTP externo | Bloqueios externos X-01 e X-02 |
| Testes automatizados dos serviços (`go test`, `vitest`, `pytest`) | Já registrados em E-003; o pedido era validar o sistema rodando |

## Revisão de segurança do código (leitura dirigida)

Feita em paralelo aos testes; os defeitos estão em `defeitos-qa.md` (D-QA-02, 03, 06 a 13 e 21). O que foi conferido e está **correto**:

| Ponto | Conclusão | Onde |
| --- | --- | --- |
| Validação de entrada | DonaCida: toda rota passa por esquema zod `strictObject`, ids de caminho como UUID, corpo ≤ 1 MB, `limite` 1..200. Jaiminho: pydantic com `extra="forbid"`, ids `UUID`. Mike: `MaxBytesReader`, enum, UUID, datas | `services/dona-cida/src/http/controllers.ts:47-187`, `requisicao.ts:35,52`; `services/jaiminho/src/jaiminho/http/rotas.py:27-71`; `services/mike-baguncinha/internal/http/handlers.go:21-22,91,233-259,344-381` |
| Construção de SQL | Nenhuma concatenação com valor de usuário. Mike 100% `$n`; DonaCida usa o template do Kysely (parâmetros) e `sql.raw` só com constantes; Jaiminho usa f-string só com listas de colunas constantes e `%s` para valores. A busca escapa `%`, `_` e `\` | `internal/infra/postgres.go:38-187`; `src/infra/repositorio-clinico.ts:172-174,282-285`; `infra/banco.py:68-216` |
| `X-Forwarded-For` | Os três ignoram o cabeçalho quando o par não é proxy confiável e varrem da direita; uvicorn com `proxy_headers=False`; Traefik só aceita `X-Forwarded-*` de `127.0.0.1/32`. Confirmado em execução (QA-04) | `internal/http/ip.go:11-38`; `src/http/ip-cliente.ts:24-35`; `http/middlewares.py:38-58`, `__main__.py:42`; `deploy/argocd/traefik-helmchartconfig.yaml:19-20` |
| JWT | Só `EdDSA` nos três; `iss` e `exp` obrigatórios; sem tolerância de relógio; `kid` desconhecido com intervalo mínimo de 5 s. Confirmado em execução (QA-02, T-03) | `internal/infra/token.go:81`; `src/infra/verificador-token.ts:26-38`; `infra/jwks.py:21-71` |
| Senha e enumeração | Argon2id (m=19456, t=2, p=1); comparação em tempo constante; registro inexistente verifica um hash falso; resposta idêntica | `internal/infra/senha.go:14-55`; `internal/aplicacao/autenticacao.go:60-67` |
| Token no portal | Access token só em memória; refresh só no cookie `HttpOnly`. Confirmado em execução (QA-17) | `apps/brad-pitt/src/api/cliente.ts:46-117` |
| Token no app | Access e refresh em `sync_estado` no SQLite local (necessário para abrir sem rede); sem cifra no navegador (limitação assumida), SQLCipher no Android | `apps/lucky-patcher/src/sync/sessao.ts:55-78`; `capacitor.config.ts:13` |
| Segredos no repositório | A senha de demonstração só aparece em `services/mike-baguncinha/README.md:11` e como hash na migração; nenhuma chave privada, token ou senha de produção versionados; `deploy/secrets.local.env` e `deploy/.local/` ignorados. Senhas `dev_*` aparecem em scripts, CI e documentação (aceitável). As evidências e os scripts deste QA foram varridos: nenhuma senha nem JWT | `git grep`; `.gitignore:14-19`; `deploy/.gitignore:1` |
| Contêineres e manifestos | Todos os pods: não-root, `readOnlyRootFilesystem`, `allowPrivilegeEscalation: false`, `capabilities.drop: ALL`, `seccompProfile: RuntimeDefault`, `automountServiceAccountToken: false`, requests e limite de memória, três probes; segredos por `Secret` | `deploy/base/*/deployment.yaml`, `postgres/statefulset.yaml`, `backup/cronjob.yaml` |
| Logs | Nenhum ponto loga corpo, senha, token ou `Authorization`; `ultimo_erro` guarda só a classe do erro e o código SMTP. Confirmado em execução (QA-13, T-19) | `internal/http/servidor.go:121-169`; `src/infra/log-acesso.ts:38-49`; `aplicacao/envios.py:86-104` |
| E-mail e PDF | Nome recusa caracteres de controle; endereço recusa espaços e `<>,;`; `To` montado com `formataddr`; Jinja2 com autoescape; WeasyPrint só busca `data:`; `CLINICO_URL` só de ambiente; nome do arquivo gerado no servidor | `http/rotas.py:19,56-71`; `infra/email.py:13-14`; `infra/pdf/renderizador.py:362-376` |

## Estado em que o ambiente ficou

- `kubectl -n medicalfield get pods` às 03:47Z: `postgres-0`, `mike-baguncinha`, `dona-cida`, `jaiminho`, `web` e `mailpit` em `1/1 Running`, todos com 1 réplica. Postgres e Mailpit de volta.
- Sobraram dois pods `backup-manual-*` em `Completed` (criados pelo `backup.sh`); não consegui apagá-los nesta sessão. Comando em `defeitos-qa.md`, última seção.
- O banco do cluster foi **restaurado três vezes** para backups tirados durante os testes (T-22 e QA-18). Os dados de teste ficam: cerca de 30 pessoas `QA …` com atendimentos e documentos, um medicamento inativo `QA M2 …`, linhas de log. Nada que existia antes foi apagado.
- `docs/testes/evidencias/roteiro/*` foi regravado pela execução final do roteiro (é o comportamento do próprio roteiro).
- Contêineres `mes3-*` e `prod-restore`: não tocados. Ambiente de desenvolvimento (portas 8081–8083, 5544): não usado.
