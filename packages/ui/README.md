# @medicalfield/ui

Design system do MedicalField: tokens, fontes embutidas e componentes React para o portal (BradPitt) e o app de campo (LuckyPatcher). O sistema — princípios, paleta com contraste medido, tipografia, regras e o que não fazer — está em [`DESIGN.md`](../../DESIGN.md), na raiz. O contexto de produto está em [`PRODUCT.md`](../../PRODUCT.md).

Direção visual: **a ficha em vias carbonadas**. Tema claro é a 1ª via (papel e tinta); tema escuro é o papel-carbono; a passagem de caso é a via rosa.

## Como um app consome

O pacote não tem etapa de build: os apps Vite importam o TypeScript e o CSS direto do fonte.

```jsonc
// apps/<app>/package.json
"dependencies": { "@medicalfield/ui": "*" }
```

```ts
// apps/<app>/vite.config.ts
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react(), tailwindcss()] });
```

```css
/* apps/<app>/src/estilos.css — só isto. O arquivo já traz o Tailwind v4, as fontes, os tokens e os componentes. */
@import '@medicalfield/ui/estilos.css';
```

```tsx
import './estilos.css';
import { aplicarTema, temaPreferido, Botao, LayoutApp } from '@medicalfield/ui';

aplicarTema(temaPreferido()); // grava data-tema="claro" | "escuro" no <html>
```

- **Não importe `tailwindcss` de novo** no CSS do app: `estilos.css` já importa.
- **Tema:** `data-tema="claro" | "escuro"` em qualquer elemento (um nível de aninhamento é suportado).
- **Densidade:** `data-contexto="campo"` liga alvos de 56 px, corpo de 17 px e rótulos de 12 px. `LayoutApp` já aplica; `LayoutPortal` aplica `portal` (36 px, 14 px, 11 px).
- **Utilitários do Tailwind** usam os mesmos tokens: `bg-papel`, `text-tinta-2`, `border-fio`, `text-campo`, `font-dados`, `rounded-1`. A paleta padrão do Tailwind foi desligada de propósito — só existem as cores do sistema.
- **Fontes:** Archivo Variable e Martian Mono Variable (SIL OFL) vêm de `@fontsource-variable/*` e são empacotadas pelo Vite. Nada é buscado em CDN.
- **Ícones:** `lucide-react`, sempre com `aria-hidden` quando há texto ao lado.

## Componentes

| Componente | Para quê |
| --- | --- |
| `Botao` | `variante`: `primario` (uma por tela), `secundario`, `fantasma`, `perigo`; `carregando`, `largo`, `somenteIcone` |
| `CampoTexto`, `Select` | Campo em caixa com rótulo no canto; `ajuda`, `erro`, `sufixo` |
| `CampoNumerico` | Entrada rápida de sinal vital: vírgula decimal, setas ↑/↓, `comPassos`, faixa `min`/`max` (devolve `null` fora dela) |
| `SeletorSegmentado` | Grupo de rádio; opção com `detalhe` (ex.: respostas do Glasgow) |
| `Checkbox`, `Chave` | Nativo estilizado; `Chave` é `role="switch"` |
| `Etiqueta` | Contorno em caixa-alta: `neutra`, `marca`, `carmim`, `cheia` |
| `EtiquetaTriagem`, `SeletorTriagem` | Bloco chapado + forma + palavra, por protocolo (`MANCHESTER`, `START`) |
| `SeloSync` | `local`, `enviando`, `confirmado`, `rejeitado`; `rotulo` troca o texto (e-mail), `somenteMarca` |
| `BarraConectividade` | Online/Offline, pendências, rejeitadas e a chave "Simular offline" |
| `LinhaDoTempo`, `ItemEvento` | Pauta numerada por tipo de evento; retificação cita o número; `estados`, `recenteId`, `invertida` |
| `PainelPassagemDeCaso` | A via rosa: resumo factual (`Resumo` do contrato) |
| `Secao` | Folha com cabeçalho; `rente` para tabela/linha do tempo |
| `Tabela`, `Paginacao` | Tabela densa com seleção por teclado, `carregando`, `vazio`; paginação por cursor |
| `Dialogo` | `<dialog>` nativo |
| `Toast`, `PilhaToasts`, `useToasts` | Avisos em bloco invertido; erro não some sozinho |
| `EstadoVazio`, `EstadoErro`, `Esqueleto` | Estados de lista e de carregamento |
| `FaixaDemonstrativa` | "DADOS DEMONSTRATIVOS — SEM VALIDADE CLÍNICA" (os layouts já incluem) |
| `LayoutPortal`, `LayoutApp`, `Marca` | Índice lateral + conteúdo; cabeçalho + tira de conectividade + barra inferior |

`EventoLinha` e `ResumoPassagem` são estruturalmente compatíveis com `Evento` e `Resumo` de `docs/contratos.md` §6 — passe os objetos da API direto. O pacote não depende de `@medicalfield/contratos`.

Classes utilitárias de tipografia: `mf-rotulo` (rótulo de ficha), `mf-dado` (mono tabular para hora, número, código), `mf-numeral` (numeral condensado), `mf-num` (tabular no texto), `mf-grade-campos` (campos vizinhos dividem o fio; `--mf-colunas`), `mf-invertido` (bloco com os tokens do tema oposto), `mf-so-leitor`.

## Regras que o código não impõe sozinho

- Bloco chapado em vermelho, laranja, amarelo, verde, azul ou preto é **só** `EtiquetaTriagem`.
- Rosa é só a passagem de caso. Carmim é só rejeição/erro (e a ação destrutiva).
- Os nomes de nível em `comDescricao` ("Muito urgente", "Imediato", "Expectante"…) são os convencionais de cada protocolo e **precisam de validação do responsável clínico**; sem a prop, a etiqueta mostra só a cor.
- `min`/`max` do `CampoNumerico` são limites de digitação, nunca avaliação. Não existe estado "valor alterado".
- Nunca defina `font-size` no `<html>`: toda a escala é em `rem`.

## Scripts

```bash
npm run vitrine   -w @medicalfield/ui   # página de vitrine em http://localhost:5190
npm run typecheck -w @medicalfield/ui
npm test          -w @medicalfield/ui   # comportamento dos componentes + contraste dos tokens
npm run capturas  -w @medicalfield/ui   # com a vitrine no ar: grava capturas/ e falha se houver erro no console
```

A vitrine aceita `?tema=claro|escuro` e `?vista=portal|app` (composição em tela cheia; `&offline` abre o app offline). `capturas` usa o Chrome instalado via `playwright-core` (`CANAL=msedge` para o Edge).

O teste de contraste lê os valores do próprio `tokens.css`/`base.css`: mudar uma cor para um par que não passa quebra o teste.

## Limitações conhecidas

- No tema claro, os blocos de triagem amarelo e laranja têm contraste de borda abaixo de 3:1 contra o papel (o rótulo interno passa AA; forma e palavra carregam o significado).
- O bloco invertido (tinta) é quase a mesma cor do preto do START; distinguem-se pela forma (cruz) e pela palavra.
- Temas aninhados funcionam em um nível.
- `Tabela` não ordena (a API pagina por cursor, sem parâmetro de ordenação).
- `.impeccable/` guarda o registro do processo de design (contrato de direção, evidências da revisão, `design.json`); não é consumido pelos apps.
