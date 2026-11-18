---
version: 1
slug: "vitrine-vitrine-tsx"
primary_target: "vitrine/Vitrine.tsx"
related_targets: []
---

# Vitrine do design system MedicalField

Escopo: `packages/ui` (tokens, componentes, vitrine com as duas composições: portal lista+detalhe e app de atendimento). Modo: **Operate**.
Público e trabalho: profissional em campo (registrar em segundos, de luva, sol/noite, sem rede) e equipe administrativa (conferir, gerar PDF, enviar e-mail). Restrições: brief do cliente em PRODUCT.md (Brand Commitments). Decisão em aberto: nenhuma resposta humana chegou à página de decisão; segue a direção sorteada.

## Direction contract

THESIS: o atendimento é uma ficha preenchida a tinta em vias carbonadas — nada se apaga, o erro é riscado e a entrada nova cita o número que corrige, e todo registro diz em quantas vias já existe. Recusa o painel de cartões azul e branco com métricas no topo.

OWN-WORLD: papel frio quase branco e tinta berinjela-preta em dois valores; violeta de tinta copiativa só no que está em curso ou pede ação — ação primária, link, foco e registro ainda não confirmado (seleção é bloco invertido de tinta); via rosa só na passagem de caso; carmim só em rejeição/erro; tema escuro é o papel-carbono. Campos em caixa de fio de 1 px com rótulo em caixa-alta condensada no canto; cantos de 2 px; sem sombra fora de sobreposições. Bloco chapado em matiz de triagem é exclusivo da triagem, sempre com forma e palavra. Estado de sync é marca em célula fixa: vazada, meia, cheia, riscada.

STORY: quem olha entende em um segundo se está gravando, o que já foi feito e em que ordem, e o que ainda não subiu; registra o próximo dado com um polegar.

FIRST VIEWPORT: (app, 390 px) faixa demonstrativa hachurada; cabeçalho com paciente e identificador curto da ficha (prefixo do UUID — o contrato não tem número de série); tira de conectividade de 48 px (bloco invertido quando offline, contagem de pendências, chave de simulação); grade 2×3 de campos numéricos em caixa com numerais de 32–44 px; ação primária violeta em largura total; abaixo, linha do tempo pautada numerada. (portal, 1440 px) índice lateral em papel com item atual em bloco invertido; livro de registros denso à esquerda, ficha aberta à direita com a via rosa no topo.

FORM: ficha de APH em papel autocopiativo — candidato 5 da lista ordenada; seed key dd18bb12. Interação assinatura: a entrada nova "bate" na linha (carimbo) e a marca de via muda de vazada para cheia ao confirmar. Gramática de movimento: 120 ms, seco, sem coreografia; marca "enviando" alterna em dois passos.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
