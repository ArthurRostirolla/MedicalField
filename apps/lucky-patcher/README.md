# LuckyPatcher — app do profissional de saúde

App Offline-First do MedicalField (o usuário vê "MedicalField"): React Native com **Expo** — app instalado (Android e iOS) e PWA no navegador (react-native-web), com o mesmo código. Toda escrita é uma transação no SQLite local (dado + comando no outbox + log); a rede é resolvida depois pelo motor de sincronização.

**DADOS DEMONSTRATIVOS — SEM VALIDADE CLÍNICA.**

- Arquitetura offline: [`docs/arquitetura/plano-arquitetural.md`](../../docs/arquitetura/plano-arquitetural.md), seção H. Contratos: [`docs/contratos.md`](../../docs/contratos.md).
- Banco local no navegador e teste de durabilidade: [`docs/durabilidade.md`](docs/durabilidade.md).
- App instalado (Android e iOS): [`docs/nativo.md`](docs/nativo.md).
- Revisão de interface: [`IMPECCABLE.md`](IMPECCABLE.md).

## Rodar

Com o backend no ar (`bash scripts/dev-servicos.sh subir`, na raiz):

```bash
npm install -w @medicalfield/lucky-patcher
npm run web -w @medicalfield/lucky-patcher        # http://localhost:5182/app/
npm run android -w @medicalfield/lucky-patcher    # Android (expo run:android)
npm run ios -w @medicalfield/lucky-patcher        # iOS (expo run:ios; macOS + Xcode)
```

| Comando (`-w @medicalfield/lucky-patcher`) | O que faz |
| --- | --- |
| `npm run web` | Metro (Expo web) em 5182, com proxy de `/api` para os três serviços (`metro.config.js`). Diagnóstico **ligado** (`.env.development`) |
| `npm run dev` | `expo start` (Expo Go / dev client / web) |
| `npm run android` / `npm run ios` | `expo run:<plataforma>`: gera `android/` ou `ios/` (prebuild, não versionados) e instala no emulador/simulador |
| `npm run build` | Build web de produção em `dist/` (`expo export` + service worker). Diagnóstico **desligado** (a não ser que `EXPO_PUBLIC_DIAGNOSTICO=1` esteja no ambiente) |
| `npm run build:diagnostico` | O mesmo build, com o diagnóstico ligado, em `dist-diagnostico/` (usado pelo cenário de PWA) |
| `npm run worker` | Compila o Worker do SQLite web para `public/` (o Metro não empacota Workers; os builds já chamam) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | vitest: motor de sincronização e outbox sobre SQLite real em memória, porta de diagnóstico, painéis de registro |
| `npm run e2e` | Playwright contra o backend real (precisa de `MF_SENHA_DEMO`; usa o Chrome instalado) |

## Porta de diagnóstico (`window.__mf`)

Os testes de ponta a ponta precisam conferir o banco local do app. Para isso existe uma porta de diagnóstico — e ela **não faz parte do build de produção**.

**Quando existe.** Só quando o pacote é construído com o diagnóstico ligado:

| Como o pacote é gerado | `window.__mf` |
| --- | --- |
| `npm run build` (produção) | **não existe** — o código da porta nem entra no pacote |
| `npm run web` / `npm run dev` | existe |
| `npm run build:diagnostico` | existe |
| qualquer build com `EXPO_PUBLIC_DIAGNOSTICO=1` no ambiente | existe |
| app instalado (Android/iOS) | não existe (a porta é só da web) |

**Imagem `web`.** `deploy/web/Dockerfile` recebe o *build-arg* `VITE_DIAGNOSTICO` (repassado ao app como `EXPO_PUBLIC_DIAGNOSTICO`). A imagem de **demonstração** (cluster local, onde rodam o roteiro automatizado e os testes de QA) é construída com `--build-arg VITE_DIAGNOSTICO=1`; a imagem de **produção** é construída sem o argumento e não expõe nada.

**O que ela faz, quando existe.** É somente leitura de verdade, e não entrega a sessão:

- `__mf.consultar(sql, params?)` aceita **um único `SELECT`**. `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`, `PRAGMA` e mais de um comando por chamada são recusados com erro (`Diagnóstico somente leitura: …`). No navegador a consulta ainda roda com `PRAGMA query_only` ligado: o próprio SQLite recusa escrita.
- Qualquer consulta que cite a tabela `sync_estado` é recusada: é lá que fica a sessão (access e refresh token).
- `__mf.estado(chave)` devolve as chaves de `sync_estado` que não são segredo: `cursor`, `dispositivo_id`, `ultima_sync`, `modo_simulado`, `servidor`. `sessao` é recusada.

Código em `src/diagnostico.ts`; testes em `src/diagnostico.test.ts`, `e2e/sync.spec.ts` (cenário 10) e `e2e/producao.spec.ts` (build de produção sem a porta).


## Testes de ponta a ponta

```bash
# na raiz; a senha de demonstração está em apps/mike-baguncinha/README.md
MF_SENHA_DEMO='…' npm run e2e -w @medicalfield/lucky-patcher
```

O Playwright sobe sozinho três servidores (e reaproveita os que já estiverem no ar):

| Projeto | Porta | O que serve | Cenários |
| --- | --- | --- | --- |
| `dev` | 5182 | Expo web (Metro) | `sync.spec.ts` (1–4, 6–10), `capturas.spec.ts` |
| `pwa` | 5183 | `dist-diagnostico/` por `scripts/servir.mjs` | `pwa.spec.ts` (5: offline real pela casca do PWA) |
| `producao` | 5184 | `dist/` (build de produção normal) | `producao.spec.ts` (`window.__mf` não existe) |

Os cenários conferem o banco central por SQL (`docker exec medicalfield-dev-pg psql …`) e criam pacientes e atendimentos de teste no banco de desenvolvimento.

Durabilidade do banco local (com `npm run web` no ar): `node e2e/durabilidade/durabilidade.mjs sqlite-wasm`.

## Estrutura

```
app/          rotas (expo-router); (app)/ exige sessão
src/
  banco/      porta ExecutorSql (Adapter): SQLite WASM + OPFS no navegador (Worker), expo-sqlite com
              SQLCipher no aparelho (Android/iOS), memória nos testes; migrações numeradas
  plataforma.ts / plataforma.web.ts   escolha do banco e da rede por plataforma (sufixo do Metro)
  dados/      repositórios locais (Repository) e outbox (Command)
  sync/       cliente HTTP único, MonitorConectividade (Observer), sessão, MotorSincronizacao
  telas/      Entrar, Início, Pacientes, Prontuário, Atendimento, Passagem, Pendências, Ajustes
  ui/         moldura das telas, contexto React, formatação
  ui/ds/      design system em React Native (mesmos nomes e papéis do @medicalfield/ui da web)
  diagnostico.ts   porta de diagnóstico (só na web, com EXPO_PUBLIC_DIAGNOSTICO=1)
plugins/      config plugin do endurecimento nativo (Android: backup e HTTP; iOS: ATS)
scripts/      worker do SQLite, build web + service worker, servidor estático local
e2e/          Playwright (backend real), capturas e teste de durabilidade
```
