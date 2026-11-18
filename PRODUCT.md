# Product

<!-- impeccable:product-schema 1 -->

> Origem dos fatos: briefing do cliente, `docs/arquitetura/plano-arquitetural.md` (seções A, B, I) e `docs/contratos.md` (seções 6, 7). A entrevista do `impeccable init` não pôde ser feita ao vivo (execução por agente, sem ferramenta de pergunta); nada abaixo foi inventado além do que essas fontes afirmam. Itens marcados **[inferido]** são leitura do agente e podem ser corrigidos.

## Platform

web

## Stack

React 19 + TypeScript + Tailwind CSS v4 + Vite. O app do profissional é o mesmo código web empacotado com Capacitor (Android); a linguagem visual é web, não nativa. Fontes e ícones embutidos no pacote — nada de CDN em tempo de execução.

## Users

- **Profissional em campo** — médico (CRM), enfermagem (COREN), socorrista. Usa o app (codinome LuckyPatcher) dentro da ambulância ou na cena: pressa, luva, veículo em movimento, sol direto ou noite, rede instável ou inexistente. O trabalho: registrar sinais vitais, Glasgow, triagem e medicação no momento em que acontecem, e entregar o caso ao hospital sem perder informação.
- **Equipe administrativa/reguladora** — usa o portal (codinome BradPitt) em desktop, sentada, online, somente leitura: conferir atendimentos, cadastros de apoio e logs de acesso; gerar a ficha em PDF e enviá-la por e-mail.
- **Paciente ou familiar** — recebe a ficha em PDF por e-mail; não usa a interface.

## Product Purpose

Prontuário médico de emergência Offline-First para equipes pré-hospitalares. Gravar nunca depende de rede: toda escrita é local e sincroniza depois. Sucesso = o que foi feito na cena chega íntegro, na ordem e no horário reais, ao hospital e à regulação.

## Positioning

"A caixa-preta do atendimento pré-hospitalar." O atendimento não é um formulário preenchido no fim: é uma **linha do tempo imutável** de eventos carimbados com hora, profissional e dispositivo. Correção é um novo evento de retificação, nunca edição. Da linha do tempo saem, sem lógica nova, a **passagem de caso** e a **ficha em PDF verificável**. Cada registro mostra onde está: local, enviando, confirmado ou rejeitado.

## Operating Context

- App: celular primeiro (também no navegador, projetado em sala). Indicador permanente de Online/Offline e de pendências; seletor "Simular conectividade".
- Portal: listas densas (medicamentos, prontuários, atendimentos, logs de acesso), detalhe do atendimento com linha do tempo e passagem de caso, geração de PDF, envio de e-mail e situação do envio.
- Vocabulário do domínio: atendimento, ocorrência, evento, retificação, passagem de caso, triagem Manchester (vermelho, laranja, amarelo, verde, azul) e START (vermelho, amarelo, verde, preto), Glasgow (ocular/verbal/motora), sinais vitais (PA, FC, FR, SpO₂, temperatura, glicemia), outbox, pendência.
- Nomes na tela: o usuário vê "MedicalField"; BradPitt/LuckyPatcher são codinomes internos.

## Capabilities and Constraints

- O sistema **registra, não decide**: nenhum alerta clínico, sugestão de dose, interpretação de valor ou fluxograma. A cor de triagem é escolhida pelo profissional.
- Eventos são imutáveis; evento retificado continua visível, marcado.
- Portal é somente leitura para dado clínico.
- Todo dado de demonstração é fictício; tela e PDF exibem "DADOS DEMONSTRATIVOS — SEM VALIDADE CLÍNICA".
- Trabalho acadêmico (Univates, Arquiteturas de Software, 2026/B).

## Brand Commitments

Do cliente, vinculantes:
- Identidade reconhecível e deliberada. Proibido: dashboard genérico de SaaS, "interface médica azul e branca", gradiente azul/roxo, glassmorphism, cartões arredondados em excesso, enfeite sem função.
- Paleta distinta do convencional, sofisticada e apropriada a emergência.
- As cores de triagem são código clínico convencional: permanecem reconhecíveis e não se confundem com a marca nem com estados de interface.
- Cor nunca é o único portador de significado (triagem e sync levam rótulo e/ou ícone/forma).
- Ícones de um conjunto coerente; sem iconografia decorativa.
- Não há logotipo nem ativos de marca pré-existentes.

## Evidence on Hand

Nenhum dado real. Profissionais de demonstração fictícios definidos em `docs/contratos.md` §3 (Dra. Helena Prado, Enf. Caio Brandão, Soc. Lia Moura). Pacientes, atendimentos e medicamentos das vitrines são fictícios e rotulados como tal. Não há depoimentos, métricas ou clientes — não fabricar.

## Product Principles

1. **Gravar primeiro.** A interface nunca faz o profissional esperar a rede nem duvidar se salvou.
2. **O registro é a prova.** Hora, autor e situação de sincronização acompanham todo dado; nada é apagado, só retificado.
3. **Fato, não conselho.** Mostrar o que foi feito e quando; nunca interpretar.
4. **Uma mão, um olhar.** No campo, cada tela se resolve com um polegar de luva e uma olhada de um segundo.
5. **O código clínico é sagrado.** As cores de triagem pertencem ao protocolo, não à marca.

## Accessibility & Inclusion

WCAG 2.2 AA no mínimo em tudo; AAA (7:1) no texto principal do app de campo. Alvos de toque ≥ 48 px no app. Tema claro de alta legibilidade (sol) e tema escuro (noite na ambulância). Numerais tabulares em sinais vitais e horários. Teclado e foco visível em todos os componentes. Respeitar `prefers-reduced-motion`. **[inferido]** Daltonismo é relevante para triagem: por isso forma + rótulo além da cor.
