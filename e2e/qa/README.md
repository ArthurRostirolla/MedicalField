# QA independente — scripts e specs reexecutáveis

Tudo aqui roda contra o **sistema implantado no k3s local** (gateway em `http://localhost:8088`), não contra mocks. Resultados e evidências: [`docs/testes/relatorio-qa.md`](../../docs/testes/relatorio-qa.md), [`docs/testes/defeitos-qa.md`](../../docs/testes/defeitos-qa.md), `docs/testes/evidencias/qa/`.

## Pré-requisitos

- Cluster no ar: `bash deploy/scripts/cluster-local.sh subir` (e `status` para conferir os 6 pods).
- Git Bash, `kubectl`, `curl`, Node 24 e o Chrome instalado. Não há `jq`: os scripts usam Node.
- A senha de demonstração **só no ambiente**, nunca em arquivo:

```bash
export MF_SENHA_DEMO='<senha de services/mike-baguncinha/README.md>'
```

## Scripts de API e cluster (bash)

Rodar de `e2e/qa/`. Cada linha de saída começa com `PASSOU`, `FALHOU` ou `NOTA`; a última linha traz o total.

| Script | O que cobre | Duração | Efeito no cluster |
| --- | --- | --- | --- |
| `seguranca-1-autenticacao.sh` | 29 rotas sem token → 401; tokens forjados (assinatura, payload, outra chave, `alg: none`, HS256, `exp` vencido com chave própria); PROFISSIONAL em `/auditoria/*` → 403; porta de gestão fora do gateway | 20 s | nenhum |
| `seguranca-2-entradas.sh` | `X-Forwarded-For` forjado; cabeçalhos e CSP; cookie de refresh; reuso de refresh; injeção de SQL; cursores e corpos inválidos; corpo de 20 MB; `Idempotency-Key` malformada; CORS | 4 min | cria algumas pessoas `QA …` |
| `seguranca-3-expiracao-limite-logs.sh` | token **realmente** expirado (`MF_TOKEN_ANTIGO=<arquivo com token emitido há mais de 15 min>`); 429 do login com registro inexistente; limite de taxa do gateway; varredura dos logs dos pods e de `log_acesso` | 2 min | esgota o limite de login do seu IP por 1 min |
| `auditoria.sh` | 7 campos do log de acesso nos três serviços; `UPDATE`/`DELETE`/`TRUNCATE` negados aos papéis `mf_*` (senhas lidas dos Secrets, nunca impressas) | 1 min | nenhum |
| `email-falha.sh` | Mailpit em 0 réplicas → tentativas 1, 2 com `ultimo_erro` → Mailpit volta → `ENVIADO` sozinho | 7 min | escala o Mailpit e o devolve |
| `infra.sh rede` | NetworkPolicies a partir do pod `web`, de um pod sem rótulo e do Jaiminho | 2 min | cria e apaga 2 pods temporários |
| `infra.sh reinicio` | `rollout restart` de tudo + `delete pod postgres-0`, contagens antes/depois | 3 min | reinicia todos os pods |
| `infra.sh backup` | `backup.sh` → estrago → `restore.sh --sim` → contagens; depois `exportar` + restauração de arquivo local | 2 min | **restaura o banco para o backup tirado no próprio teste** |

`forjar-token.mjs <variante> <token>` gera as variantes de token usadas acima. O teste de logins simultâneos (D-QA-01) é um laço de `curl` descrito em `defeitos-qa.md`; ele derruba o pod do Mike de propósito.

## Specs Playwright

Rodar de `e2e/`:

```bash
npx playwright test -c qa/playwright.config.ts conflitos        # dois dispositivos, 20 s
npx playwright test -c qa/playwright.config.ts resiliencia      # derruba pods e escala o Postgres, 6 min
npx playwright test -c qa/playwright.config.ts seguranca-app    # window.__mf e armazenamento de token, 5 s
```

- `conflitos.qa.ts` — dois contextos de navegador (dois dispositivos) offline sobre as mesmas pessoas: união de alergias, um prontuário por pessoa, CPF duplicado sinalizado e visível no portal; conflito cadastral por campo via `PATCH /pessoa`.
- `resiliencia.qa.ts` — pod da DonaCida apagado no meio da sincronização; Postgres em 0 réplicas; Jaiminho e DonaCida fora. O `afterAll` devolve todas as réplicas.
- `seguranca-app.qa.ts` — **o teste QA-16 falha enquanto o defeito D-QA-02 existir** (é a prova dele); QA-17 passa.

O rastro do Playwright está desligado (`trace: 'off'`): ele gravaria a senha digitada e os tokens.

## Ordem sugerida

Segurança e auditoria primeiro; depois conflitos; depois e-mail, resiliência e `infra.sh`; por último o roteiro (`npm run roteiro -w @medicalfield/e2e`) para confirmar que o sistema ficou íntegro.
