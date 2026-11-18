# Registro de uso do Impeccable

O que foi de fato executado da skill `impeccable` na construção de `@medicalfield/ui`, o que cada etapa apontou e o que mudou por causa disso. Artefatos em `packages/ui/.impeccable/`.

Execução por agente, sem pessoa respondendo. Onde a skill pede resposta humana, isso está dito abaixo — nada foi simulado.

## 1. Preparação

| Etapa | Executado | Resultado |
| --- | --- | --- |
| Skill carregada pela ferramenta Skill | sim | `SKILL.md` + referências `init`, `new-work`, `operate`, `craft-floor`, `audit`, `polish` lidas por inteiro; `critique` lida até a orquestração |
| `impeccable context --target packages/ui` | sim | `NO_PRODUCT_MD`, `PRODUCT_INIT_REQUIRED`; sem geração de imagem neste ambiente → caminho **code-led** |
| Hook de design do Impeccable | ativo | escaneou cada arquivo editado; nenhum achado durante a construção |

## 2. `init` → `PRODUCT.md`

Escrito na raiz a partir do briefing, do plano arquitetural (A, B, I) e dos contratos (§6, §7). **A entrevista não aconteceu**: não havia ferramenta de pergunta; o arquivo declara isso no topo e marca o que é inferência.

## 3. `new-work` — direção visual

- Sete candidatos do mundo do público, por ressonância: (1) tira do monitor/desfibrilador, (2) gravador de voo (a "caixa-preta" literal), (3) pintura de alta visibilidade da ambulância, (4) cartão de triagem, (5) **ficha de APH em vias carbonadas**, (6) rótulos de ampola, (7) livro de regulação.
- `impeccable concept-seed --scope direction --mode operate` → chave **`dd18bb12`**, **índice atribuído 5**: a ficha em vias carbonadas. Seis desafiantes do catálogo foram pesados; cinco recusados e um competitivo (mosaico de alta densidade). De cada recusado ficou uma disciplina, registrada no payload:
  - dois valores no cromo (tinta e papel);
  - toda entrada numerada, a retificação cita o número;
  - estado como marca em célula fixa (vazada, meia, cheia, riscada);
  - no celular nada encolhe em miniatura;
  - movimento seco, de carimbo.
- `impeccable serve-question --start` → página de decisão servida (chave 97731683). **Expirou sem resposta**; seguiu a direção sorteada, como a skill manda para execução desassistida. Payload em `.impeccable/decision-payload.json`.
- Contrato de direção (THESIS, OWN-WORLD, STORY, FIRST VIEWPORT, FORM, FINISH) gravado com `impeccable surface-brief write` em `.impeccable/surfaces/vitrine-vitrine-tsx.md`.

Decisões que saíram daí: paleta sem nenhum matiz do protocolo de triagem (violeta de tinta copiativa, via rosa, carmim); tema escuro como "o carbono"; campo em caixa com rótulo no canto; seleção como bloco invertido; erro riscado em vez de apagado.

## 4. Inspeção renderizada (crítica própria sobre capturas)

Vitrine no ar, capturas com `playwright-core` + Chrome em 1440 px e 390 px, claro e escuro, olhadas uma a uma.

| Rodada | O que as imagens mostraram | Correção |
| --- | --- | --- |
| 1 | Tira de conectividade estourando em 390 px ("3 pendentes" sob a chave) | Detalhe encurtado, consulta de contêiner para aparelho estreito |
| 1 | Passagem de caso: bloco de triagem por cima do numeral do Glasgow; coluna vazia na grade | Grade explícita de 3/2/1 colunas por consulta de contêiner; descrição da triagem fora do bloco |
| 1 | Evento retificado: unidades pareciam sublinhadas | Unidade fora do risco (`inline-block`) |
| 1 | Coluna "Situação" cortada na tabela do portal | Coluna "Profissional" saiu da lista (está no detalhe); nome quebra linha |
| 1 | Ação primária desabilitada na primeira dobra do app — o violeta não aparecia | Botão sempre ativo; sem valor, mostra mensagem de erro |
| 1 | Rolagem horizontal de 210 px em 390 px; "Cinco regras" com seis itens; favicon 404 | Grades com `minmax(0,1fr)`; texto corrigido; ícone embutido |
| 1 | Bloco invertido errado com tema claro dentro de página escura | Seletores para um nível de tema aninhado |

## 5. `audit` (referência `audit.md`, feito no próprio fio)

| Dimensão | Nota | Achado principal → ação |
| --- | --- | --- |
| Acessibilidade | 3 → 4 | `prefers-reduced-motion` matava toda animação por regra global (a referência condena) → alternativas por componente: carimbo e esqueleto continuam (só cor/opacidade), giro vira pisca, entrada de diálogo/toast sem deslocamento |
| Desempenho | 4 | Só `transform`/`opacity`/cor animados; fontes variáveis em subconjuntos `unicode-range` |
| Responsivo | 3 → 4 | Botão do toast com 32 px no app → mínimo de 48 px no contexto de campo |
| Temas | 3 → 4 | Véu do diálogo com cor literal → token `--mf-veu` |
| Integridade | 4 | `impeccable detect --json src vitrine` → `[]` |

Contraste: `src/contraste.test.ts` lê o CSS real e confere 84 pares (claro, escuro e os dois blocos invertidos), AAA no texto principal.

## 6. Revisão de acabamento (`impeccable-finish-reviewer`, subagente isolado)

Disposição: **fix**. Oito correções materiais, todas aplicadas:

| # | Achado | Mudança |
| --- | --- | --- |
| 1 | **Escala da raiz**: `[data-tema]` no `<html>` definia `font-size` e tudo renderizava a 87,5% (alvo de 56 px saía com 49; tira de 48 com 42) | `font-size` nunca mais no `<html>` (`:not(html)`) |
| 2 | Textos pequenos ignoravam a densidade de campo | Tokens `--mf-pequeno`/`--mf-rotulo` por contexto, em todos os usos |
| 3 | Estado de erro com fundo rosa se confundia com a via rosa | Erro em fundo de papel, moldura carmim, ícone e palavra |
| 4 | Faltava o identificador da ficha no cabeçalho do app | "Ficha 7f3c9a12" (prefixo do UUID; o contrato não tem número de série — não foi inventado) |
| 5 | Marca de via com 10 px e sem palavra | Marca na coluna do carimbo, ~17 px no campo, com LOCAL / ENVIANDO / REJEITADO; confirmado segue quieto |
| 6 | Carmim em "Retificado pela nº" lia como alarme; violeta fora do escopo escrito | Etiquetas em tinta; carmim só para rejeição/erro; linha do contrato emendada |
| 7 | Tamanhos impressos na vitrine não batiam; "quatro marcas" com sete | Corrigido pela escala; linha de sync com exatamente quatro |
| 8 | Índice do portal rolava junto com a ficha | Índice preso à janela |

**Passe de veredito** (mesmo revisor, capturas refeitas): 7 resolvidas, 1 parcial, mais 3 regressões. Segundo lote aplicado:

- índice descontando a altura da faixa demonstrativa;
- coluna do carimbo com largura fixa (o `subgrid` fazia a linha do tempo reencaixar a cada mudança de estado);
- Glasgow em duas linhas (total; ocular/verbal/motora) em vez de órfã;
- linha "Estado de erro" da tabela de cor renomeada para o uso real.

**Este segundo lote não voltou ao revisor**: o orçamento da skill é de duas rodadas. Foi conferido só pelas capturas finais, testes e detector.

## 7. `document` (`impeccable-documenter`, subagente)

Escreveu `DESIGN.md` (raiz) e `.impeccable/design.json` a partir do código entregue, com as razões de contraste recalculadas dos valores hex. Depois dele, o detector passou a comparar o CSS com o `DESIGN.md` e apontou `border-radius: 1px` fora da escala (2 ocorrências) → trocado por `0`. Detector final: `[]`.

## 8. O que NÃO foi executado

- `critique` no formato completo (dois subagentes A/B isolados, pontuação de heurísticas, snapshot): substituído pela revisão de acabamento, que é o fecho que `new-work` prescreve.
- `polish`, `harden`, `adapt`, `animate`, `typeset`, `colorize`, `layout` como comandos separados: as referências `polish` e `audit` guiaram as correções, mas não houve passe formal de cada um.
- Rodada de comps (sem geração de imagem) e quadros QUALITY BAR do catálogo (não foram abertos).
- Modo `live`.
- Ping de telemetria do `concept-seed` (não houve rodada atendida).

## 9. Verificação final

`npm run typecheck -w @medicalfield/ui` e `npm test -w @medicalfield/ui` (114 testes) verdes; `npm run capturas` sem erro de console e sem rolagem horizontal em 1440 e 390; 11 capturas em `capturas/`.
