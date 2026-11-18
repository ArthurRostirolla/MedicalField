# QA independente — scripts e specs reexecutáveis

Tudo aqui roda contra o **sistema implantado** (gateway em `http://localhost:8088`), não contra mocks. As execuções registradas foram feitas no k3s local, antes da troca para o Docker Compose. Resultados e evidências: [`docs/testes/relatorio-qa.md`](../../docs/testes/relatorio-qa.md), [`docs/testes/defeitos-qa.md`](../../docs/testes/defeitos-qa.md), `docs/testes/evidencias/qa/`.

## Pré-requisitos

- Modo Compose no ar: `cd deploy && docker compose up -d` (e `docker compose ps` para conferir).
- Git Bash, Docker com Compose v2, `curl`, Node 24 e o Chrome instalado. Não há `jq`: os scripts usam Node.
- A senha de demonstração **só no ambiente**, nunca em arquivo:

```bash
export MF_SENHA_DEMO='<senha de apps/mike-baguncinha/README.md>'
```

## Scripts de API e infraestrutura (bash)

`lib.sh` fala com o sistema por `docker compose` (função `dc`, rodada em `deploy/`). O antigo `infra.sh` (NetworkPolicies, `rollout restart`, PVC) testava peças do Kubernetes e foi removido; backup e restauração seguem em `deploy/scripts/backup.sh` e `restore.sh`.

Rodar de `e2e/qa/`. Cada linha de saída começa com `PASSOU`, `FALHOU` ou `NOTA`; a última linha traz o total.

| Script | O que cobre | Duração | Efeito no sistema |
| --- | --- | --- | --- |
| `seguranca-1-autenticacao.sh` | 29 rotas sem token → 401; tokens forjados (assinatura, payload, outra chave, `alg: none`, HS256, `exp` vencido com chave própria); PROFISSIONAL em `/auditoria/*` → 403; porta de gestão fora do gateway | 20 s | nenhum |
| `seguranca-2-entradas.sh` | `X-Forwarded-For` forjado; cabeçalhos e CSP; cookie de refresh; reuso de refresh; injeção de SQL; cursores e corpos inválidos; corpo de 20 MB; `Idempotency-Key` malformada; CORS | 4 min | cria algumas pessoas `QA …` |
| `seguranca-3-expiracao-limite-logs.sh` | token **realmente** expirado (`MF_TOKEN_ANTIGO=<arquivo com token emitido há mais de 15 min>`); 429 do login com registro inexistente; limite de taxa do gateway; varredura dos logs dos contêineres e de `log_acesso` | 2 min | esgota o limite de login do seu IP por 1 min |
| `auditoria.sh` | 7 campos do log de acesso nos três serviços; `UPDATE`/`DELETE`/`TRUNCATE` negados aos papéis `mf_*` (senhas lidas de `deploy/.env`, nunca impressas) | 1 min | nenhum |
| `email-falha.sh` | Mailpit parado (`docker compose stop`) → tentativas 1, 2 com `ultimo_erro` → Mailpit volta → `ENVIADO` sozinho | 7 min | para o Mailpit e o devolve |

`forjar-token.mjs <variante> <token>` gera as variantes de token usadas acima. O teste de logins simultâneos (D-QA-01) é um laço de `curl` descrito em `defeitos-qa.md`; ele derruba o contêiner do Mike de propósito.

## Specs Playwright

Rodar de `e2e/`:

```bash
npx playwright test -c qa/playwright.config.ts conflitos        # dois dispositivos, 20 s
npx playwright test -c qa/playwright.config.ts resiliencia      # para e reinicia contêineres, inclusive o Postgres, 6 min
npx playwright test -c qa/playwright.config.ts seguranca-app    # window.__mf e armazenamento de token, 5 s
```

- `conflitos.qa.ts` — dois contextos de navegador (dois dispositivos) offline sobre as mesmas pessoas: união de alergias, um prontuário por pessoa, CPF duplicado sinalizado e visível no portal; conflito cadastral por campo via `PATCH /pessoa`.
- `resiliencia.qa.ts` — contêiner da DonaCida morto (`docker compose kill`) no meio da sincronização; Postgres parado; Jaiminho e DonaCida fora. O `afterAll` sobe tudo de volta (`docker compose up -d --wait`). Adaptado ao Compose; reexecução a validar.
- `seguranca-app.qa.ts` — **o teste QA-16 falha enquanto o defeito D-QA-02 existir** (é a prova dele); QA-17 passa.

O rastro do Playwright está desligado (`trace: 'off'`): ele gravaria a senha digitada e os tokens.

## Ordem sugerida

Segurança e auditoria primeiro; depois conflitos; depois e-mail e resiliência; por último o roteiro (`npm run roteiro -w @medicalfield/e2e`) para confirmar que o sistema ficou íntegro.
