# Acompanhamento da implementação

Status: `Pendente` · `Em andamento` · `Aguardando dependência` · `Em revisão` · `Bloqueado` · `Concluído`.
Uma tarefa só vira **Concluído** depois que o agente principal inspecionou o código, rodou os testes e conferiu o critério de aceite — não quando o agente diz que terminou.

Referências: [plano arquitetural](arquitetura/plano-arquitetural.md) · [contratos](contratos.md) · [enunciado](enunciado-final_project_as_2026b.pdf).

## Regras de coordenação

- Cada agente só escreve na própria área (coluna "Área"). Arquivos da raiz, `docs/contratos.md` e migrações já existentes são do agente principal.
- Contrato muda **primeiro** em `docs/contratos.md`, depois no código.
- Agentes não fazem `git commit`, `stash`, `checkout` nem `reset`. O agente principal faz commit por marco.
- Nada de dado real de paciente, segredo ou credencial no repositório.

## Ondas

| Onda | Em paralelo | Depende de |
| --- | --- | --- |
| 0 | Fundação (principal) | — |
| 1 | T1.1 Mike · T1.2 Cida + contratos + domínio · T1.3 Jaiminho · T1.4 Kubernetes · T1.5 Design system | Onda 0 |
| 2 | T2.1 Portal BradPitt · T2.2 App LuckyPatcher | T1.2, T1.5 |
| 3 | T3.1 Integração · T3.2 E2E dos 17 passos · T3.3 Cluster local completo | Ondas 1 e 2 |
| 4 | T4.1 QA e segurança · T4.2 Android · T4.3 Documentação final | Onda 3 |

## Tarefas

| ID | Tarefa | Responsável | Área | Depende | Aceite | Status |
| --- | --- | --- | --- | --- | --- | --- |
| T0.1 | Repositório, estrutura, `.gitignore`, workspaces | Principal | raiz | — | `git status` limpo após commit inicial | Concluído |
| T0.2 | Contrato único de API, erros, auth, env | Principal | `docs/contratos.md` | — | Cobre os 9 endpoints do enunciado + PDF/e-mail | Concluído |
| T0.3 | Migrações dos 4 schemas + banco de dev | Principal | `services/*/migrations`, `scripts/dev-db.sh`, `deploy/db` | — | `dev-db.sh subir && migrar` aplica tudo; `INSERT` manual em medicamento recebe `seq` | Concluído |
| T1.1 | MikeBaguncinha: login, refresh, JWKS, `/log`, auditoria, middleware | Agente Go | `services/mike-baguncinha` | T0 | Testes verdes; login → token EdDSA; linha em `log_acesso`; imagem constrói | Concluído |
| T1.2 | DonaCida + `packages/contratos` + `packages/dominio` | Agente TS | `services/dona-cida`, `packages/contratos`, `packages/dominio` | T0 | Todas as rotas da seção 6; idempotência e 4 estratégias testadas; imagem constrói | Concluído |
| T1.3 | Jaiminho: PDF, fila de e-mail, retentativa | Agente Python | `services/jaiminho` | T0 | PDF válido com QR; SMTP falho → retentativa → `ENVIADO`/`FALHA_DEFINITIVA`; imagem constrói | Concluído |
| T1.4 | Kustomize, Argo CD, CI, backup, imagem `web` | Agente K8s | `deploy/`, `.github/`, `docs/operacao` | T0 | `kubectl kustomize` dos overlays sem erro; script de cluster local | Concluído |
| T1.5 | Design system com Impeccable | Agente Design | `packages/ui`, `PRODUCT.md`, `DESIGN.md` | T0 | Tokens, tipografia, componentes base; contraste AA; paleta fora do azul/roxo padrão | Concluído |
| T2.1 | Portal BradPitt | Agente Portal | `apps/brad-pitt` | T1.2, T1.5 | Passos 1–4, 8, 10, 13, 15–17 pela interface | Concluído |
| T2.2 | App LuckyPatcher (offline-first, outbox, sync, simulador) | Agente App | `apps/lucky-patcher` | T1.2, T1.5 | Passos 5–7, 11, 12, 14; pendências sobrevivem a recarregar | Concluído |
| T3.1 | Subir tudo junto e corrigir incompatibilidades | Principal | todo | Ondas 1–2 | Fluxo ponta a ponta manual | Concluído |
| T3.2 | Playwright: roteiro de 17 passos | Principal | `e2e/` | T3.1 | Teste verde + relatório com evidências | Concluído |
| T3.3 | Implantação completa em k3s local | Principal + Agente K8s | `deploy/` | T3.1 | Pods prontos; dados sobrevivem a reinício de pod | Concluído |
| T4.1 | QA independente, segurança, testes T-01..T-25 | Agente QA | `docs/testes` | T3 | Relatório com evidência por teste; defeitos listados | Concluído |
| T4.2 | Empacotamento Android (Capacitor) | Agente App | `apps/lucky-patcher/android` | T2.2 | Projeto Android sincroniza; APK se houver SDK | Concluído |
| T4.3 | Entregáveis: arquitetura, API (OpenAPI + Postman), ER, roteiro | Principal | `docs/` | T3 | Os 3 entregáveis do checklist do enunciado | Concluído |

## Desvios do plano aprovado

| # | Desvio | Motivo |
| --- | --- | --- |
| 1 | Atendimento referencia `pessoaId`; o servidor resolve/cria o prontuário | Dois dispositivos podem criar prontuário para a mesma pessoa offline; com `prontuarioId` do cliente o atendimento seria rejeitado por chave estrangeira — viola "nunca rejeitar dado clínico". |
| 2 | Migrações rodam como administrador; o serviço usa papel restrito | Se o papel do serviço fosse dono das tabelas, o "somente inserção" da linha do tempo não valeria. |
| 3 | `profissional_nome` copiado no atendimento e no evento | A DonaCida não lê o schema `identidade`; o nome vem do token. |

## Ambiente de desenvolvimento (verificado)

Node 24, Python 3.14, Docker 28, kubectl 1.34 presentes. **Ausentes:** Go (compila e testa em contêiner `golang`), k3d/kind (cluster local com a imagem `rancher/k3s`), SDK Android (a confirmar na T4.2).

## Defeitos em aberto

Ver [KNOWN_ISSUES.md](KNOWN_ISSUES.md). Nenhum de severidade Crítica ou Alta.

## Bloqueios externos

- VM da Univates: sem acesso nesta sessão. A implantação real e o acesso público ficam documentados em `docs/operacao`, não executados.

## Onda 5 — correções do QA e regressão (concluída)

| ID | Tarefa | Responsável | Status |
| --- | --- | --- | --- |
| T5.1 | Corrigir D-QA-01, 03, 09, 12, 14, 18 no MikeBaguncinha | Agente Go | Concluído |
| T5.2 | Corrigir D-QA-06, 07, 17 e a carga condicional na DonaCida | Agente TS | Concluído |
| T5.3 | Corrigir D-QA-08, 13, 18 no Jaiminho | Agente Python | Concluído |
| T5.4 | Corrigir D-QA-02, 11, 16 no app | Agente App | Concluído |
| T5.5 | Corrigir D-QA-04, 05, 15, 19, 20 e `DADOS_DEMO` na infraestrutura | Principal | Concluído |
| T5.6 | Regressão completa em cluster recriado do zero | Principal | Concluído (E-010) |

## O que continua pendente (só externo)

1. Implantar na VM da Univates seguindo `docs/operacao/instalacao-vm.md` (levantar SO, RAM, root, saída para GitHub/GHCR).
2. Escolher o acesso público e o TLS (`docs/operacao/acesso-publico.md`).
3. Publicar o repositório no GitHub para o CI e o Argo CD sincronizarem de verdade.
4. Informar SMTP externo, se o e-mail tiver de chegar a uma caixa real.
5. Testar o APK num aparelho físico.
