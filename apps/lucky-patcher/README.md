# LuckyPatcher — app do profissional de saúde

App Offline-First do MedicalField (o usuário vê "MedicalField"): PWA no navegador e APK Android pelo Capacitor, com o mesmo código. Toda escrita é uma transação no SQLite local (dado + comando no outbox + log); a rede é resolvida depois pelo motor de sincronização.

**DADOS DEMONSTRATIVOS — SEM VALIDADE CLÍNICA.**

- Arquitetura offline: [`docs/arquitetura/plano-arquitetural.md`](../../docs/arquitetura/plano-arquitetural.md), seção H. Contratos: [`docs/contratos.md`](../../docs/contratos.md).
- Banco local no navegador e teste de durabilidade: [`docs/durabilidade.md`](docs/durabilidade.md).
- Android: [`docs/android.md`](docs/android.md).
- Revisão de interface: [`IMPECCABLE.md`](IMPECCABLE.md).

## Rodar

Com o backend no ar (`bash scripts/dev-servicos.sh subir`, na raiz):

```bash
npm install -w @medicalfield/lucky-patcher
npm run dev -w @medicalfield/lucky-patcher        # http://localhost:5182/app/
```

| Comando (`-w @medicalfield/lucky-patcher`) | O que faz |
| --- | --- |
| `npm run dev` | Vite em 5182, com proxy para os três serviços. Diagnóstico **ligado** |
| `npm run build` | Build de produção em `dist/`. Diagnóstico **desligado** (a não ser que `VITE_DIAGNOSTICO=1` esteja no ambiente) |
| `npm run build:diagnostico` | O mesmo build, com o diagnóstico ligado, em `dist-diagnostico/` (usado pelo cenário de PWA) |
| `npm run build:android` | Build web do APK de **depuração** (diagnóstico ligado) + `cap sync` |
| `npm run build:android:producao` | Build web do APK de **release** (diagnóstico desligado) + `cap sync` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | vitest: motor de sincronização e outbox sobre SQLite real em memória, porta de diagnóstico, painéis de registro |
| `npm run e2e` | Playwright contra o backend real (precisa de `MF_SENHA_DEMO`; usa o Chrome instalado) |

## Porta de diagnóstico (`window.__mf`)

Os testes de ponta a ponta precisam conferir o banco local do app. Para isso existe uma porta de diagnóstico — e ela **não faz parte do build de produção**.

**Quando existe.** Só quando o pacote é construído com o diagnóstico ligado:

| Como o pacote é gerado | `window.__mf` |
| --- | --- |
| `npm run build` (produção) | **não existe** — o código da porta nem entra no pacote |
| `npm run dev` | existe |
| `npm run build:diagnostico`, `npm run build:android` | existe |
| qualquer build com `VITE_DIAGNOSTICO=1` no ambiente | existe |
| `npm run build:android:producao` | não existe |

**Imagem `web`.** `deploy/web/Dockerfile` recebe o *build-arg* `VITE_DIAGNOSTICO`. A imagem de **demonstração** (cluster local, onde rodam o roteiro automatizado e os testes de QA) é construída com `--build-arg VITE_DIAGNOSTICO=1`; a imagem de **produção** é construída sem o argumento e não expõe nada.

**O que ela faz, quando existe.** É somente leitura de verdade, e não entrega a sessão:

- `__mf.consultar(sql, params?)` aceita **um único `SELECT`**. `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`, `PRAGMA` e mais de um comando por chamada são recusados com erro (`Diagnóstico somente leitura: …`). No navegador a consulta ainda roda com `PRAGMA query_only` ligado: o próprio SQLite recusa escrita.
- Qualquer consulta que cite a tabela `sync_estado` é recusada: é lá que fica a sessão (access e refresh token).
- `__mf.estado(chave)` devolve as chaves de `sync_estado` que não são segredo: `cursor`, `dispositivo_id`, `ultima_sync`, `modo_simulado`, `servidor`. `sessao` é recusada.

Código em `src/diagnostico.ts`; testes em `src/diagnostico.test.ts`, `e2e/sync.spec.ts` (cenário 10) e `e2e/producao.spec.ts` (build de produção sem a porta).

Limite: no Android o plugin de SQLite não tem modo somente leitura por consulta; lá a garantia é o filtro de "um único `SELECT`" mais o caminho de leitura do plugin.

## Testes de ponta a ponta

```bash
# na raiz; a senha de demonstração está em apps/mike-baguncinha/README.md
MF_SENHA_DEMO='…' npm run e2e -w @medicalfield/lucky-patcher
```

O Playwright sobe sozinho três servidores (e reaproveita os que já estiverem no ar):

| Projeto | Porta | O que serve | Cenários |
| --- | --- | --- | --- |
| `dev` | 5182 | Vite de desenvolvimento | `sync.spec.ts` (1–4, 6–10), `capturas.spec.ts` |
| `pwa` | 5183 | `dist-diagnostico/` por `vite preview` | `pwa.spec.ts` (5: offline real pela casca do PWA) |
| `producao` | 5184 | `dist/` (build de produção normal) | `producao.spec.ts` (`window.__mf` não existe) |

Os cenários conferem o banco central por SQL (`docker exec medicalfield-dev-pg psql …`) e criam pacientes e atendimentos de teste no banco de desenvolvimento.

Durabilidade do banco local (com `npm run dev` no ar): `node e2e/durabilidade/durabilidade.mjs sqlite-wasm`.

## Estrutura

```
src/
  banco/      porta ExecutorSql (Adapter): SQLite WASM + OPFS no navegador, plugin nativo no Android,
              memória nos testes; migrações SQL numeradas
  dados/      repositórios locais (Repository) e outbox (Command)
  sync/       cliente HTTP único, MonitorConectividade (Observer), sessão, MotorSincronizacao
  telas/      Entrar, Início, Pacientes, Prontuário, Atendimento, Passagem, Pendências, Ajustes
  ui/         moldura das telas, contexto React, formatação
  diagnostico.ts   porta de diagnóstico (só com VITE_DIAGNOSTICO=1)
e2e/          Playwright (backend real), capturas e teste de durabilidade
android/      projeto Android gerado pelo Capacitor
```
