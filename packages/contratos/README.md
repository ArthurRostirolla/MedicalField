# @medicalfield/contratos

Esquemas **zod** e tipos TypeScript de tudo o que está em [`docs/contratos.md`](../../docs/contratos.md) (seções 2, 3, 5, 6 e 7): convenções HTTP, corpo e códigos de erro, DTOs do MikeBaguncinha, da DonaCida e do Jaiminho. Mudou o contrato? Mude o `.md` primeiro, depois aqui.

```ts
import { eventoEntradaSchema, CODIGOS_ERRO, type Ficha, type Sessao } from '@medicalfield/contratos';

const lido = eventoEntradaSchema.safeParse(corpo); // união discriminada por `tipo`, `dados` estrito
```

- `*Schema` valida; o tipo de mesmo nome (sem o sufixo) é o `z.infer` dele.
- Entradas são `strictObject`: campo desconhecido é rejeitado. Glasgow confere o `total`; triagem confere a classificação contra o protocolo; `retificaEventoId` só existe (e é obrigatório) em `RETIFICACAO`.
- `CODIGOS_ERRO`, `STATUS_POR_CODIGO`, `erroSchema` e `ehFalhaTransitoria(status)` (regra do outbox: 4xx definitivo, rede/5xx transitório).
- Sem dependência de Node: roda no navegador. Única dependência: `zod`.

## Como é consumido — sem build

`exports` aponta para o **fonte** (`src/index.ts`); não existe `dist`.

| Consumidor | Como lê o TypeScript |
| --- | --- |
| Vite (portal e app) e Vitest | transformam o fonte do workspace direto |
| DonaCida | o `esbuild` do serviço empacota este pacote junto (`npm run build -w @medicalfield/dona-cida`) |
| Scripts Node 24 | remoção de tipos nativa (`node arquivo.ts`) |

Por isso o código daqui usa só sintaxe "apagável" (sem `enum`, sem `namespace`, sem propriedade de parâmetro) e importa os vizinhos com a extensão `.ts`. No `tsconfig` de quem consome: `"moduleResolution": "Bundler"` (já é o do `tsconfig.base.json`).

## Comandos

```bash
npm run typecheck -w @medicalfield/contratos
npm test -w @medicalfield/contratos
```
