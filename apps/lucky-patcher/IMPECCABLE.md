# Impeccable no LuckyPatcher — o que foi executado de fato

Registro honesto do uso da skill `impeccable` neste app. Contexto usado: `PRODUCT.md` e `DESIGN.md` da raiz (já existentes). Modo da superfície: **Operate** (o profissional está numa tarefa).

## 1. Execução

| Passo | Como foi feito | Resultado |
| --- | --- | --- |
| Carregar a skill | Ferramenta `Skill` → `impeccable` | Instruções lidas |
| `impeccable context` | Launcher da skill, com `cwd` em `apps/lucky-patcher` | Carregou `PRODUCT.md` e `DESIGN.md` (herdados da raiz) |
| Referências lidas antes de editar interface | `reference/craft-floor.md`, `reference/operate.md` | — |
| Hook de design | O hook `impeccable@1` rodou sozinho a cada arquivo de interface gravado | "No deterministic design-quality issues found" em todas as gravações |
| Construção | Telas compostas só com componentes de `@medicalfield/ui`, `data-contexto="campo"`, seguindo a composição de referência (`packages/ui/vitrine/composicoes.tsx`) e as capturas `app-390-*.png` | — |
| Capturas do app REAL | `e2e/capturas.spec.ts` (Playwright, Chrome, backend real): 14 telas × 390 e 1280 px × claro e escuro = 56 imagens em `capturas/` | Sem erro no console, sem rolagem horizontal |
| `critique` — Avaliação A (revisão de design) | Subagente isolado, sobre as imagens e o código | 27/40 nas heurísticas de Nielsen; 0 P0, 5 P1, 12 P2, 9 P3 |
| `critique` — Avaliação B (detector + navegador) | Subagente isolado: `impeccable detect --json src` e `index.html`; 56 medições no navegador (transbordo, alvos, truncamento, contraste, semântica, teclado, console, `prefers-reduced-motion`); *overlay* do detector na tela de entrada | Detector CLI: 0 achados. Medições: 6 falhas reais. *Overlay*: 3 avisos (1 falso positivo, 2 da faixa demonstrativa do design system) |
| `audit` | Feito junto com a Avaliação B (mesmas medições; ver notas abaixo) | — |
| `polish` / `harden` / `adapt` | Um lote único de correções sobre os achados, depois **uma** rodada de capturas para conferir | Lista abaixo |

O que **não** foi feito: a persistência do *snapshot* da crítica (`impeccable critique-storage`), o modo `live` e uma segunda rodada de crítica depois das correções (a skill manda parar em uma rodada de conferência). As perguntas finais do fluxo `critique` não se aplicam: `Questions skipped: execução por agente, sem usuário na conversa`.

Não avaliados por imagem (só por leitura de código): painéis Retificar e Encerrar, atendimento encerrado, erros de campo, sessão expirada, diálogos e toasts. A tela de Pendências com rejeição é exercitada pelo cenário 7 do Playwright, mas não tem captura.

## 2. Notas do `audit` (0–4)

| Dimensão | Nota | Evidência |
| --- | --- | --- |
| Acessibilidade | 3 (medida antes do lote; não remedida depois) | Contraste mínimo medido 7,38:1 (claro) e 8,81:1 (escuro); 0 controle sem nome; 1 `h1` e 1 `main` por tela; foco visível em toda parada. Falhas (corrigidas): foco coberto pela barra de abas, área de toque do campo, falta de "pular para o conteúdo" |
| Desempenho | 3 | Sem animação de layout; 1 bloco JS de 555 kB (169 kB gzip) + SQLite WASM de 879 kB, ambos guardados pelo service worker. Não dividido em blocos |
| Responsivo | 4 | 0 px de transbordo nas 56 medições; alvos ≥ 44 px exceto os dois itens corrigidos |
| Temas | 4 | Só tokens de `@medicalfield/ui`; nenhum hex no app; claro e escuro conferidos |
| Integridade | 4 | Detector limpo; composição específica do produto |

## 3. O que mudou por causa da crítica e da auditoria

**Segurança do registro (P1)**

- A passagem de caso mostrava "Últimos sinais vitais: Não registrado" depois de uma retificação parcial. A causa está em `packages/dominio` (o resumo descarta o evento retificado e não lê `dadosCorrigidos`), fora da área deste app. Contorno no app: ao retificar sinais vitais, a grade já vem com os valores originais ("confira todos") e são gravados **dois** registros — a retificação e os sinais vitais corrigidos — de modo que a passagem volta a ter a medida.
- Medicação retificada deixou de aparecer em "Já administrado neste atendimento".
- A linha "… gravado, nº NN" não fica mais presa ao trocar de tipo de registro (parecia confirmar o painel errado) e não reserva mais um vão vazio.
- Lista de pacientes: homônimos sem dados agora mostram "Cadastrado em dd/mm hh:mm" (ou a descrição do não identificado) em vez de uma frase igual em todas as linhas.
- Caminho de emergência: o formulário de novo paciente ganhou "Queixa principal" e "Local da ocorrência" (antes o atendimento nascia sem eles) e recolheu o resto do prontuário em "Mais do prontuário"; alergias continuam à vista.

**Clareza (P2)**

- "Sincronizar agora" fica desabilitado, com a explicação ao lado, quando a simulação de offline está ligada.
- "Já administrado" e "Alergias registradas" deixaram de usar a caixa de campo digitável: agora são uma pauta de leitura.
- Os recolhíveis ("Endereço do servidor", "Contato de emergência") ganharam caixa, seta e alvo de 56 px; antes pareciam links.
- Prontuário: campo e botão "Adicionar" com a mesma altura; rótulo "Nova medicação" (não quebra mais); "Cadastro" mostra só as linhas que têm dado, em vez de sete travessões.
- Início: "Atendimentos em aberto" subiu para logo abaixo da ação principal.
- Desktop: cabeçalho, tira de conectividade e abas passaram a ocupar a mesma coluna do conteúdo (antes a tira esticava por 1280 px e separava o estado da chave).
- Busca: o "×" nativo azul saiu; entrou o botão "Limpar busca" do sistema.
- Glasgow: resposta motora em 3 + 3 (o detalhe de cada opção deixou de ter 11 px espremidos em seis colunas).
- Triagem e Glasgow: o botão mantém o nome da ação e a instrução aparece como mensagem ao tentar registrar sem escolher (antes a instrução estava num botão desabilitado, que some sob sol).
- Pendências: "Medicação · Nome do paciente" em vez de "Evento: Medicação".

**Auditoria**

- `scroll-padding` na página: o que recebe foco pelo teclado não fica mais atrás da barra de abas nem do topo fixos.
- Área de toque do campo de texto: rótulo e entrada preenchem a caixa inteira (antes só 32 px dos 63 px respondiam).
- "Pular para o conteúdo" e título do documento por tela.
- Glicemia ocupa as duas colunas (fecha a grade); `textarea` sem alça de redimensionar; "Gravar endereço" só habilita quando o valor muda; identificador do dispositivo abreviado.

Primeira passada própria, antes da crítica: grade do login (o `style` de `CampoTexto` vai para o `<input>`, não para a caixa), nome do paciente truncado pelo botão do cabeçalho (o botão "Passagem de caso" desceu para a linha do "voltar"), concordância ("Retificação gravada"), 401 no console antes do login (o monitor não consulta mais o servidor sem sessão).

## 4. Achados recusados ou não atendidos

- Abas "Atendimento/Passagem" como na composição de referência: mantidas Início/Pacientes/Pendências/Ajustes, porque o brief pede essas telas; a passagem fica a um toque, na linha do "voltar".
- Rolagem própria da linha do tempo no desktop: não feito (a coluna de registro já fica fixa).
- "Mostrar senha", edição de cadastro existente, triagem na linha do atendimento em aberto: não feitos.
- Primário lavanda muito luminoso no tema escuro, texto de 11 px no `detalhe` do segmentado e nos níveis de triagem, quebra de "Manchester · Muito urgente" na via rosa, `.mf-gira` animando sob `prefers-reduced-motion`: são de `packages/ui`, fora da área deste app — relatados ao agente principal.
- `all-caps-body` e `repeating-stripes-gradient` do *overlay*: são a faixa "DADOS DEMONSTRATIVOS", exigida pelo brief e definida no design system. `text-occlusion`: falso positivo (rótulo dentro de um recolhível fechado).
