---
name: MedicalField
description: Branco clínico com detalhes em vermelho — design system do prontuário de emergência offline-first (portal e app de campo).
colors:
  # Tema claro — a 1ª via (papel)
  mesa: "#f6f7f9"
  papel: "#ffffff"
  papel-2: "#f7f8fa"
  inverso: "#1b2129"
  sobre-inverso: "#ffffff"
  tinta: "#161b22"
  tinta-2: "#3d4653"
  tinta-3: "#5e6775"
  fio: "#e4e7ec"
  fio-forte: "#868f9c"
  marca: "#c8102e"
  marca-forte: "#a00c25"
  marca-suave: "#fdeef0"
  sobre-marca: "#ffffff"
  foco: "#c8102e"
  rosa: "#fff7f8"
  rosa-fio: "#eab3bc"
  rosa-tinta: "#a30d2a"
  carmim: "#b42318"
  carmim-suave: "#fdf0ee"
  # Tema escuro — o papel-carbono
  escuro-mesa: "#0d1014"
  escuro-papel: "#151a20"
  escuro-papel-2: "#1c222a"
  escuro-inverso: "#e8ecf1"
  escuro-sobre-inverso: "#151a20"
  escuro-tinta: "#eef1f5"
  escuro-tinta-2: "#c3cad4"
  escuro-tinta-3: "#97a1ae"
  escuro-fio: "#2b323c"
  escuro-fio-forte: "#6e7887"
  escuro-marca: "#ff6b7f"
  escuro-marca-forte: "#ff9aa8"
  escuro-marca-suave: "#3b1820"
  escuro-sobre-marca: "#1a0a0e"
  escuro-foco: "#ff6b7f"
  escuro-rosa: "#22161a"
  escuro-rosa-fio: "#5e2f39"
  escuro-rosa-tinta: "#ffb0bb"
  escuro-carmim: "#ff8a7a"
  escuro-carmim-suave: "#3a1714"
  # Bloco invertido dentro do tema claro
  invertido-papel: "#fdeef0"
  invertido-papel-2: "#fbe1e5"
  invertido-tinta: "#161b22"
  invertido-tinta-2: "#3d4653"
  invertido-tinta-3: "#545d6b"
  invertido-fio: "#f2c9cf"
  invertido-fio-forte: "#8e5560"
  invertido-marca: "#b00e2a"
  invertido-marca-forte: "#8a0a20"
  invertido-marca-suave: "#f9d5db"
  invertido-sobre-marca: "#ffffff"
  invertido-foco: "#b00e2a"
  invertido-carmim: "#9b1c14"
  invertido-carmim-suave: "#fbe3e0"
  # Bloco invertido dentro do tema escuro
  invertido-escuro-papel: "#2a1419"
  invertido-escuro-papel-2: "#33181e"
  invertido-escuro-tinta: "#eef1f5"
  invertido-escuro-tinta-2: "#d5dae1"
  invertido-escuro-tinta-3: "#a9b1bc"
  invertido-escuro-fio: "#4d2a32"
  invertido-escuro-fio-forte: "#9a7880"
  invertido-escuro-marca: "#ff8a99"
  invertido-escuro-marca-forte: "#ffb3bd"
  invertido-escuro-marca-suave: "#4a1d27"
  invertido-escuro-sobre-marca: "#1a0a0e"
  invertido-escuro-foco: "#ff8a99"
  invertido-escuro-carmim: "#ff9d8f"
  invertido-escuro-carmim-suave: "#47201b"
  # Triagem — código clínico, igual nos dois temas
  tri-vermelho: "#c4161c"
  tri-vermelho-texto: "#ffffff"
  tri-laranja: "#f07d12"
  tri-laranja-texto: "#1a1320"
  tri-amarelo: "#f6d21a"
  tri-amarelo-texto: "#1a1320"
  tri-verde: "#1b7a3a"
  tri-verde-texto: "#ffffff"
  tri-azul: "#1d5bb5"
  tri-azul-texto: "#ffffff"
  tri-preto: "#101010"
  tri-preto-texto: "#ffffff"
typography:
  numeral-g:
    fontFamily: "'Archivo Variable', 'Segoe UI', system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 720
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "'tnum', 'lnum'"
    fontVariation: "'wdth' 76"
  numeral:
    fontFamily: "'Archivo Variable', 'Segoe UI', system-ui, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 720
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "'tnum', 'lnum'"
    fontVariation: "'wdth' 76"
  titulo-1:
    fontFamily: "'Archivo Variable', 'Segoe UI', system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 780
    lineHeight: "2.25rem"
    fontVariation: "'wdth' 86"
  titulo-2:
    fontFamily: "'Archivo Variable', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 780
    lineHeight: "1.75rem"
    fontVariation: "'wdth' 80"
  titulo-3:
    fontFamily: "'Archivo Variable', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 750
    lineHeight: "1.5rem"
    fontVariation: "'wdth' 88"
  campo:
    fontFamily: "'Archivo Variable', 'Segoe UI', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  corpo:
    fontFamily: "'Archivo Variable', 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  pequeno:
    fontFamily: "'Archivo Variable', 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "1.125rem"
  rotulo:
    fontFamily: "'Archivo Variable', 'Segoe UI', system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 650
    lineHeight: "1rem"
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 78"
  dado:
    fontFamily: "'Martian Mono Variable', ui-monospace, 'Cascadia Mono', monospace"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: "1.125rem"
    letterSpacing: "-0.01em"
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 80"
rounded:
  "0": "0"
  "1": "4px"
  "2": "8px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "6": "1.5rem"
  "8": "2rem"
  "12": "3rem"
  recuo-portal: "0.75rem"
  recuo-campo: "1rem"
  alvo-portal: "2.25rem"
  alvo-campo: "3.5rem"
components:
  botao-secundario:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.1}"
    padding: "0 0.9375rem"
    height: "{spacing.alvo-portal}"
  botao-secundario-hover:
    backgroundColor: "{colors.papel-2}"
    textColor: "{colors.tinta}"
  botao-primario:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.papel}"
    rounded: "{rounded.1}"
    padding: "0 0.9375rem"
    height: "{spacing.alvo-portal}"
  botao-primario-hover:
    backgroundColor: "{colors.tinta-2}"
    textColor: "{colors.papel}"
  botao-fantasma:
    backgroundColor: "transparent"
    textColor: "{colors.tinta}"
    rounded: "{rounded.1}"
  botao-perigo:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.carmim}"
    rounded: "{rounded.1}"
  botao-perigo-hover:
    backgroundColor: "{colors.carmim-suave}"
    textColor: "{colors.carmim}"
  botao-desabilitado:
    backgroundColor: "{colors.papel-2}"
    textColor: "{colors.tinta-3}"
  campo:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.1}"
    padding: "0.375rem 0.75rem 0.4375rem"
  campo-desabilitado:
    backgroundColor: "{colors.papel-2}"
    textColor: "{colors.tinta-3}"
  campo-numerico:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    typography: "{typography.numeral}"
    rounded: "{rounded.1}"
  segmentado-opcao:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    height: "{spacing.alvo-portal}"
  segmentado-opcao-selecionada:
    backgroundColor: "{colors.inverso}"
    textColor: "{colors.sobre-inverso}"
  etiqueta:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-2}"
    rounded: "{rounded.1}"
    padding: "0 0.375rem"
  etiqueta-cheia:
    backgroundColor: "{colors.inverso}"
    textColor: "{colors.sobre-inverso}"
    rounded: "{rounded.1}"
  triagem-vermelho:
    backgroundColor: "{colors.tri-vermelho}"
    textColor: "{colors.tri-vermelho-texto}"
    rounded: "{rounded.1}"
    padding: "0 0.5rem 0 0.375rem"
    height: "1.375rem"
  triagem-laranja:
    backgroundColor: "{colors.tri-laranja}"
    textColor: "{colors.tri-laranja-texto}"
    rounded: "{rounded.1}"
  triagem-amarelo:
    backgroundColor: "{colors.tri-amarelo}"
    textColor: "{colors.tri-amarelo-texto}"
    rounded: "{rounded.1}"
  triagem-verde:
    backgroundColor: "{colors.tri-verde}"
    textColor: "{colors.tri-verde-texto}"
    rounded: "{rounded.1}"
  triagem-azul:
    backgroundColor: "{colors.tri-azul}"
    textColor: "{colors.tri-azul-texto}"
    rounded: "{rounded.1}"
  triagem-preto:
    backgroundColor: "{colors.tri-preto}"
    textColor: "{colors.tri-preto-texto}"
    rounded: "{rounded.1}"
  selo-sync:
    backgroundColor: "transparent"
    textColor: "{colors.tinta-2}"
    typography: "{typography.rotulo}"
  selo-sync-pendente:
    textColor: "{colors.marca}"
  selo-sync-rejeitado:
    textColor: "{colors.carmim}"
  passagem:
    backgroundColor: "{colors.rosa}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.0}"
  secao:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.0}"
    padding: "{spacing.recuo-portal}"
  tabela-cabecalho:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta-2}"
    typography: "{typography.rotulo}"
    padding: "0.4375rem 0.75rem 0.375rem"
  tabela-linha-selecionada:
    backgroundColor: "{colors.invertido-papel}"
    textColor: "{colors.invertido-tinta}"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.tinta}"
    height: "2.25rem"
    padding: "0 1rem"
  nav-item-atual:
    backgroundColor: "{colors.invertido-papel}"
    textColor: "{colors.invertido-tinta}"
  dialogo:
    backgroundColor: "{colors.papel}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.2}"
    width: "min(32rem, calc(100vw - 2rem))"
  toast:
    backgroundColor: "{colors.invertido-papel}"
    textColor: "{colors.invertido-tinta}"
    rounded: "{rounded.2}"
    width: "min(26rem, 100%)"
---

# Design System: MedicalField

Registro feito depois da construção, a partir do código entregue em `packages/ui` (`src/tokens.css`, `src/base.css`, `src/componentes.css`, `src/componentes/*.tsx`, `vitrine/`). Os valores do frontmatter são normativos; a prosa explica onde e por que cada um é usado. As razões de contraste foram calculadas pela fórmula WCAG 2.x a partir dos hex dos arquivos de token, e os mesmos pares são conferidos por máquina em `packages/ui/src/contraste.test.ts`.

## Overview

**Creative North Star: "A ficha em vias carbonadas"**

O atendimento é uma ficha de APH preenchida a tinta em papel autocopiativo. Nada se apaga: o erro é riscado com um traço e a entrada nova cita o número que corrige. Todo registro diz em quantas vias já existe — só neste aparelho, a caminho, ou confirmado na central. O tema claro é a 1ª via (papel frio quase branco, tinta berinjela-preta); o tema escuro é o papel-carbono, para a noite dentro da ambulância.

A interface é feita de fio de 1 px, caixa com rótulo no canto, pauta numerada e cabeçalho de fio grosso. Há dois contextos de densidade com o mesmo vocabulário: o portal (desktop, sentado, listas densas, corpo 14 px, controle de 36 px) e o app de campo (celular, luva, sol, corpo 17 px, alvo de 56 px). A cor é escassa de propósito: quase tudo se resolve em dois valores de tinta sobre papel, para que o código clínico de triagem seja a única cor saturada em bloco na tela.

O sistema recusa o painel de cartões azul e branco com métricas no topo, o "visual médico" genérico, gradiente, vidro e cartão arredondado.

### Princípios

1. **Tinta e papel.** Todo o cromo usa dois valores. Cor fica reservada ao código clínico e aos estados que pedem ação.
2. **Bloco chapado é triagem.** Só a triagem usa bloco de cor saturada, sempre com forma e palavra. Nada mais no sistema se parece com ela.
3. **Estado é marca em célula fixa.** Vazada, meia, cheia, riscada. A marca de sincronização fica sempre no mesmo lugar e não depende de cor.
4. **Nada se apaga.** O evento retificado continua na pauta, riscado com um traço, e a retificação cita o número que corrige.
5. **Invertido é "agora".** Bloco de tinta com texto de papel marca o item atual, a opção escolhida e a condição offline.
6. **Fato, não conselho.** A interface mostra o que foi registrado e quando. Não há alerta, sugestão de dose nem cor de "valor alterado".

**Key Characteristics:**
- Papel frio e tinta berinjela-preta em dois valores; violeta de tinta copiativa só para ação, link, foco e registro ainda não confirmado.
- Bloco chapado em matiz saturado é exclusivo da triagem, sempre com forma geométrica e palavra.
- Sincronização como marca circular em célula fixa: vazada, meia, cheia, riscada.
- Campo em caixa de fio de 1 px com rótulo em caixa-alta condensada no canto; caixas vizinhas dividem o mesmo fio.
- Cantos de 2 px; nenhuma sombra fora de diálogo e toast.
- Seleção e "agora" são bloco invertido de tinta, nunca tinta colorida.
- Movimento seco de 120 ms; a entrada nova "bate" na linha como carimbo.
- Dois contextos de densidade (portal e `data-contexto="campo"`) sobre a mesma escala em rem.

## Colors

Papel e tinta em dois valores, mais três tintas de função (violeta copiativo, via rosa, carmim) e o código clínico de triagem, que não pertence à marca.

**Por que esta paleta.** Papel e tinta berinjela-preta em dois valores formam todo o cromo. O violeta de tinta copiativa, a via rosa e o carmim foram escolhidos porque nenhum deles ocupa um matiz do protocolo de triagem (vermelho, laranja, amarelo, verde, azul, preto); assim, marca e estados de interface nunca podem ser confundidos com o código clínico. O teste `contraste.test.ts` guarda isso: nenhum token de marca, rosa ou carmim repete um valor do protocolo.

### Primary
- **Violeta de tinta copiativa** (`marca`, claro #5a2a8c / escuro #c9a9f3): o que está em curso ou pede ação — ação primária, link, anel de foco, cursor de texto, seleção de texto, selo "local" e "enviando", contagem de pendências. Hover da ação primária e do link usa `marca-forte`. `marca-suave` é a mancha do carimbo e o estado pressionado do botão de passo.

### Secondary
- **Via rosa** (`rosa`, claro #f7dde5 / escuro #2b1623, com `rosa-fio` e `rosa-tinta`): a cópia rosa da ficha. É a superfície da passagem de caso e de mais nada. `rosa-tinta` colore o título e os rótulos dentro dela; `rosa-fio` desenha seus fios e o tracejado do topo.

### Tertiary
- **Carmim** (`carmim`, claro #a3114a / escuro #ff93b6, com `carmim-suave`): rejeição e erro — selo "rejeitado", mensagem e contorno de campo inválido, estado de erro, ícone do toast de erro, contagem de rejeitadas. O build também o usa no contorno e no texto do botão de perigo (ação destrutiva), com `carmim-suave` no hover.

### Neutral
- **Mesa** (`mesa`): fundo atrás das folhas.
- **Papel** (`papel`): a folha — superfície principal de seção, campo, tabela, diálogo, barras.
- **Papel 2** (`papel-2`): hover de linha e de controle, campo e botão desabilitados.
- **Tinta, tinta 2, tinta 3** (`tinta`, `tinta-2`, `tinta-3`): texto principal; texto de apoio, rótulos e ícones de tipo; placeholder, número da entrada e texto desabilitado.
- **Fio** (`fio`): pauta e divisória. **Fio forte** (`fio-forte`): contorno de controle, com 3:1 ou mais contra o papel.
- **Inverso / sobre-inverso** (`inverso`, `sobre-inverso`): o bloco de tinta com texto de papel — opção marcada do segmentado, checkbox e chave ligados, etiqueta cheia, amostras.

### Contraste medido: tema claro

| Texto | Fundo | Razão | Mínimo testado | Uso |
| --- | --- | --- | --- | --- |
| tinta #1a1320 | papel #fbfafc | 17,43:1 | 7 | Texto principal |
| tinta #1a1320 | papel-2 #f2f0f5 | 16,03:1 | 7 | Texto em linha alternada, hover |
| tinta #1a1320 | mesa #eceaf0 | 15,19:1 | 7 | Texto sobre o fundo |
| tinta-2 #453c50 | papel #fbfafc | 10,01:1 | 7 | Apoio, rótulos |
| tinta-2 #453c50 | papel-2 #f2f0f5 | 9,21:1 | 4,5 | Apoio em hover |
| tinta-2 #453c50 | mesa #eceaf0 | 8,73:1 | 4,5 | Apoio sobre o fundo |
| tinta-3 #665d72 | papel #fbfafc | 5,98:1 | 4,5 | Placeholder, nº da entrada |
| tinta-3 #665d72 | papel-2 #f2f0f5 | 5,50:1 | 4,5 | Texto desabilitado |
| sobre-marca #ffffff | marca #5a2a8c | 9,79:1 | 4,5 | Ação primária |
| sobre-marca #ffffff | marca-forte #46206f | 12,38:1 | 4,5 | Ação primária em hover |
| marca #5a2a8c | papel #fbfafc | 9,41:1 | 4,5 | Link, selo local/enviando |
| marca #5a2a8c | papel-2 #f2f0f5 | 8,65:1 | 4,5 | Link em hover de linha |
| marca #5a2a8c | marca-suave #ebe3f4 | 7,85:1 | 4,5 | Marca sobre a mancha do carimbo |
| tinta #1a1320 | marca-suave #ebe3f4 | 14,53:1 | 7 | Texto durante o carimbo |
| carmim #a3114a | papel #fbfafc | 7,38:1 | 4,5 | Erro, rejeição |
| carmim #a3114a | carmim-suave #fbe6ee | 6,45:1 | 4,5 | Botão de perigo em hover |
| tinta #1a1320 | carmim-suave #fbe6ee | 15,25:1 | 7 | Texto sobre carmim suave |
| fio-forte #7b7289 | papel #fbfafc | 4,38:1 | 3 | Contorno de controle |
| foco #5a2a8c | papel #fbfafc | 9,41:1 | 3 | Anel de foco |
| foco #5a2a8c | mesa #eceaf0 | 8,20:1 | 3 | Anel de foco sobre o fundo |
| sobre-inverso #fbfafc | inverso #1a1320 | 17,43:1 | 7 | Seleção, etiqueta cheia |
| tinta #1a1320 | rosa #f7dde5 | 14,19:1 | 7 | Texto da passagem de caso |
| tinta-2 #453c50 | rosa #f7dde5 | 8,15:1 | 7 | "Não registrado" na via rosa |
| rosa-tinta #7a2146 | rosa #f7dde5 | 7,70:1 | 4,5 | Título e rótulos da via rosa |
| rosa-fio #c98aa0 | rosa #f7dde5 | 2,15:1 | 1,5 | Fio interno (não é texto) |

### Contraste medido: tema escuro

| Texto | Fundo | Razão | Mínimo testado | Uso |
| --- | --- | --- | --- | --- |
| tinta #ede8f3 | papel #18121f | 15,23:1 | 7 | Texto principal |
| tinta #ede8f3 | papel-2 #211929 | 14,11:1 | 7 | Texto em hover |
| tinta #ede8f3 | mesa #0f0b14 | 16,17:1 | 7 | Texto sobre o fundo |
| tinta-2 #c0b7cc | papel #18121f | 9,51:1 | 7 | Apoio, rótulos |
| tinta-2 #c0b7cc | papel-2 #211929 | 8,81:1 | 4,5 | Apoio em hover |
| tinta-2 #c0b7cc | mesa #0f0b14 | 10,10:1 | 4,5 | Apoio sobre o fundo |
| tinta-3 #988ea7 | papel #18121f | 5,91:1 | 4,5 | Placeholder, nº da entrada |
| tinta-3 #988ea7 | papel-2 #211929 | 5,47:1 | 4,5 | Texto desabilitado |
| sobre-marca #1a1320 | marca #c9a9f3 | 9,03:1 | 4,5 | Ação primária |
| sobre-marca #1a1320 | marca-forte #dcc6f8 | 11,64:1 | 4,5 | Ação primária em hover |
| marca #c9a9f3 | papel #18121f | 9,13:1 | 4,5 | Link, selo local/enviando |
| marca #c9a9f3 | papel-2 #211929 | 8,46:1 | 4,5 | Link em hover de linha |
| marca #c9a9f3 | marca-suave #2f2241 | 7,33:1 | 4,5 | Marca sobre a mancha do carimbo |
| tinta #ede8f3 | marca-suave #2f2241 | 12,23:1 | 7 | Texto durante o carimbo |
| carmim #ff93b6 | papel #18121f | 8,82:1 | 4,5 | Erro, rejeição |
| carmim #ff93b6 | carmim-suave #3a1526 | 7,68:1 | 4,5 | Botão de perigo em hover |
| tinta #ede8f3 | carmim-suave #3a1526 | 13,26:1 | 7 | Texto sobre carmim suave |
| fio-forte #807492 | papel #18121f | 4,22:1 | 3 | Contorno de controle |
| foco #c9a9f3 | papel #18121f | 9,13:1 | 3 | Anel de foco |
| foco #c9a9f3 | mesa #0f0b14 | 9,69:1 | 3 | Anel de foco sobre o fundo |
| sobre-inverso #18121f | inverso #ede8f3 | 15,23:1 | 7 | Seleção, etiqueta cheia |
| tinta #ede8f3 | rosa #2b1623 | 14,04:1 | 7 | Texto da passagem de caso |
| tinta-2 #c0b7cc | rosa #2b1623 | 8,77:1 | 7 | "Não registrado" na via rosa |
| rosa-tinta #f2aec7 | rosa #2b1623 | 9,39:1 | 4,5 | Título e rótulos da via rosa |
| rosa-fio #74395a | rosa #2b1623 | 1,99:1 | 1,5 | Fio interno (não é texto) |

### Contraste medido: bloco invertido

Dentro de `.mf-invertido` valem os tokens do tema oposto, então qualquer componente funciona ali sem variante própria. É o item atual da navegação (portal e barra do app), a linha selecionada da tabela, o estado "Offline" da tira de conectividade e o toast. O bloco invertido redefine papel e tinta, não a mesa nem a via rosa.

| Texto | Fundo | No tema claro (bloco escuro) | No tema escuro (bloco claro) | Mínimo testado |
| --- | --- | --- | --- | --- |
| tinta | papel | #fbfafc / #1a1320 — 17,43:1 | #18121f / #ede8f3 — 15,23:1 | 7 |
| tinta | papel-2 | #fbfafc / #2a2133 — 14,80:1 | #18121f / #dcd5e5 — 12,83:1 | 7 |
| tinta-2 | papel | #d3cbdd / #1a1320 — 11,53:1 | #3f3649 / #ede8f3 — 9,50:1 | 7 |
| tinta-2 | papel-2 | #d3cbdd / #2a2133 — 9,79:1 | #3f3649 / #dcd5e5 — 8,01:1 | 4,5 |
| tinta-3 | papel | #aba1b9 / #1a1320 — 7,37:1 | #5a5066 / #ede8f3 — 6,29:1 | 4,5 |
| tinta-3 | papel-2 | #aba1b9 / #2a2133 — 6,25:1 | #5a5066 / #dcd5e5 — 5,30:1 | 4,5 |
| sobre-marca | marca | #1a1320 / #c9a9f3 — 9,03:1 | #ffffff / #5a2a8c — 9,79:1 | 4,5 |
| sobre-marca | marca-forte | #1a1320 / #dcc6f8 — 11,64:1 | #ffffff / #46206f — 12,38:1 | 4,5 |
| marca | papel | #c9a9f3 / #1a1320 — 9,03:1 | #5a2a8c / #ede8f3 — 8,13:1 | 4,5 |
| marca | papel-2 | #c9a9f3 / #2a2133 — 7,66:1 | #5a2a8c / #dcd5e5 — 6,85:1 | 4,5 |
| marca | marca-suave | #c9a9f3 / #35264a — 6,84:1 | #5a2a8c / #d9cdea — 6,47:1 | 4,5 |
| tinta | marca-suave | #fbfafc / #35264a — 13,21:1 | #18121f / #d9cdea — 12,11:1 | 7 |
| carmim | papel | #ff93b6 / #1a1320 — 8,72:1 | #a3114a / #ede8f3 — 6,37:1 | 4,5 |
| carmim | carmim-suave | #ff93b6 / #3a1526 — 7,68:1 | #a3114a / #f3d3df — 5,55:1 | 4,5 |
| tinta | carmim-suave | #fbfafc / #3a1526 — 15,35:1 | #18121f / #f3d3df — 13,27:1 | 7 |
| fio-forte | papel | #8f84a0 / #1a1320 — 5,16:1 | #6f657d / #ede8f3 — 4,55:1 | 3 |
| foco | papel | #c9a9f3 / #1a1320 — 9,03:1 | #5a2a8c / #ede8f3 — 8,13:1 | 3 |

### Triagem (código clínico)

As cores de triagem pertencem ao protocolo, não à marca. São iguais nos dois temas e sempre aparecem como bloco chapado com forma geométrica e palavra em caixa-alta; a escolha é do profissional, o sistema não sugere. Manchester usa vermelho, laranja, amarelo, verde e azul; START usa vermelho, amarelo, verde e preto.

| Cor | Bloco | Texto do rótulo | Razão do rótulo | Forma | Protocolos | Bloco × papel claro | Bloco × papel escuro |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vermelho | #c4161c | #ffffff | 6,04:1 | Losango | Manchester, START | 5,80:1 | 3,04:1 |
| Laranja | #f07d12 | #1a1320 | 6,60:1 | Triângulo | Manchester | 2,64:1 | 6,68:1 |
| Amarelo | #f6d21a | #1a1320 | 12,22:1 | Quadrado | Manchester, START | 1,43:1 | 12,36:1 |
| Verde | #1b7a3a | #ffffff | 5,40:1 | Círculo | Manchester, START | 5,19:1 | 3,40:1 |
| Azul | #1d5bb5 | #ffffff | 6,53:1 | Hexágono | Manchester | 6,28:1 | 2,81:1 |
| Preto | #101010 | #ffffff | 19,03:1 | Cruz em X | START | 18,29:1 | 1,04:1 |

Todos os rótulos passam AA (4,5:1), conferido em teste. O contorno do bloco (`--mf-triagem-contorno`) é a tinta clara a 55% no tema escuro e dentro do bloco invertido escuro, onde preto, azul e vermelho se aproximam do fundo; no tema claro ele é transparente. Limitação medida, não regra: no papel claro a borda do bloco amarelo (1,43:1) e do laranja (2,64:1) fica abaixo de 3:1, e a leitura se apoia na forma e na palavra dentro do bloco.

### Sincronização

Quatro estados, quatro marcas num círculo de mesmo tamanho e na mesma posição; o rótulo em caixa-alta acompanha a marca. "Confirmado" é o estado normal e o mais quieto: na linha do tempo ele mostra só a marca (a palavra continua para leitor de tela e em `title`). As mesmas marcas servem a outros ciclos com outro rótulo (envio de e-mail: na fila, enviando, enviado, falha definitiva).

| Estado | Marca | Cor | Razão sobre o papel (claro / escuro) |
| --- | --- | --- | --- |
| local | Círculo vazado (contorno de 2 px) | marca | 9,41:1 / 9,13:1 |
| enviando | Meio círculo cheio, alternando em dois passos | marca | 9,41:1 / 9,13:1 |
| confirmado | Círculo cheio | tinta-2 | 10,01:1 / 9,51:1 |
| rejeitado | Círculo com X | carmim | 7,38:1 / 8,82:1 |

### Named Rules

**Regra do Bloco Chapado.** Bloco sólido em matiz saturado de triagem (vermelho, laranja, amarelo, verde, azul, preto do protocolo) só existe na etiqueta e no seletor de triagem, sempre com forma e palavra. Etiqueta genérica é contorno; o único bloco cheio fora da triagem é o invertido de tinta, e ele nunca leva forma de triagem.

**Regra da Via Rosa.** Superfície rosa é a passagem de caso e só ela. O rosa aparece fora dela apenas como a segunda folha do símbolo da marca.

**Regra do Carmim.** Carmim significa rejeição ou erro (e o contorno do botão de perigo). Nunca é destaque, decoração ou cor de valor clínico.

**Regra da Cor Acompanhada.** Nenhum significado viaja só na cor: triagem leva forma e palavra, sincronização leva marca e rótulo, offline leva bloco invertido, ícone e palavra, erro leva ícone e texto.

## Typography

**Display Font:** Archivo Variable (com 'Segoe UI', system-ui, sans-serif) — a mesma família faz título, numeral e corpo; não há face de exibição separada.
**Body Font:** Archivo Variable (com 'Segoe UI', system-ui, sans-serif)
**Label/Mono Font:** Martian Mono Variable (com ui-monospace, 'Cascadia Mono', monospace)

**Character:** Archivo com o eixo de largura (`wdth`) dá, numa só família, o rótulo condensado de formulário, o numeral estreito de leitura à distância e o corpo em largura normal. Martian Mono, condensada a 80%, fica só no que é dado de máquina: horário, número da entrada, código da ficha, contagem.

As duas fontes são auto-hospedadas via `@fontsource-variable/archivo/wdth.css` e `@fontsource-variable/martian-mono/wdth.css` (SIL Open Font License), importadas em `src/estilos.css`. Nada vem de CDN em tempo de execução: o app funciona sem rede. A largura é aplicada com `font-stretch` (72% a 90% no build).

### Hierarchy

A escala é fixa em rem, razão aproximada de 1,2. A hierarquia vem de peso, largura e caixa antes de tamanho.

- **Numeral grande** (`numeral-g`, 720, 3.5rem / 56 px, altura 1, largura 76%, tabular e alinhado): numeral de leitura à distância em destaque.
- **Numeral** (`numeral`, 720, 2.5rem / 40 px, altura 1, largura 76%): valor do campo numérico no app de campo e total do Glasgow na passagem de caso. No portal o campo numérico usa 1.75rem (28 px).
- **Título 1** (`titulo-1`, 780, 2rem / 2.25rem, largura 86%) e **Título 2** (`titulo-2`, 780, 1.5rem / 1.75rem, largura 80%): degraus da escala usados até aqui só na vitrine; pesos e larguras são os que ela mostra.
- **Título 3** (`titulo-3`, 750, 1.25rem / 1.5rem, largura 86–90%): título da página no portal, título do app, nome do paciente na passagem de caso.
- **Corpo do app** (`campo`, 400, 1.0625rem / 1.5rem — 17/24): texto corrido em `data-contexto="campo"`; com peso 700 é o título de diálogo e de estado vazio. Linha de até 60ch.
- **Corpo do portal** (`corpo`, 400, 0.875rem / 1.25rem — 14/20): texto corrido do portal. Em caixa-alta, peso 750, largura 82% e espaçamento 0,07em é o título de seção. Linha de até 68ch.
- **Pequeno** (`pequeno`, 400, 0.8125rem / 1.125rem — 13/18; 15/20 no campo): ajuda de campo, autor do evento, célula de tabela, paginação.
- **Rótulo** (`rotulo`, 650, 0.6875rem / 1rem — 11 px; 12 px no campo; espaçamento 0,06em, caixa-alta, largura 78%): rótulo de campo, legenda de grupo, cabeçalho de coluna, termo de leitura (`dt`), título de grupo da navegação, etiquetas e selos (largura 80%).
- **Dado** (`dado`, Martian Mono 600, 0.8125rem / 1.125rem, largura 80%, espaçamento -0,01em, tabular): hora do evento; em 11 px e peso normal, número da entrada, contagens e códigos.

Pesos em uso: 400 corpo, 500 valor digitado e detalhe, 550 item de navegação, 600 seletor e chave, 650 botão e rótulo, 700 títulos curtos e leituras, 720 numeral, 750 título de página, seção e triagem, 800 nome da marca e título da via rosa. Larguras em uso: 72% nome da marca, 76% numeral, 78% rótulo, 80% etiqueta, selo e dado, 82% triagem e título de seção, 84% valor de leitura, 86–90% títulos e opção do segmentado.

### Densidade: portal e campo

O contexto padrão é o portal. O app de campo liga `data-contexto="campo"` num contêiner (o `LayoutApp` já faz isso) e os mesmos componentes crescem.

| Token | Portal (padrão) | Campo (`data-contexto="campo"`) |
| --- | --- | --- |
| Altura de controle (`--mf-alvo`) | 2.25rem (36 px) | 3.5rem (56 px; mínimo 48) |
| Corpo (`--mf-corpo` / altura) | 0.875rem / 1.25rem | 1.0625rem / 1.5rem |
| Rótulo (`--mf-rotulo`) | 0.6875rem | 0.75rem |
| Pequeno (`--mf-pequeno` / altura) | 0.8125rem / 1.125rem | 0.9375rem / 1.25rem |
| Numeral de campo (`--mf-numeral`) | 1.75rem | 2.5rem |
| Recuo (`--mf-recuo`) | 0.75rem | 1rem |
| Caixa do checkbox | 1.25rem | 1.75rem |
| Trilho da chave | 2.75rem × 1.5rem | 3.5rem × 2rem |

### Named Rules

**Regra da Raiz Intocada.** O `font-size` do `<html>` fica em 100%. Tema e contexto aplicam tamanho de corpo em contêineres (`[data-tema]`, `[data-contexto]`), nunca na raiz: mudar a raiz mudaria o valor de 1rem e toda a escala.

**Regra do Numeral Tabular.** Todo numeral de dado é tabular: `table`, `time`, `.mf-num`, `.mf-dado` e `.mf-numeral` aplicam `tabular-nums` (com `lining-nums` no numeral grande). Sinal vital, horário e contagem não dançam de largura.

**Regra da Mono Restrita.** Martian Mono é para o que a máquina carimba (hora, nº da entrada, código, contagem). Texto de pessoa, rótulo e valor clínico ficam em Archivo.

## Layout

Espaço em múltiplos de 4 px sobre a escala padrão do Tailwind v4 (0.25rem por passo); os passos que o build repete são 4, 8, 12, 16, 24, 32 e 48 px. Dentro dos componentes o recuo é o token de contexto (`--mf-recuo`: 0.75rem no portal, 1rem no campo). Entre blocos de uma tela o build usa 0.75rem a 1rem dentro de um formulário e 1.5rem entre seções. O ritmo é o de uma ficha: blocos encostados, separados por fio, não por faixas de espaço vazio.

**Portal.** Grade de duas colunas: índice lateral de 14.5rem em papel, com fio de 2 px de tinta à direita, e conteúdo. Cabeçalho da página com 3.5rem de altura mínima e fio de 1 px embaixo; área principal com 1.5rem de recuo. A partir de 64rem o índice fica fixo na altura da janela. Abaixo de 64rem a grade vira uma coluna, o índice vira uma tira horizontal rolável com itens de 3rem, os títulos de grupo e o rodapé de usuário somem e o recuo cai para 1rem. A composição da vitrine é livro de registros à esquerda e ficha aberta à direita (6fr / 7fr a partir de 80rem), com a via rosa no topo da ficha.

**App de campo.** Coluna única. Topo fixo com o cabeçalho (3.5rem, título truncado em uma linha, subtítulo em pequeno) e a linha de conectividade (2rem, discreta: ponto, estado e pendências; um toque abre o detalhe com "Simular offline"); conteúdo; barra inferior fixa de abas com 3.5rem, fio de 2 px de tinta em cima e respeito a `safe-area-inset-bottom`. A aba atual é bloco invertido.

**Pontos de quebra.** `md` 48rem, `lg` 64rem, `xl` 80rem. Componentes que vivem em colunas de largura variável respondem ao próprio contêiner, não à janela: a tira de conectividade aperta abaixo de 24rem sem esconder palavra; a grade da passagem de caso cai de 3 para 2 colunas abaixo de 36rem e para 1 abaixo de 20rem; o seletor de triagem cai para 2 colunas abaixo de 40rem.

## Elevation & Depth

O sistema é plano. A profundidade vem de três planos de papel (mesa atrás, papel na frente, papel-2 para hover e desabilitado) e de fio: 1 px para pauta e contorno, 2 px de tinta para cabeçalho de seção, de tabela, de diálogo, de linha do tempo e para a borda do índice e da barra de abas. Sombra projetada existe só no que flutua sobre a tela.

### Shadow Vocabulary
- **Sobreposição, tema claro** (`box-shadow: 0 1px 0 #d2ccdb, 0 16px 40px -12px rgb(26 19 32 / 0.35)`): diálogo e toast.
- **Sobreposição, tema escuro** (`box-shadow: 0 0 0 1px #807492, 0 20px 48px -12px rgb(0 0 0 / 0.7)`): diálogo e toast; o anel de 1 px separa a folha do fundo escuro.
- **Véu do diálogo** (`rgb(15 11 20 / 0.6)` no claro, `rgb(0 0 0 / 0.7)` no escuro): fundo inerte atrás do diálogo nativo.

`box-shadow` também desenha fio sem deslocar layout — o segundo fio do campo inválido e do estado de erro (`inset 0 0 0 1px` em carmim), os fios internos da via rosa, o anel do carimbo. Isso é traço, não elevação.

### Named Rules

**Regra da Folha Plana.** Seção, campo, tabela, etiqueta e botão não têm sombra em nenhum estado. Hover troca papel por papel-2 e fio-forte por tinta; nada sobe.

## Shapes

Geometria de formulário impresso. Canto de 2 px em controles e etiquetas (botão, caixa de campo, opção de ponta do segmentado, checkbox, trilho da chave, etiqueta, bloco de triagem, contador da aba); 3 px em sobreposições (diálogo, toast); canto vivo (0) em seção, via rosa, tira de conectividade, estado vazio, tabela e nas caixas de uma grade de ficha. O círculo aparece só nas marcas de sincronização e na forma "verde" da triagem, desenhados em SVG.

Fios: 1 px `fio` para pauta e divisória; 1 px `fio-forte` para contorno de controle; 1.5 px em checkbox e chave; 2 px `tinta` para cabeçalhos; duplo de 3 px fechando o evento de encerramento; tracejado para o que está desabilitado (campo, checkbox, chave), para o estado vazio e para o topo destacável da via rosa. Caixas vizinhas dividem o mesmo fio (margem negativa de 1 px), como campos de uma ficha.

Formas com significado: seis formas fixas de triagem (losango, triângulo, quadrado, círculo, hexágono, cruz em X) e quatro marcas de sincronização (vazada, meia, cheia, riscada). O símbolo da marca são duas folhas sobrepostas — a folha de papel com duas linhas de pauta e um ponto violeta, e a cópia rosa atrás. Ícones vêm de um único conjunto de traço (lucide-react), sempre com função: tipo de evento, ação, estado.

Não há textura nem hachura: superfícies lisas, separadas por fio.

## Components

### Movimento (comum a todos)

Seco, de carimbo, sem coreografia. Duração padrão de 120 ms (`--mf-duracao`) com a curva `cubic-bezier(0.2, 0, 0, 1)` (`ease-seco`), aplicada a cor de fundo, de fio e de texto; o botão pressionado desce 1 px.

- **Carimbo.** A entrada recém-registrada (`data-recente`) "bate" na linha: 900 ms (`--mf-duracao-carimbo`), começa com fundo `marca-suave` e anel interno de 2 px em `marca`, o anel some aos 35% e o fundo seca até transparente. Uma vez, sem deslocamento.
- **Marca "enviando".** O meio círculo alterna entre dois lados: rotação de 180° em `steps(2, jump-none)`, ciclo de 1 s. Dois passos, sem giro contínuo.
- **Carregando.** Indicador que gira em 8 passos por volta (0,9 s); esqueleto que pisca em dois passos entre opacidade 1 e 0,45 (1,2 s), sem brilho deslizante.
- **Entrada de sobreposição.** Diálogo e toast surgem em 120 ms com 6 px de subida e opacidade.
- **Movimento reduzido** (`prefers-reduced-motion: reduce`): toda transição cai para 0,01 ms e a rolagem suave é desligada; o indicador que gira vira o pisca de dois passos; a marca "enviando", o diálogo e o toast ficam sem animação (a marca meia continua dizendo o estado). O carimbo e o pisca do esqueleto permanecem, porque só mudam cor e opacidade, sem deslocamento.

### Foco (comum a todos)

Anel de 3 px sólido na cor `foco`, afastado 2 px (`:focus-visible`), com 8,1:1 ou mais contra papel e mesa em todos os temas e no bloco invertido. Na caixa de campo o fio vira `foco` e o anel fica rente (afastamento -1 px, por `:focus-within`). Em linha de tabela, item de navegação e aba o anel é interno (-3 px) para não ser cortado. Controles com `input` oculto (segmentado, triagem, checkbox) mostram o anel no bloco visível. Todo componente funciona por teclado.

### Buttons
Firmes e planos: fio, papel e peso 650.
- **Shape:** canto de 2 px, fio de 1 px, altura mínima do contexto (36 px portal / 56 px campo), recuo lateral de 1,25 × `--mf-recuo`, ícone de 1,15em à esquerda.
- **Primário:** fundo `marca`, texto `sobre-marca`. Uma única ação primária por tela; no app, em largura total abaixo dos campos.
- **Secundário (padrão):** papel com fio `fio-forte`. **Fantasma:** sem fio nem fundo, para cancelar e fechar. **Perigo:** fio e texto em carmim, fundo `carmim-suave` no hover. **Só ícone:** quadrado na altura do contexto, com `aria-label`.
- **Hover / Focus:** hover troca fundo para `papel-2` e fio para `tinta` (primário: `marca-forte`); ativo desce 1 px; foco é o anel comum.
- **Desabilitado / Carregando:** `papel-2`, fio `fio`, texto `tinta-3`. Carregando mantém o rótulo, troca o ícone pelo indicador e ignora cliques (`aria-busy`).

### Chips
Duas famílias que não se misturam.
- **Etiqueta:** contorno de 1 px na cor do texto, caixa-alta condensada de 11 px, canto de 2 px. Tons: neutra (`tinta-2`), marca (pendente), carmim (rejeitado) e cheia (bloco invertido, para "aberto" e "retifica nº"). Nunca bloco em matiz de triagem.
- **Etiqueta de triagem:** bloco chapado na cor do protocolo, forma à esquerda, nome da cor em caixa-alta de peso 750; opcionalmente o nome do nível no protocolo depois de um fio vertical. Tamanho pequeno (22 px de altura) em tabela e linha do tempo; grande (40 px) na passagem de caso e no seletor. O nome do nível é rótulo do protocolo, não interpretação do sistema.
- **Selo de sincronização:** marca + rótulo, sem caixa. Ver a tabela de sincronização em Colors.

### Cards / Containers
Não há cartão. O contêiner é a folha.
- **Seção:** papel com fio de 1 px, canto vivo, cabeçalho de 2.75rem com título em caixa-alta e fio de 2 px de tinta embaixo; corpo com `--mf-recuo`, ou rente (sem recuo) para tabela e linha do tempo. Não se aninha uma seção em outra.
- **Shadow Strategy:** nenhuma (ver Elevation & Depth).
- **Estado vazio:** fio tracejado, alinhado à esquerda, ícone, título e uma frase que diz o que aparece ali e como fazer aparecer (até 60ch). **Estado de erro:** fio duplo em carmim, ícone, o que falhou, o que fazer, botão "Tentar de novo" e o protocolo em mono para o suporte.
- **Esqueleto:** barras de 0.75rem na cor do fio, piscando em dois passos.

### Inputs / Fields
Caixa de ficha: o rótulo mora dentro da caixa, no canto.
- **Style:** fio de 1 px `fio-forte`, canto de 2 px, papel; rótulo em caixa-alta condensada no alto, valor embaixo em peso 500, unidade ou sufixo à direita. Hover escurece o fio para `tinta`. Numa grade de ficha (`.mf-grade-campos`) as caixas perdem o canto e dividem o fio.
- **Focus:** fio e anel de 3 px na cor `foco`, rente à caixa.
- **Error / Disabled:** erro dobra o fio em carmim e mostra ícone + mensagem em carmim de peso 600 que diz o problema e como resolver; ajuda em `tinta-2`. Desabilitado usa `papel-2`, fio tracejado e texto `tinta-3`.
- **Campo numérico:** valor em numeral (28 px portal / 40 px campo), aceita vírgula ou ponto e setas ↑/↓; passos − e + opcionais com alvo de 48 px ou mais; placeholder "—" em `fio-forte`. A faixa mínimo/máximo é limite de digitação plausível, não avaliação clínica.
- **Select:** controle nativo com seta, para abrir o seletor do sistema no celular.
- **Seletor segmentado:** grupo de rádio em células coladas que dividem o fio; a opção marcada é bloco invertido; detalhe opcional em linha menor.
- **Seletor de triagem:** grupo de rádio em que cada opção é o próprio bloco de triagem grande com descrição; a escolhida ganha contorno de 3 px de tinta afastado 2 px e um visto.
- **Checkbox e chave:** caixa de 2 px de canto com visto, cheia de tinta quando marcada; chave retangular cujo cursor desliza — o estado aparece pela posição, não só pela cor.

### Navigation
- **Índice do portal:** itens de 2.25rem com ícone de 1rem, peso 550, contagem em mono à direita, títulos de grupo em rótulo. Hover em `papel-2`; item atual em bloco invertido com peso 700 e `aria-current`.
- **Barra do app:** abas de 3.5rem com ícone de 1.375rem sobre rótulo em caixa-alta; aba atual em bloco invertido; contagem de pendências em bloco `marca` com numeral mono.
- **Paginação:** resumo à esquerda, "Anterior" e "Próxima" à direita (a API pagina por cursor).

### Tira de conectividade
Permanente no app, 3rem de altura, entre fios de `fio-forte`. Três células: estado (ícone, "Online"/"Offline" em caixa-alta de peso 750 e detalhe: hora da última sync, "simulado" ou "sem rede"), pendências (marca de sync + "Tudo enviado" / "N pendentes" em `marca`, rejeitadas em carmim com ícone) e a chave "Simular offline". Offline transforma a célula de estado em bloco invertido.

### Linha do tempo
Pauta numerada que abre com fio de 2 px de tinta e separa as entradas com fio de 1 px. À esquerda, o carimbo: hora em mono de peso 600, "nº 00" em mono `tinta-3` e a marca de via sempre no mesmo lugar. À direita: ícone e tipo em rótulo, o corpo (leituras com termo em rótulo e valor de peso 700 tabular; triagem com a etiqueta; medicação com nome em negrito) e o autor em pequeno. A coluna do carimbo tem a largura da maior marca da lista. Entrada retificada fica riscada com um traço de 1.5 px e recebe a etiqueta "Retificado pela nº N"; a retificação leva a etiqueta cheia "Retifica nº N". O encerramento fecha com fio duplo. No app a ordem é mais recente primeiro, sem mudar a numeração.

### Passagem de caso (a via rosa)
A única superfície rosa. Fio `rosa-fio`, canto vivo; topo com o título em caixa-alta de peso 800 em `rosa-tinta` e fio tracejado embaixo; faixa do paciente (nome em título 3, queixa principal); grade de células separadas por fio interno — triagem, Glasgow com numeral de 40 px, alergias em caixa-alta de peso 750, últimos sinais vitais, medicações, procedimentos, comorbidades, medicações contínuas, encerramento — cada uma com rótulo em `rosa-tinta` e hora em mono. O que não foi registrado aparece como "Não registrado" / "Nenhuma registrada" em `tinta-2`. Só fato e horário, nenhuma interpretação.

### Tabela
Livro de registros: células de 13 px com recuo de 0.375rem × 0.75rem, cabeçalho fixo em rótulo com fio de 2 px de tinta, linhas separadas por fio de 1 px, sem zebra. Linha clicável ganha `papel-2` no hover e responde a Enter e Espaço; a linha aberta no detalhe é bloco invertido. Números e horários alinham à direita. Rola na horizontal dentro do próprio contêiner.

### Diálogo e toast
- **Diálogo:** `<dialog>` nativo (foco preso, Esc fecha, clique no véu fecha), largura de até 32rem, canto de 3 px, cabeçalho com fio de 2 px e botão fantasma de fechar, ações à direita com a principal por último. Só para o que pede interrupção.
- **Toast:** bloco invertido de até 26rem, no canto inferior direito, com ícone, título de peso 700, descrição e ação curta. O tom vem do ícone e do texto. Erro não some sozinho; os demais somem em 6 s.

## Do's and Don'ts

### Do:
- **Do** — resolva a tela em tinta sobre papel primeiro; acrescente violeta só no que está em curso ou pede ação (ação primária, link, foco, registro não confirmado).
- **Do** — use bloco invertido (`.mf-invertido`) para "agora": item atual, opção escolhida, linha aberta, offline, toast.
- **Do** — mostre a triagem sempre como bloco + forma + palavra (`EtiquetaTriagem`), nas cores do protocolo, iguais nos dois temas.
- **Do** — mantenha a marca de sincronização na célula fixa do carimbo, com rótulo visível em todo estado que não seja "confirmado".
- **Do** — risque o evento retificado e cite o número; a entrada antiga continua na pauta.
- **Do** — ligue `data-contexto="campo"` num contêiner para telas de campo: alvos de 56 px (mínimo 48), corpo 17/24, texto principal em 7:1 ou mais.
- **Do** — use numeral tabular em sinal vital, horário e contagem; Martian Mono só em hora, nº da entrada, código e contagem.
- **Do** — separe com fio (1 px pauta, 2 px de tinta em cabeçalho) e deixe caixas vizinhas dividirem o mesmo fio; canto de 2 px em controle, 3 px em sobreposição, vivo em folha.
- **Do** — acrescente todo par novo de texto e fundo a `contraste.test.ts` com o mínimo que ele deve cumprir (7 texto principal, 4,5 texto, 3 contorno e foco).
- **Do** — escreva o erro dizendo o que falhou e o que fazer; escreva o vazio dizendo o que aparece ali.

### Don't:
**O que NÃO fazer.**
- **Don't** — nada de "interface médica azul e branca" nem painel de cartões com métricas no topo. Azul aqui é só o nível azul do Manchester.
- **Don't** — nada de gradiente de cor, em fundo, botão ou texto.
- **Don't** — nada de vidro: sem `backdrop-filter`, sem desfoque, sem superfície translúcida. O único translúcido é o véu chapado do diálogo.
- **Don't** — nada de grade de cartões arredondados. O contêiner é a seção de canto vivo com fio; canto nunca passa de 3 px; seção não se aninha em seção.
- **Don't** — nenhum bloco sólido em matiz de triagem (vermelho, laranja, amarelo, verde, azul, preto do protocolo) fora da etiqueta e do seletor de triagem; e nenhuma forma de triagem numa etiqueta genérica.
- **Don't** — nenhum significado só na cor: sem ponto colorido solto, sem linha tingida, sem texto que muda de cor para dizer estado.
- **Don't** — nenhuma interpretação clínica: sem alerta, sem sugestão de dose, sem cor ou ícone de "valor alterado", sem fluxograma, sem ordenar por gravidade por conta própria. A faixa do campo numérico é limite de digitação.
- **Don't** — nenhuma superfície rosa além da passagem de caso.
- **Don't** — carmim só em rejeição e erro (e no contorno do botão de perigo); nunca como destaque, marca ou decoração.
- **Don't** — nunca mude `font-size` no `<html>`; densidade e tema se aplicam em contêiner.
- **Don't** — nenhuma sombra em folha, campo, botão ou etiqueta; sombra projetada é só de diálogo e toast.
- **Don't** — nada de movimento com mola, quique, giro contínuo suave ou brilho deslizante; o sistema anda em 120 ms secos e em passos.
- **Don't** — nada de fonte por CDN nem ícone de outro conjunto; nada de ícone decorativo.
- **Don't** — não apague, esconda nem edite no lugar um evento; não use tinta colorida para marcar seleção.
- **Don't** — não use o rótulo em caixa-alta como sobretítulo decorativo acima de títulos; ele é rótulo de campo, de grupo, de coluna e de leitura.
