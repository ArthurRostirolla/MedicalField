# Impeccable no portal (BradPitt)

Registro do que foi **de fato executado** com a skill `impeccable` neste app e do que mudou por causa dela. Nada aqui foi inferido: cada item cita o comando ou a evidência.

## Como a skill foi usada

| Passo | O que rodou | Resultado |
| --- | --- | --- |
| Setup | `impeccable context --target apps/brad-pitt` (uma vez) | Carregou `PRODUCT.md` e `DESIGN.md` ("a ficha em vias carbonadas"). Nenhum `CONTEXT_STALE`. |
| Modo | Leitura de `SKILL.md` → modo **Operate** (ferramenta administrativa, somente leitura) | Refinamento sobre um sistema existente: o portal **preserva** a identidade de `packages/ui`; não houve redesenho nem `new-work`. |
| Piso de ofício | `reference/craft-floor.md`, lido antes da primeira edição de tela | Guiou composição, estados, cópia e as recusas (sem cartões de métrica, sem rótulo sobre título, sem modal fora do envio de e-mail). |
| Hook de design | O hook `[impeccable@1]` do detector rodou sozinho a cada arquivo de tela gravado | "No deterministic design-quality issues found" em todos os arquivos `.tsx` do app. |
| Detector | `impeccable detect --json src` (em `apps/brad-pitt`) | `[]` — nenhum achado determinístico. |
| Crítica | `reference/critique.md`, sobre as telas **renderizadas** do portal real (Playwright, backend real), em 1440 px e 390 px, temas claro e escuro | Ver "Crítica" abaixo. |
| Auditoria | `reference/audit.md` (5 dimensões), com `@axe-core/playwright` (WCAG 2.x A/AA) em cada tela renderizada, mais conferência de console e de rolagem horizontal | Ver "Auditoria" abaixo. |
| Polimento | `reference/polish.md` (triagem: tarefa bloqueada → estados → fluxo/responsivo → visual) | Ver "O que mudou". |

Conforme a skill pede, a verificação foi feita em **passes limitados**: uma rodada de inspeção em lote (41 capturas), uma leva de correções, uma rodada de confirmação. Não houve laço aberto de auto-revisão.

### Desvios do roteiro da skill (declarados)

- **Crítica em contexto único (degradada).** `critique.md` manda rodar a avaliação de design (A) e a de detector/navegador (B) em dois subagentes isolados. Aqui as duas rodaram no mesmo contexto, em sequência (A sobre as capturas antes de ler a saída do detector). O que se perde: o isolamento que impede o detector de ancorar o julgamento.
- **Sem sobreposição ao vivo.** O passo de injetar `detect.js` na página com `impeccable live-server` não foi executado; a evidência de navegador veio das capturas do Playwright e do axe.
- **Sem pontuação numérica.** As notas 0–4 das heurísticas de Nielsen e das dimensões da auditoria não foram calculadas nem gravadas com `critique-storage`; os achados abaixo são a lista real, sem nota.
- **Perguntas ao usuário puladas.** `Questions skipped: execução por agente, sem canal de pergunta ao cliente.`
- Fluxos **não** executados: `shape`, `live`, `animate`, `colorize`, `bolder`, `quieter`, `overdrive`, `delight`, `document` (o `DESIGN.md` da raiz já descreve o sistema; o portal não criou token novo).

## Crítica (telas renderizadas)

Capturas em `capturas/` (`<tela>-<largura>-<tema>.png`): login, atendimentos (lista), atendimento (ficha), diálogo de e-mail, prontuários, pessoa, medicamentos, logs, duplicatas, verificação de documento e um estado de erro.

O que se sustenta:

- **É o mesmo produto da vitrine.** A ficha do atendimento repete a composição de referência (`packages/ui/vitrine/composicoes.tsx`): livro à esquerda, via rosa da passagem de caso, ficha em PDF, pauta numerada. Nenhuma cor fora dos tokens; a triagem é o único bloco saturado da tela.
- **Fato, não conselho.** Não há cor de "valor alterado", alerta ou interpretação. A verificação de documento afirma só o que o servidor conferiu (o resumo criptográfico).
- **Estados completos.** Esqueleto, vazio (dizendo de onde o dado vem), erro com "Tentar de novo" e protocolo, e "Atualizar" em toda lista.

Achados e destino:

| # | Achado na tela renderizada | Destino |
| --- | --- | --- |
| 1 | Pessoa e Verificação: a grade de campos de leitura deixava células vazias no fim da linha (folha "banguela") | **Corrigido** — a grade passou a fechar a última linha |
| 2 | Ficha (390 px): a tabela de envios cortava a coluna "Tentativas" e precisava rolar | **Corrigido** — tentativas foram para a linha sob o selo de situação |
| 3 | Medicamentos (390 px): cinco colunas, linhas altas por causa de uma coluna fora da tela | **Corrigido** — três colunas de duas linhas (mesmo padrão da lista de atendimentos) |
| 4 | Livro de atendimentos: "mais recentes primeiro" não batia com a coluna "Início" (a API ordena por chegada à central) | **Corrigido na cópia** — "Últimos recebidos primeiro"; a ambiguidade do contrato está no relatório |
| 5 | Capturas de página inteira mostravam o índice lateral cortado em 900 px | **Corrigido no script** — a janela cresce até a altura do conteúdo, como em `packages/ui/vitrine/capturar.mjs` |
| 6 | Aba do navegador sempre "MedicalField — Portal", qualquer que fosse a tela | **Corrigido** — o título acompanha a seção |
| 7 | 390 px: prontuários (6 colunas) e logs (8 colunas) continuam rolando para os lados dentro da folha | **Mantido, de propósito** — são livros densos de uso em desktop; a página não rola, só a tabela, e a rolagem é alcançável por teclado (achado 9) |
| 8 | 390 px: o índice vira uma faixa horizontal e a marca sai da tela quando o item atual está à direita | **Não corrigido** — comportamento de `LayoutPortal` (`packages/ui`), fora da área deste app |

## Auditoria (técnica)

| Dimensão | Evidência | Achado |
| --- | --- | --- |
| Acessibilidade | axe (WCAG 2 A/AA, 2.1 AA, 2.2 AA) em 10 telas × 2 larguras × 2 temas | 2 violações reais, corrigidas (9 e 10). Resultado final: **0 violações** em todas as capturas |
| Acessibilidade — teclado | E2E abre o atendimento com foco na linha + Enter; teste de componente idem | Passa. Foco visível vem do design system |
| Tema | Nenhum hex no app; `estilos.css` do portal usa só `var(--mf-*)` | Limpo. Claro e escuro conferidos nas capturas |
| Responsivo | Asserção de `scrollWidth <= clientWidth` em toda captura | Nenhuma rolagem horizontal de página em 390 px |
| Console | Asserção de lista de erros vazia nos testes E2E | Sem erro no console (ver 11) |
| Desempenho | `vite build`: JS 472 kB (144 kB gzip), CSS 44 kB | Sem divisão de código por rota — aceitável para 7 telas; registrado como limitação |
| Integridade | `impeccable detect --json src` | `[]` |

Achados da auditoria:

| # | Achado | Destino |
| --- | --- | --- |
| 9 | `scrollable-region-focusable`: tabela larga em 390 px rolava para os lados sem ser alcançável por teclado (a região de rolagem é do `Tabela` do design system) | **Corrigido no app** com `RegiaoRolavel`: quando a tabela não cabe, a região vira focável e nomeada; quando cabe, não cria parada de tabulação. O defeito de origem está no relatório |
| 10 | `definition-list` / `dlitem`: os campos de leitura punham `<dt>/<dd>` a dois `<div>` de distância do `<dl>` | **Corrigido** — um único `<div>` por par |
| 11 | Erro 401 no console de toda visita anônima (o portal tentava o refresh sem saber se havia cookie) | **Corrigido** — uma marca sem segredo em `localStorage` diz se este navegador já entrou; sem ela, não há chamada |
| 12 | Alvos de 36 px (`--mf-alvo-portal`) ficam abaixo dos 44 px que `audit.md` sugere | **Mantido** — é a densidade de portal definida no `DESIGN.md`; passa o mínimo de 24 px da WCAG 2.2 AA |

## O que mudou no código por causa do Impeccable

- `src/comum/CamposLeitura.tsx` + `src/estilos.css` (`.bp-campos`): grade que fecha a última linha; estrutura `<dl>` válida (achados 1 e 10).
- `src/atendimentos/FichaPdfEnvios.tsx`: coluna "Situação e tentativas" (achado 2).
- `src/medicamentos/TelaMedicamentos.tsx`: três colunas de duas linhas (achado 3).
- `src/atendimentos/TelaAtendimentos.tsx`, `src/prontuarios/DetalhePessoa.tsx`: cópia da ordenação (achado 4).
- `src/comum/RegiaoRolavel.tsx` (novo) e seu uso nas quatro tabelas (achado 9).
- `src/api/cliente.ts`: marca de sessão e `restaurarSessao` (achado 11).
- `src/casca/Casca.tsx`: `document.title` por seção (achado 6).
- `e2e/capturas.spec.ts`: captura na altura do conteúdo e porta de acessibilidade com axe (achado 5 e auditoria).

## Como repetir

```bash
# backend real no ar (bash scripts/dev-servicos.sh subir) e MF_SENHA_DEMO definida
npm run e2e -w @medicalfield/brad-pitt -- capturas   # regrava capturas/ e roda axe + console + rolagem
~/.claude/skills/impeccable/scripts/impeccable detect --json apps/brad-pitt/src
```
